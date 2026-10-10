import { z } from 'zod';
import { checkTrade, num, type EarningsEvent, type Product, type RoundTrip, type Rulebook, type TradeCheck, type CheckContext } from '@holdout/engine';

export interface IdeaInput {
  symbol: string;
  side: 'long' | 'short';
  leverage: number;
  product: Product;
  time: string;
}

export const STOCK_PRODUCTS: ReadonlySet<Product> = new Set(['stock_perp', 'rtoken', 'stock_plus']);

export type LiveEarnings =
  | { state: 'not_applicable'; note: string }
  | { state: 'unavailable'; surface: 'S5'; reason: string }
  | { state: 'available'; events: EarningsEvent[]; nextDate: string | null };

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

export type LiveSignals = { state: 'unavailable'; surface: 'S6'; reason: string } | { state: 'available'; readings: SignalReading[] };

const Unavailable = z.object({ unavailable: z.literal(true), surface: z.enum(['S5', 'S6']), reason: z.string() });
const EarningsOk = z.object({
  op: z.literal('earnings'),
  events: z.array(z.object({ eventTs: z.number(), knownAtTs: z.number(), date: z.string() })),
});
const SignalOk = z.object({
  op: z.literal('signal'),
  readings: z.array(
    z.object({
      source: z.string(),
      available: z.boolean(),
      tags: z.array(z.object({ label: z.string(), value: z.string() })),
      reason: z.string().nullable(),
    }),
  ),
});
const Failure = z.object({ ok: z.literal(false), error: z.object({ surface: z.string(), message: z.string() }) });

async function callBitgetMcp(op: 'earnings' | 'signal', symbol: string): Promise<unknown> {
  const res = await fetch('/api/mcp/bitget', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, symbol }) });
  return res.json().catch(() => null);
}

function failureReason(raw: unknown, fallback: string): string {
  const failure = Failure.safeParse(raw);
  return failure.success ? failure.data.error.message : fallback;
}

export function ideaTimeMs(time: string, now: number): number | null {
  if (time.trim().toLowerCase() === 'now') return now;
  const parsed = Date.parse(time);
  return Number.isNaN(parsed) ? null : parsed;
}

export function nextEarningsDate(events: EarningsEvent[], dated: { eventTs: number; date: string }[], at: number): string | null {
  const upcoming = dated.filter((e) => e.eventTs > at).sort((a, b) => a.eventTs - b.eventTs)[0];
  return events.length === 0 || !upcoming ? null : upcoming.date;
}

export async function fetchEarnings(idea: IdeaInput, at: number): Promise<LiveEarnings> {
  if (!STOCK_PRODUCTS.has(idea.product)) return { state: 'not_applicable', note: `Earnings do not apply to ${idea.product}.` };
  try {
    const raw = await callBitgetMcp('earnings', idea.symbol);
    const unavailable = Unavailable.safeParse(raw);
    if (unavailable.success) return { state: 'unavailable', surface: 'S5', reason: unavailable.data.reason };
    const ok = EarningsOk.safeParse(raw);
    if (!ok.success) return { state: 'unavailable', surface: 'S5', reason: failureReason(raw, 'bitget-mcp-server returned an answer Holdout could not read') };
    const events: EarningsEvent[] = ok.data.events.map((e) => ({ eventTs: e.eventTs, knownAtTs: e.knownAtTs }));
    return { state: 'available', events, nextDate: nextEarningsDate(events, ok.data.events, at) };
  } catch (e) {
    return { state: 'unavailable', surface: 'S5', reason: e instanceof Error ? e.message : 'request failed' };
  }
}

export async function fetchSignals(idea: IdeaInput): Promise<LiveSignals> {
  try {
    const raw = await callBitgetMcp('signal', idea.symbol);
    const unavailable = Unavailable.safeParse(raw);
    if (unavailable.success) return { state: 'unavailable', surface: 'S6', reason: unavailable.data.reason };
    const ok = SignalOk.safeParse(raw);
    if (!ok.success) return { state: 'unavailable', surface: 'S6', reason: failureReason(raw, 'bitget-signal returned an answer Holdout could not read') };
    return { state: 'available', readings: ok.data.readings };
  } catch (e) {
    return { state: 'unavailable', surface: 'S6', reason: e instanceof Error ? e.message : 'request failed' };
  }
}

const DAY_MS = 86_400_000;

export function deriveCheckContext(trips: RoundTrip[], at: number): Pick<CheckContext, 'lastLossClosedTs' | 'dayRealizedUsdt'> {
  const losses = trips.filter((t) => num(t.netPnl) < 0 && t.closeTs <= at);
  const lastLossClosedTs = losses.length === 0 ? undefined : Math.max(...losses.map((t) => t.closeTs));
  const dayStart = Math.floor(at / DAY_MS) * DAY_MS;
  const today = trips.filter((t) => t.closeTs >= dayStart && t.closeTs <= at);
  const dayRealizedUsdt = today.reduce((s, t) => s + num(t.netPnl), 0);
  return { lastLossClosedTs, dayRealizedUsdt };
}

export interface LiveCheck {
  idea: IdeaInput;
  at: number;
  check: TradeCheck;
  earnings: LiveEarnings;
  signals: LiveSignals;
}

export function evaluate(book: Rulebook, idea: IdeaInput, at: number, earnings: LiveEarnings, trips: RoundTrip[]): TradeCheck {
  return checkTrade(
    book,
    { symbol: idea.symbol, side: idea.side, leverage: idea.leverage, product: idea.product, time: at },
    { earnings: earnings.state === 'available' ? earnings.events : [], ...deriveCheckContext(trips, at) },
  );
}

export async function runLiveCheck(book: Rulebook, trips: RoundTrip[], idea: IdeaInput): Promise<LiveCheck | { error: string }> {
  const now = Date.now();
  const at = ideaTimeMs(idea.time, now);
  if (at === null) return { error: 'The time must be the word now or an ISO-8601 timestamp.' };
  const [earnings, signals] = await Promise.all([fetchEarnings(idea, at), fetchSignals(idea)]);
  return { idea, at, check: evaluate(book, idea, at, earnings, trips), earnings, signals };
}
