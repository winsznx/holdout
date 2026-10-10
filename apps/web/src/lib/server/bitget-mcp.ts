import {
  createS5Session,
  createS6Session,
  getEarningsCalendar,
  getFearGreed,
  getDerivativesSentiment,
  getTechnicalSignal,
  getUsStockQuote,
  type EarningsCalendarRow,
  type JsonObject,
  type McpSession,
  type SurfaceResult,
} from '@holdout/bitget';
import { etToUtc } from '@holdout/engine';

const TIMEOUT_MS = 10_000;
const QUOTE_SUFFIX = /(USDT|USDC|USD)$/;
const PRE_MARKET_LABEL = '盘前';

export const MCP_OPS = ['earnings', 'quote', 'signal'] as const;
export type McpOp = (typeof MCP_OPS)[number];

export function underlyingOf(symbol: string): string {
  return symbol.trim().toUpperCase().replace(QUOTE_SUFFIX, '');
}

export function timedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}

export interface EarningsEventRow {
  eventTs: number;
  knownAtTs: number;
  date: string;
}

function reportDate(row: EarningsCalendarRow): string | null {
  return (
    row.perf_report_dsclsr_date ??
    row.perf_brief_dsclsr_date ??
    row.perf_briefing_fore_dsclsr_date ??
    row.perf_report_fore_dsclsr_date ??
    null
  );
}

export function earningsEvents(rows: EarningsCalendarRow[], knownAtTs: number): EarningsEventRow[] {
  const events: EarningsEventRow[] = [];
  for (const row of rows) {
    const date = reportDate(row);
    if (date === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const minutes = row.is_trading_time === PRE_MARKET_LABEL ? 8 * 60 : 16 * 60;
    events.push({ eventTs: etToUtc(date, minutes), knownAtTs, date });
  }
  return events;
}

export interface SignalTag {
  label: string;
  value: string;
}

export interface SignalReading {
  source: string;
  available: boolean;
  tags: SignalTag[];
  reason: string | null;
}

function isRecord(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function scalar(v: unknown): string | undefined {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : undefined;
}

function pick(source: unknown, path: string[]): string | undefined {
  let cursor: unknown = source;
  for (const key of path) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[key];
  }
  return scalar(cursor);
}

function tagsFrom(source: unknown, spec: ReadonlyArray<{ label: string; path: string[] }>): SignalTag[] {
  const tags: SignalTag[] = [];
  for (const { label, path } of spec) {
    const value = pick(source, path);
    if (value !== undefined) tags.push({ label, value });
  }
  return tags;
}

const TECHNICAL_TAGS = [
  { label: 'RSI', path: ['rsi', 'rsi'] },
  { label: 'RSI signal', path: ['rsi', 'signal'] },
  { label: 'MACD cross', path: ['macd', 'cross'] },
  { label: 'MA trend', path: ['ma', 'trend'] },
  { label: 'ATR %', path: ['atr', 'atr_pct'] },
  { label: 'Verdict', path: ['verdict'] },
];

const TICKER_TAGS = [
  { label: 'Last', path: ['last'] },
  { label: '24h change %', path: ['change_pct'] },
  { label: '24h quote volume', path: ['quote_volume'] },
];

function reading(source: string, result: SurfaceResult<SignalTag[]>): SignalReading {
  if (!result.available) return { source, available: false, tags: [], reason: result.reason };
  if (result.data.length === 0) return { source, available: false, tags: [], reason: `${source}: the response had none of the fields Holdout reads` };
  return { source, available: true, tags: result.data, reason: null };
}

function flatTags(data: JsonObject, limit = 4): SignalTag[] {
  return Object.entries(data)
    .flatMap(([label, value]) => {
      const s = scalar(value);
      return s === undefined ? [] : [{ label, value: s }];
    })
    .slice(0, limit);
}

async function tickerTags(session: McpSession, pair: string): Promise<SurfaceResult<SignalTag[]>> {
  const called = await session.callJson('crypto_derivatives', { action: 'ticker_24h', exchange: 'bitget', symbol: pair });
  if (!called.available) return called;
  return { available: true, surface: 'S6', data: tagsFrom(called.data, TICKER_TAGS) };
}

export async function readSignals(underlying: string): Promise<SignalReading[]> {
  const session = createS6Session({ fetchImpl: timedFetch });
  const pair = `${underlying}/USDT`;
  try {
    const [technical, ticker, fearGreed, longShort] = await Promise.all([
      getTechnicalSignal(session, { symbol: pair }),
      tickerTags(session, pair),
      getFearGreed(session),
      getDerivativesSentiment(session, { action: 'long_short', symbol: `${underlying}USDT` }),
    ]);
    const technicalTags: SurfaceResult<SignalTag[]> = technical.available
      ? { available: true, surface: 'S6', data: tagsFrom(technical.data, TECHNICAL_TAGS) }
      : technical;
    const fearTags: SurfaceResult<SignalTag[]> = fearGreed.available ? { available: true, surface: 'S6', data: flatTags(fearGreed.data) } : fearGreed;
    const lsTags: SurfaceResult<SignalTag[]> = longShort.available ? { available: true, surface: 'S6', data: flatTags(longShort.data) } : longShort;
    return [
      reading('technical_analysis', technicalTags),
      reading('crypto_derivatives', ticker),
      reading('sentiment_index', fearTags),
      reading('derivatives_sentiment', lsTags),
    ];
  } finally {
    await session.close().catch(() => undefined);
  }
}

export async function readEarnings(underlying: string, now: number): Promise<SurfaceResult<EarningsEventRow[]>> {
  const session = createS5Session({ fetchImpl: timedFetch });
  try {
    const result = await getEarningsCalendar(session, { symbol: underlying });
    if (!result.available) return result;
    return { available: true, surface: 'S5', data: earningsEvents(result.data, now) };
  } finally {
    await session.close().catch(() => undefined);
  }
}

export async function readQuote(underlying: string) {
  const session = createS5Session({ fetchImpl: timedFetch });
  try {
    return await getUsStockQuote(session, underlying);
  } finally {
    await session.close().catch(() => undefined);
  }
}
