import type { Decimal as DecimalType } from 'decimal.js';
import type { RoundTrip } from '../types.ts';
import { D, num, str, sum, ZERO } from '../decimal.ts';
import { NYSE_2026, tagTrip, type Calendar, type EarningsEvent, type TripTags } from '../sessions.ts';
import type { Rule, RuleScope } from './schema.ts';

export interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MarketData {
  markCandles?: (symbol: string, fromTs: number, toTs: number) => Candle[] | undefined;
  rtokenCandles?: (symbol: string, fromTs: number, toTs: number) => Candle[] | undefined;
}

export interface Context {
  calendar?: Calendar;
  earnings?: Record<string, EarningsEvent[]>;
  market?: MarketData;
  defaultTakerFeeRate?: number;
  dayLevel?: boolean;
  disabled?: ('S3' | 'S4' | 'S5' | 'S7')[];
}

export type OutcomeKind = 'unchanged' | 'removed' | 'modified' | 'untestable';

export interface TripOutcome {
  tripId: string;
  kind: OutcomeKind;
  cfNet: string;
  note?: string;
}

export interface CounterfactualResult {
  rule: Rule;
  outcomes: TripOutcome[];
  affectedIds: string[];
  untestableIds: string[];
  delta: string;
  untestableRule: boolean;
  untestableReason?: string;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;

function inScope(trip: RoundTrip, scope: RuleScope): boolean {
  if (!scope) return true;
  if (scope.symbols && !scope.symbols.includes(trip.symbol)) return false;
  if (scope.products && !scope.products.includes(trip.product)) return false;
  if (scope.sides && !scope.sides.includes(trip.side)) return false;
  return true;
}

function unchanged(trip: RoundTrip): TripOutcome {
  return { tripId: trip.id, kind: 'unchanged', cfNet: trip.netPnl };
}

function removed(trip: RoundTrip): TripOutcome {
  return { tripId: trip.id, kind: 'removed', cfNet: '0' };
}

function byOpen(trips: RoundTrip[]): RoundTrip[] {
  return [...trips].sort((a, b) => a.openTs - b.openTs || (a.id < b.id ? -1 : 1));
}

function utcDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function priceGross(trip: RoundTrip, entryAvg: DecimalType, qty: DecimalType): DecimalType {
  const dir = trip.side === 'long' ? 1 : -1;
  return D(trip.avgExit).minus(entryAvg).times(qty).times(dir);
}

function exitFeeRate(trip: RoundTrip, fallback: number): DecimalType {
  const notional = sum(trip.exits.map((e) => D(e.qty).times(e.price)));
  if (notional.isZero()) return D(fallback);
  return sum(trip.exits.map((e) => e.fee)).div(notional);
}

function removalOutcomes(trips: RoundTrip[], violating: Set<string>): TripOutcome[] {
  return trips.map((t) => (violating.has(t.id) ? removed(t) : unchanged(t)));
}

function finish(rule: Rule, trips: RoundTrip[], outcomes: TripOutcome[], extra: Partial<CounterfactualResult> = {}): CounterfactualResult {
  const byId = new Map(trips.map((t) => [t.id, t]));
  const delta = sum(outcomes.map((o) => D(o.cfNet).minus((byId.get(o.tripId) as RoundTrip).netPnl)));
  return {
    rule,
    outcomes,
    affectedIds: outcomes.filter((o) => o.kind === 'removed' || o.kind === 'modified').map((o) => o.tripId),
    untestableIds: outcomes.filter((o) => o.kind === 'untestable').map((o) => o.tripId),
    delta: str(delta),
    untestableRule: false,
    ...extra,
  };
}

function untestableRule(rule: Rule, trips: RoundTrip[], reason: string): CounterfactualResult {
  return finish(rule, trips, trips.map(unchanged), { untestableRule: true, untestableReason: reason });
}

function findViolatingCooldown(trips: RoundTrip[], minutes: number, scope: RuleScope): Set<string> {
  const losses = trips.filter((t) => D(t.netPnl).lt(0)).sort((a, b) => a.closeTs - b.closeTs);
  const out = new Set<string>();
  for (const t of byOpen(trips)) {
    if (!inScope(t, scope)) continue;
    let last: RoundTrip | undefined;
    for (const l of losses) {
      if (l.closeTs <= t.openTs) last = l;
      else break;
    }
    if (last && t.openTs < last.closeTs + minutes * MINUTE) out.add(t.id);
  }
  return out;
}

function findViolatingDailyLimit(trips: RoundTrip[], usdt: number, scope: RuleScope): Set<string> {
  const out = new Set<string>();
  for (const t of byOpen(trips)) {
    if (!inScope(t, scope)) continue;
    const day = utcDay(t.openTs);
    const realized = sum(trips.filter((p) => p.closeTs <= t.openTs && utcDay(p.closeTs) === day).map((p) => p.netPnl));
    if (realized.lte(-usdt)) out.add(t.id);
  }
  return out;
}

function sessionBlocked(rule: Extract<Rule, { t: 'session_filter' }>, tags: TripTags): boolean {
  return rule.block.some((b) => {
    switch (b) {
      case 'overnight':
        return tags.session === 'overnight';
      case 'weekend':
        return tags.session === 'weekend' || tags.holdsAcrossWeekend;
      case 'holiday':
        return tags.session === 'holiday';
      case 'friday_close':
        return tags.intoFridayClose;
      case 'pre_market':
        return tags.session === 'pre_market';
      case 'after_hours':
        return tags.session === 'after_hours';
    }
  });
}

function underlyingOf(symbol: string): string {
  return symbol.replace(/^r/, '').replace(/USDT$/, '');
}

function hardStop(trip: RoundTrip, pct: number, ctx: Context): TripOutcome {
  const candles = ctx.market?.markCandles?.(trip.symbol, trip.openTs, trip.closeTs);
  if (!candles || candles.length === 0) return { tripId: trip.id, kind: 'untestable', cfNet: trip.netPnl, note: 'no mark candles' };
  const entry = D(trip.avgEntry);
  const long = trip.side === 'long';
  const stop = long ? entry.times(1 - pct / 100) : entry.times(1 + pct / 100);
  const sorted = [...candles].sort((a, b) => a.ts - b.ts);
  const barMs = sorted.length > 1 ? (sorted[1] as Candle).ts - (sorted[0] as Candle).ts : MINUTE;
  for (const bar of sorted) {
    if (bar.ts <= trip.openTs - 0 && bar.ts + barMs > trip.openTs) continue;
    if (bar.ts >= trip.closeTs) break;
    const hit = long ? bar.low <= stop.toNumber() : bar.high >= stop.toNumber();
    if (!hit) continue;
    const exitPx = D(long ? bar.low : bar.high);
    const qty = D(trip.qty);
    const dir = long ? 1 : -1;
    const gross = exitPx.minus(entry).times(qty).times(dir);
    const entryFees = sum(trip.entries.map((l) => l.fee));
    const exitFee = exitPx.times(qty).times(exitFeeRate(trip, ctx.defaultTakerFeeRate ?? 0.0006));
    const heldFrac = D(Math.max(bar.ts, trip.openTs) - trip.openTs).div(Math.max(1, trip.closeTs - trip.openTs));
    const funding = D(trip.funding).times(heldFrac);
    const cf = gross.minus(entryFees).minus(exitFee).plus(funding);
    return { tripId: trip.id, kind: 'modified', cfNet: str(cf), note: `stopped in bar ${bar.ts}` };
  }
  return unchanged(trip);
}

function noAddOutcome(trip: RoundTrip): TripOutcome {
  const bad = trip.entries.filter((l) => l.addedWhileLosing);
  if (bad.length === 0) return unchanged(trip);
  const keptEntries = trip.entries.filter((l) => !l.addedWhileLosing);
  const totalQty = D(trip.qty);
  const keptQty = sum(keptEntries.map((l) => l.qty));
  const keptCost = sum(keptEntries.map((l) => D(l.qty).times(l.price)));
  const keptAvg = keptQty.isZero() ? D(trip.avgEntry) : keptCost.div(keptQty);
  const fullGross = priceGross(trip, D(trip.avgEntry), totalQty);
  const keptGross = priceGross(trip, keptAvg, keptQty);
  const frac = totalQty.isZero() ? ZERO : keptQty.div(totalQty);
  const exitFees = sum(trip.exits.map((e) => e.fee));
  const keptFees = sum(keptEntries.map((l) => l.fee)).plus(exitFees.times(frac));
  const fullFees = sum(trip.entries.map((l) => l.fee)).plus(exitFees);
  const keptFunding = D(trip.funding).times(frac);
  const removedPart = fullGross.minus(keptGross).minus(fullFees.minus(keptFees)).plus(D(trip.funding).minus(keptFunding));
  return { tripId: trip.id, kind: 'modified', cfNet: str(D(trip.netPnl).minus(removedPart)), note: `${bad.length} added lot(s) removed` };
}

function maxLeverageOutcome(trip: RoundTrip, x: number): TripOutcome {
  if (trip.maxLeverage === undefined) return { tripId: trip.id, kind: 'untestable', cfNet: trip.netPnl, note: 'leverage not in data' };
  if (trip.maxLeverage <= x) return unchanged(trip);
  if (trip.liquidated) return { tripId: trip.id, kind: 'untestable', cfNet: trip.netPnl, note: 'liquidated trip needs mark replay' };
  const factor = D(x).div(trip.maxLeverage);
  return { tripId: trip.id, kind: 'modified', cfNet: str(D(trip.netPnl).times(factor)), note: `scaled by ${num(factor).toFixed(4)}` };
}

function productSwitchOutcome(trip: RoundTrip, ctx: Context, tags: TripTags): TripOutcome {
  const exposed = tags.holdsAcrossWeekend || tags.session === 'weekend' || tags.session === 'overnight';
  if (trip.product !== 'stock_perp' || !exposed) return unchanged(trip);
  if (trip.side === 'short') return { tripId: trip.id, kind: 'untestable', cfNet: trip.netPnl, note: 'spot rToken cannot be shorted' };
  const symbol = `r${underlyingOf(trip.symbol)}USDT`;
  const candles = ctx.market?.rtokenCandles?.(symbol, trip.openTs, trip.closeTs);
  if (!candles || candles.length === 0) return { tripId: trip.id, kind: 'untestable', cfNet: trip.netPnl, note: 'no rToken candles' };
  const sorted = [...candles].sort((a, b) => a.ts - b.ts);
  const first = sorted.find((c) => c.ts + (sorted[1] ? (sorted[1] as Candle).ts - (sorted[0] as Candle).ts : MINUTE) > trip.openTs) ?? (sorted[0] as Candle);
  const last = [...sorted].reverse().find((c) => c.ts <= trip.closeTs) ?? (sorted[sorted.length - 1] as Candle);
  const notional = D(trip.avgEntry).times(trip.qty);
  const entryPx = D(first.close).plus((first.high - first.low) / 2);
  const exitPx = D(last.close).minus((last.high - last.low) / 2);
  const rQty = notional.div(entryPx);
  const gross = exitPx.minus(entryPx).times(rQty);
  const feeRate = notional.isZero() ? ZERO : D(trip.fees).div(notional.times(2));
  const fees = notional.times(feeRate).plus(rQty.times(exitPx).times(feeRate));
  return { tripId: trip.id, kind: 'modified', cfNet: str(gross.minus(fees)), note: 'held as rToken spot at 1x' };
}

export function applyRule(trips: RoundTrip[], rule: Rule, ctx: Context = {}): CounterfactualResult {
  const calendar = ctx.calendar ?? NYSE_2026;
  if (ctx.dayLevel && ['session_filter', 'earnings_blackout', 'hard_stop', 'product_switch_weekend'].includes(rule.t)) {
    return untestableRule(rule, trips, 'not in this data: timestamps are day-level');
  }
  const off = ctx.disabled ?? [];
  const disabledSource: Partial<Record<Rule['t'], 'S3' | 'S4' | 'S5' | 'S7'>> = {
    hard_stop: 'S3',
    product_switch_weekend: 'S4',
    earnings_blackout: 'S5',
    session_filter: 'S7',
  };
  const needed = disabledSource[rule.t];
  if (needed && off.includes(needed)) return untestableRule(rule, trips, `source ${needed} disabled for the ablation run`);
  switch (rule.t) {
    case 'cooldown_after_loss':
      return finish(rule, trips, removalOutcomes(trips, findViolatingCooldown(trips, rule.minutes, rule.scope)));
    case 'daily_loss_limit':
      return finish(rule, trips, removalOutcomes(trips, findViolatingDailyLimit(trips, rule.usdt, rule.scope)));
    case 'no_add_to_loser':
      return finish(rule, trips, trips.map((t) => (inScope(t, rule.scope) ? noAddOutcome(t) : unchanged(t))));
    case 'session_filter': {
      const out = trips.map((t) => {
        if (!inScope(t, rule.scope) || !(rule.products as string[]).includes(t.product)) return unchanged(t);
        return sessionBlocked(rule, tagTrip(t, ctx.earnings?.[underlyingOf(t.symbol)] ?? [], calendar)) ? removed(t) : unchanged(t);
      });
      if (!trips.some((t) => (rule.products as string[]).includes(t.product))) {
        return untestableRule(rule, trips, 'not in this data: no stock perp or rToken trades');
      }
      return finish(rule, trips, out);
    }
    case 'earnings_blackout': {
      const stockTrips = trips.filter((t) => t.product === 'stock_perp' || t.product === 'rtoken');
      if (stockTrips.length === 0) return untestableRule(rule, trips, 'not in this data: no stock perp or rToken trades');
      const covered = stockTrips.some((t) => (ctx.earnings?.[underlyingOf(t.symbol)] ?? []).length > 0);
      if (!covered) return untestableRule(rule, trips, 'earnings calendar (S5) unavailable for these symbols');
      const out = trips.map((t) => {
        if (!inScope(t, rule.scope) || (t.product !== 'stock_perp' && t.product !== 'rtoken')) return unchanged(t);
        const w = tagTrip(t, ctx.earnings?.[underlyingOf(t.symbol)] ?? [], calendar).earningsWindowHours;
        return w !== null && w <= rule.hoursBefore ? removed(t) : unchanged(t);
      });
      return finish(rule, trips, out);
    }
    case 'max_leverage': {
      if (!trips.some((t) => t.maxLeverage !== undefined)) return untestableRule(rule, trips, 'leverage is not in this data');
      return finish(rule, trips, trips.map((t) => (inScope(t, rule.scope) ? maxLeverageOutcome(t, rule.x) : unchanged(t))));
    }
    case 'hard_stop': {
      if (!ctx.market?.markCandles) return untestableRule(rule, trips, 'Bitget mark candles (S3) unavailable');
      const out = trips.map((t) => (inScope(t, rule.scope) ? hardStop(t, rule.pct, ctx) : unchanged(t)));
      if (out.every((o) => o.kind === 'untestable')) return untestableRule(rule, trips, 'no mark candles for any trade window');
      return finish(rule, trips, out);
    }
    case 'product_switch_weekend': {
      if (!trips.some((t) => t.product === 'stock_perp')) return untestableRule(rule, trips, 'not in this data: no stock perp trades');
      if (!ctx.market?.rtokenCandles) return untestableRule(rule, trips, 'Bitget rToken candles (S4) unavailable');
      const out = trips.map((t) => (inScope(t, rule.scope) ? productSwitchOutcome(t, ctx, tagTrip(t, [], calendar)) : unchanged(t)));
      if (out.every((o) => o.kind === 'unchanged' || o.kind === 'untestable') && out.some((o) => o.kind === 'untestable')) {
        return untestableRule(rule, trips, 'no rToken candles for the exposed windows');
      }
      return finish(rule, trips, out);
    }
  }
}

export function counterfactual(trips: RoundTrip[], rules: Rule[], ctx: Context = {}): RoundTrip[] {
  let current = trips;
  for (const rule of rules) {
    const result = applyRule(current, rule, ctx);
    const outcomes = new Map(result.outcomes.map((o) => [o.tripId, o]));
    current = current.flatMap((t) => {
      const o = outcomes.get(t.id);
      if (!o || o.kind === 'unchanged' || o.kind === 'untestable') return [t];
      if (o.kind === 'removed') return [];
      return [{ ...t, netPnl: o.cfNet }];
    });
  }
  return current;
}

export function totalNet(trips: RoundTrip[]): string {
  return str(sum(trips.map((t) => t.netPnl)));
}

export const HOURS = HOUR;
