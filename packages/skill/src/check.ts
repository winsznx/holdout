import {
  NYSE_2026,
  checkTrade,
  etParts,
  type Direction,
  type EarningsEvent,
  type Product,
  type Rulebook,
  type RuleCheck,
  type Session,
  type TradeCheck,
} from '@holdout/engine';
import { toEarningsEvents, underlyingOf } from './earnings.ts';
import type { MarketData, SignalTag } from './signals.ts';

export const EARNINGS_UNAVAILABLE = 'earnings calendar unavailable (S5)';
export const SIGNAL_UNAVAILABLE = 'signal unavailable (S6)';
export const DECISION_LINE = 'Holdout does not place orders. The decision is yours.';

export interface TradeInput {
  symbol: string;
  side: Direction;
  leverage: number;
  product?: Product;
  time?: number;
  lastLossClosedTs?: number;
  dayRealizedUsdt?: number;
  openPositionAdverse?: boolean;
}

export interface EarningsState {
  surface: 'S5';
  state: 'available' | 'unavailable' | 'not_applicable';
  summary: string;
  nextReportDate: string | null;
  hoursToNext: number | null;
}

export interface SignalState {
  surface: 'S6';
  state: 'available' | 'unavailable';
  summary: string;
  readings: Array<{ source: string; available: boolean; tags: SignalTag[]; reason: string | null }>;
}

export interface TradeCard {
  kind: 'holdout.check_trade.v1';
  rulebook: { label: string; version: number; sha256: string };
  idea: { symbol: string; side: Direction; leverage: number; product: Product; productAssumed: boolean; time: number; timeIso: string };
  sessionNow: Session;
  earnings: EarningsState;
  signal: SignalState;
  rules: RuleCheck[];
  broken: number;
  notCheckable: number;
  similar: TradeCheck['similar'];
  notices: string[];
  decision: string;
}

const EARNINGS_PRODUCTS: ReadonlySet<Product> = new Set(['stock_perp', 'rtoken', 'stock_plus']);

function resolveProduct(book: Rulebook, input: TradeInput): { product: Product; assumed: boolean; notice?: string } {
  if (input.product !== undefined) return { product: input.product, assumed: false };
  const known = book.buckets.find((b) => b.symbol === input.symbol);
  if (known) return { product: known.product, assumed: true, notice: `product not given, taken from your rulebook history for ${input.symbol}: ${known.product}` };
  return {
    product: 'perp',
    assumed: true,
    notice: `product not given and ${input.symbol} is not in your rulebook history, assumed perp. Pass product=stock_perp for a stock perp.`,
  };
}

async function loadEarnings(
  data: MarketData,
  product: Product,
  underlying: string,
  time: number,
): Promise<{ state: EarningsState; events: EarningsEvent[] }> {
  if (!EARNINGS_PRODUCTS.has(product)) {
    return {
      events: [],
      state: { surface: 'S5', state: 'not_applicable', summary: `earnings do not apply to ${product}`, nextReportDate: null, hoursToNext: null },
    };
  }
  const result = await data.getEarnings(underlying);
  if (!result.available) {
    return {
      events: [],
      state: { surface: 'S5', state: 'unavailable', summary: `${EARNINGS_UNAVAILABLE}: ${result.reason}`, nextReportDate: null, hoursToNext: null },
    };
  }
  const events = toEarningsEvents(result.data, time);
  const upcoming = events.filter((e) => e.eventTs > time).sort((a, b) => a.eventTs - b.eventTs)[0];
  if (!upcoming) {
    return {
      events,
      state: { surface: 'S5', state: 'available', summary: `S5 lists no upcoming earnings date for ${underlying}. This is coverage, not a clear calendar.`, nextReportDate: null, hoursToNext: null },
    };
  }
  return {
    events,
    state: {
      surface: 'S5',
      state: 'available',
      summary: `next earnings report ${upcoming.date} (S5)`,
      nextReportDate: upcoming.date,
      hoursToNext: null,
    },
  };
}

async function loadSignal(data: MarketData, underlying: string): Promise<SignalState> {
  const readings = await data.getSignals(underlying);
  const rows = readings.map((r) =>
    r.result.available
      ? { source: r.source, available: true, tags: r.result.data, reason: null }
      : { source: r.source, available: false, tags: [], reason: r.result.reason },
  );
  const anyAvailable = rows.some((r) => r.available && r.tags.length > 0);
  return {
    surface: 'S6',
    state: anyAvailable ? 'available' : 'unavailable',
    summary: anyAvailable ? 'live market tags from S6' : SIGNAL_UNAVAILABLE,
    readings: rows,
  };
}

