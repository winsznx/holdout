import {
  D,
  NO_REFERENCE,
  auditRule,
  ingest,
  ledgerFromFills,
  ledgerFromTrips,
  parseBitgetExport,
  parseMoneyBoysBacktest,
  parseMoneyBoysPaper,
  reconcile,
  runHoldout,
  similarTradeIndex,
  str,
  sum,
  tagTrip,
  ruleId,
  type CsvParse,
  type Context,
  type Fill,
  type Ledger,
  type Product,
  type RoundTrip,
  type Rule,
  type RuleAudit,
  type Session,
  type TripTags,
} from '@holdout/engine';
import type {
  BaseAnalysis,
  CandleStatus,
  CandleStore,
  CsvAdapter,
  DeskHistory,
  FundingLens,
  GroupStats,
  ImportReport,
  IngestSummary,
  LabeledGroup,
  SessionLens,
} from './types';

export const IN_BROWSER_COMMIT = 'in-browser-run';

export function detectAdapter(text: string): CsvAdapter | null {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  const fields = firstLine.split(',').map((f) => f.trim().replace(/^"|"$/g, ''));
  const has = (...cols: string[]) => cols.every((c) => fields.includes(c));
  if (has('tradeId', 'entryDate', 'exitDate', 'pnlUsd', 'entryTokenPrice')) return 'money-boys-backtest';
  if (has('timestamp', 'decision', 'fillPrice', 'filledQuantity', 'pnlUsd', 'orderId')) return 'money-boys-paper';
  const lower = fields.map((f) => f.toLowerCase());
  if (lower.includes('symbol') && lower.includes('price') && (lower.includes('time') || lower.includes('qty'))) return 'bitget-export';
  return null;
}

export class UnrecognizedCsvError extends Error {
  constructor(readonly fields: string[]) {
    super(`No adapter matches this header: ${fields.slice(0, 12).join(', ') || 'empty file'}`);
    this.name = 'UnrecognizedCsvError';
  }
}

export function summarizeIngest(fills: Fill[]): IngestSummary {
  const result = ingest(fills);
  const products: Partial<Record<Product, number>> = {};
  for (const f of result.fills) products[f.product] = (products[f.product] ?? 0) + 1;
  return { fillsIn: fills.length, fillsOut: result.fills.length, duplicatesDropped: result.duplicatesDropped, weakIdCount: result.weakIdCount, products };
}

export function parseCsvText(text: string): { adapter: CsvAdapter; history: DeskHistory; report: ImportReport } {
  const adapter = detectAdapter(text);
  if (!adapter) {
    const header = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
    throw new UnrecognizedCsvError(header.split(',').map((f) => f.trim()));
  }
  const parsed: CsvParse =
    adapter === 'money-boys-backtest' ? parseMoneyBoysBacktest(text) : adapter === 'money-boys-paper' ? parseMoneyBoysPaper(text) : parseBitgetExport(text);
  const history: DeskHistory =
    adapter === 'bitget-export'
      ? { fills: parsed.fills, funding: [], reference: [] }
      : { fills: parsed.fills, funding: [], reference: parsed.reference, dayLevel: true, trips: parsed.roundTrips };
  const summary = summarizeIngest(parsed.fills);
  const notes: string[] = [];
  if (adapter === 'bitget-export') {
    notes.push('The Bitget export adapter is untested against a live Bitget export.');
    notes.push('A Bitget CSV has no positions history, so the ledger cannot be reconciled to Bitget.');
    notes.push('A Bitget CSV has no funding rows, so funding is not included.');
  }
  if (adapter !== 'bitget-export') notes.push('Dates are day-level, so session, leverage and hard stop rules show not in this data.');
  return {
    adapter,
    history,
    report: { ...summary, rowsRead: parsed.rowsRead, issues: parsed.issues, adapter, untestedAgainstLiveExport: parsed.untestedAgainstLiveExport, notes },
  };
}