function withEarningsNote(checks: RuleCheck[], book: Rulebook, earnings: EarningsState): RuleCheck[] {
  if (earnings.state !== 'unavailable') return checks;
  const earningsIds = new Set(book.rules.filter((r) => r.rule.t === 'earnings_blackout').map((r) => r.id));
  return checks.map((c) => (earningsIds.has(c.ruleId) && c.state === 'not_checkable' ? { ...c, reason: EARNINGS_UNAVAILABLE } : c));
}

export async function runCheckTrade(
  book: Rulebook,
  input: TradeInput,
  data: MarketData,
  now: () => number,
): Promise<TradeCard> {
  const time = input.time ?? now();
  const symbol = input.symbol.trim().toUpperCase();
  const underlying = underlyingOf(symbol);
  const { product, assumed, notice } = resolveProduct(book, { ...input, symbol });
  const notices: string[] = notice ? [notice] : [];
  if (etParts(time).date.slice(0, 4) !== '2026') {
    notices.push('The bundled NYSE calendar covers 2026 only. Session state outside 2026 ignores holidays.');
  }

  const [earningsLoad, signal] = await Promise.all([
    loadEarnings(data, product, underlying, time),
    loadSignal(data, underlying),
  ]);

  const check = checkTrade(
    book,
    { symbol, side: input.side, leverage: input.leverage, product, time },
    {
      calendar: NYSE_2026,
      earnings: earningsLoad.events,
      lastLossClosedTs: input.lastLossClosedTs,
      dayRealizedUsdt: input.dayRealizedUsdt,
      openPositionAdverse: input.openPositionAdverse,
    },
  );

  const earnings: EarningsState =
    check.earningsHours === null
      ? earningsLoad.state
      : { ...earningsLoad.state, hoursToNext: check.earningsHours, summary: `${earningsLoad.state.summary}, ${check.earningsHours.toFixed(1)} hours away` };

  const rules = withEarningsNote(check.rules, book, earnings);
  return {
    kind: 'holdout.check_trade.v1',
    rulebook: { label: book.label, version: book.version, sha256: book.sha256 },
    idea: { symbol, side: input.side, leverage: input.leverage, product, productAssumed: assumed, time, timeIso: new Date(time).toISOString() },
    sessionNow: check.sessionNow,
    earnings,
    signal,
    rules,
    broken: check.broken,
    notCheckable: rules.filter((r) => r.state === 'not_checkable').length,
    similar: check.similar,
    notices,
    decision: DECISION_LINE,
  };
}

export function renderTradeCard(card: TradeCard): string {
  const { idea } = card;
  const lines: string[] = [
    `Holdout check: ${idea.side} ${idea.symbol} ${idea.leverage}x (${idea.product}) at ${idea.timeIso}`,
    `Rulebook: ${card.rulebook.label} v${card.rulebook.version}, sha256 ${card.rulebook.sha256.slice(0, 12)}`,
    `Session now: ${card.sessionNow}`,
    '',
    `Rules broken: ${card.broken} of ${card.rules.length}${card.notCheckable > 0 ? `, ${card.notCheckable} not checkable` : ''}`,
  ];
  for (const r of card.rules) {
    lines.push(`  [${r.state}] ${r.rendered} (${r.reason})`);
  }
  lines.push('', `Earnings (S5): ${card.earnings.summary}`);
  lines.push(`Signal (S6): ${card.signal.summary}`);
  for (const reading of card.signal.readings) {
    if (reading.available) {
      lines.push(`  ${reading.source}: ${reading.tags.map((t) => `${t.label} ${t.value}`).join(', ')}`);
    } else {
      lines.push(`  ${reading.source}: ${SIGNAL_UNAVAILABLE}: ${reading.reason ?? 'no reason given'}`);
    }
  }
  const s = card.similar;
  if (s.found && s.winRate !== null && s.medianNet !== null && s.totalNet !== null) {
    lines.push(
      '',
      `Similar past trades: ${s.n} in bucket ${s.bucketId}`,
      `  win rate ${(s.winRate * 100).toFixed(0)}%, median net ${s.medianNet.toFixed(2)} USDT, total net ${s.totalNet.toFixed(2)} USDT`,
    );
  } else {
    lines.push('', `Similar past trades: none in bucket ${s.bucketId}`);
  }
  for (const n of card.notices) lines.push('', `Note: ${n}`);
  lines.push('', card.decision);
  return lines.join('\n');
}