export function ledgerOfHistory(traderId: string, history: DeskHistory): Ledger {
  if (history.trips) return ledgerFromTrips(traderId, history.fills, history.trips);
  return ledgerFromFills(traderId, history.fills, history.funding, { fundingSettlements: history.fundingSettlements });
}

export function marketFromStore(candles: CandleStore): NonNullable<Context['market']> {
  return {
    markCandles: (symbol, fromTs, toTs) => {
      const bars = candles[symbol];
      if (!bars || bars.length === 0) return undefined;
      const slice = bars.filter((b) => b.ts >= fromTs - 60_000 && b.ts <= toTs);
      return slice.length > 0 ? slice : undefined;
    },
  };
}

export function buildContext(history: DeskHistory, candles: CandleStore): Context {
  const ctx: Context = { dayLevel: history.dayLevel === true };
  if (Object.keys(candles).length > 0) ctx.market = marketFromStore(candles);
  return ctx;
}

function groupOf(trips: RoundTrip[]): GroupStats {
  const wins = trips.filter((t) => D(t.netPnl).gt(0)).length;
  return {
    n: trips.length,
    net: str(sum(trips.map((t) => t.netPnl))),
    fees: str(sum(trips.map((t) => t.fees))),
    funding: str(sum(trips.map((t) => t.funding))),
    winRate: trips.length === 0 ? null : wins / trips.length,
  };
}

const SESSION_LABELS: Record<Session, string> = {
  pre_market: 'Pre-market (04:00 to 09:30 ET)',
  regular: 'Regular (09:30 to 16:00 ET)',
  after_hours: 'After hours (16:00 to 20:00 ET)',
  overnight: 'Overnight (20:00 to 04:00 ET)',
  weekend: 'Weekend',
  holiday: 'NYSE holiday',
  early_close: 'Early close window',
};

const SESSION_ORDER: Session[] = ['pre_market', 'regular', 'after_hours', 'overnight', 'weekend', 'holiday', 'early_close'];

export function sessionLensOf(ledger: Ledger, tags: Record<string, TripTags>, dayLevel: boolean, fromTrips: boolean): SessionLens {
  const trips = ledger.roundTrips;
  const stock = trips.filter((t) => t.product === 'stock_perp');
  const rtoken = trips.filter((t) => t.product === 'rtoken');
  const missing: string[] = [];
  if (stock.length === 0) missing.push('not in this data: no stock perp round trips');
  if (rtoken.length === 0) missing.push('not in this data: no rToken round trips');

  const fundingLens: FundingLens = (() => {
    if (fromTrips) return { records: 0, total: null, tripsWithFunding: 0, unavailableReason: 'not in this data: the strategy files have no funding records' };
    if (ledger.funding.length === 0) {
      return { records: 0, total: null, tripsWithFunding: 0, unavailableReason: 'not in this data: no funding records in this history (Bitget financial records, S2)' };
    }
    return {
      records: ledger.funding.length,
      total: str(sum(trips.map((t) => t.funding))),
      tripsWithFunding: trips.filter((t) => !D(t.funding).isZero()).length,
    };
  })();

  const premium = { available: false as const, reason: 'not in this data: premium index candles (Bitget market candles, S3) are not loaded for this history' };

  if (dayLevel) {
    return {
      unavailableReason: 'not in this data: timestamps are day-level, so session and hold tags cannot be computed',
      bySession: [],
      holds: [],
      productCompare: { stockPerp: stock.length > 0 ? groupOf(stock) : null, rtoken: rtoken.length > 0 ? groupOf(rtoken) : null, missing },
      funding: fundingLens,
      premium,
    };
  }

  const bySession: LabeledGroup[] = SESSION_ORDER.map((s) => {
    const members = trips.filter((t) => tags[t.id]?.session === s);
    return { key: s, label: SESSION_LABELS[s], ...groupOf(members) };
  }).filter((g) => g.n > 0);

  const holdDefs: { key: string; label: string; pick: (tag: TripTags) => boolean }[] = [
    { key: 'across_open', label: 'Held across the US open', pick: (g) => g.holdsAcrossOpen },
    { key: 'not_across_open', label: 'Closed before the next US open', pick: (g) => !g.holdsAcrossOpen },
    { key: 'across_weekend', label: 'Held across a weekend', pick: (g) => g.holdsAcrossWeekend },
    { key: 'into_friday_close', label: 'Opened in the last hour before Friday close', pick: (g) => g.intoFridayClose },
  ];
  const holds: LabeledGroup[] = holdDefs
    .map((d) => ({ key: d.key, label: d.label, ...groupOf(trips.filter((t) => { const g = tags[t.id]; return g ? d.pick(g) : false; })) }))
    .filter((g) => g.n > 0);

  return {
    bySession,
    holds,
    productCompare: { stockPerp: stock.length > 0 ? groupOf(stock) : null, rtoken: rtoken.length > 0 ? groupOf(rtoken) : null, missing },
    funding: fundingLens,
    premium,
  };
}

export interface AnalysisSeed {
  traderId: string;
  trips: RoundTrip[];
  ctx: Context;
}

export function candleStatusOf(trips: RoundTrip[], candles: CandleStore, ctx: Context): CandleStatus {
  const symbols = Object.keys(candles).length;
  if (symbols === 0) {
    return { coverage: 'none', symbols: 0, tripsCovered: 0, tripsTotal: trips.length, detail: 'Bitget mark candles (S3) are not loaded. The hard stop rule is untestable until they are.' };
  }
  const covered = trips.filter((t) => ctx.market?.markCandles?.(t.symbol, t.openTs, t.closeTs) !== undefined).length;
  return {
    coverage: covered === trips.length ? 'loaded' : 'partial',
    symbols,
    tripsCovered: covered,
    tripsTotal: trips.length,
    detail: `Mark candles cover ${covered} of ${trips.length} round trips.`,
  };
}

export function analyzeHistory(traderId: string, history: DeskHistory, candles: CandleStore): { base: BaseAnalysis; seed: AnalysisSeed } {
  const ctx = buildContext(history, candles);
  const ledger = ledgerOfHistory(traderId, history);
  const trips = ledger.roundTrips;
  const dayLevel = history.dayLevel === true;
  const tags: Record<string, TripTags> = {};
  if (!dayLevel) for (const t of trips) tags[t.id] = tagTrip(t);
  const reconciliation = history.reference.length > 0 ? reconcile(trips, history.reference) : NO_REFERENCE;
  const blocked = history.reference.length > 0 && !reconciliation.pass ? `Reconciliation to Bitget failed: ${reconciliation.reason ?? 'delta over the limit'}.` : null;
  const lastClose = trips.reduce((m, t) => Math.max(m, t.closeTs), 0);
  const holdout = blocked ? null : runHoldout(traderId, trips, ctx, IN_BROWSER_COMMIT, new Date(lastClose).toISOString());
  const base: BaseAnalysis = {
    computedAt: Date.now(),
    dayLevel,
    ledger,
    ingest: summarizeIngest(history.fills),
    reconciliation,
    tags,
    holdout,
    holdoutBlockedReason: blocked,
    sessionLens: sessionLensOf(ledger, tags, dayLevel, history.trips !== undefined),
    buckets: dayLevel ? [] : similarTradeIndex(trips),
    candles: candleStatusOf(trips, candles, ctx),
  };
  return { base, seed: { traderId, trips, ctx } };
}

export function auditAll(seed: AnalysisSeed, rules: Rule[]): Record<string, RuleAudit> {
  const out: Record<string, RuleAudit> = {};
  for (const rule of rules) out[ruleId(rule)] = auditRule(seed.traderId, seed.trips, rule, seed.ctx);
  return out;
}
