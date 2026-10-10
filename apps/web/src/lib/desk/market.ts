import { BitgetError } from '@holdout/bitget/src/errors.ts';
import { INTERVAL_MS, PublicClient, fetchCandlesRange, type CandleInterval } from '@holdout/bitget/src/public.ts';
import type { RoundTrip } from '@holdout/engine';
import { kvGet, kvSet } from './persist';
import type { CandleBar, CandleStore } from './types';

const MARKET_PROXY = '/api/market';
const DAY_MS = 86_400_000;
const MERGE_GAP_MS = 3_600_000;
const CONCURRENCY = 3;
const MAX_PAGES_PER_WINDOW = 20;

export function marketProxyUrl(bitgetUrl: string): string {
  const u = new URL(bitgetUrl);
  const name = u.pathname.replace(/^\/api\/v3\/market\//, '');
  return `${MARKET_PROXY}/${name}${u.search}`;
}

export function proxiedPublicClient(): PublicClient {
  return new PublicClient({
    baseUrl: 'https://api.bitget.com',
    fetchImpl: (input, init) => fetch(marketProxyUrl(input), { ...init, headers: { accept: 'application/json' } }),
  });
}

export interface Window {
  symbol: string;
  from: number;
  to: number;
}

export function mergeWindows(trips: Pick<RoundTrip, 'symbol' | 'openTs' | 'closeTs'>[]): Window[] {
  const bySymbol = new Map<string, { from: number; to: number }[]>();
  for (const t of trips) {
    const list = bySymbol.get(t.symbol) ?? [];
    list.push({ from: t.openTs, to: t.closeTs });
    bySymbol.set(t.symbol, list);
  }
  const out: Window[] = [];
  for (const [symbol, list] of bySymbol) {
    list.sort((a, b) => a.from - b.from);
    let cur: { from: number; to: number } | null = null;
    for (const w of list) {
      if (cur && w.from - cur.to <= MERGE_GAP_MS) cur.to = Math.max(cur.to, w.to);
      else {
        if (cur) out.push({ symbol, ...cur });
        cur = { ...w };
      }
    }
    if (cur) out.push({ symbol, ...cur });
  }
  return out;
}

export function intervalFor(from: number, now: number): CandleInterval {
  return now - from <= 90 * DAY_MS ? '1m' : '5m';
}

export interface CandleLoadResult {
  store: CandleStore;
  windows: number;
  failed: number;
  firstError: string | null;
}

async function loadWindow(client: PublicClient, w: Window, now: number): Promise<CandleBar[]> {
  const interval = intervalFor(w.from, now);
  const key = `candles:${w.symbol}:${interval}:${w.from}:${w.to}`;
  const cached = await kvGet<CandleBar[]>(key);
  if (cached) return cached;
  const rows = await fetchCandlesRange(client, {
    category: 'USDT-FUTURES',
    symbol: w.symbol,
    interval,
    type: 'mark',
    startTime: w.from - INTERVAL_MS[interval],
    endTime: w.to,
    pageSize: 1000,
    source: now - w.from <= 30 * DAY_MS ? 'candles' : 'history-candles',
    maxPages: MAX_PAGES_PER_WINDOW,
  });
  const bars = rows.map((r) => ({ ts: r.ts, open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close) }));
  if (bars.length > 0) await kvSet(key, bars);
  return bars;
}

export async function loadMarkCandles(
  trips: RoundTrip[],
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<CandleLoadResult> {
  const windows = mergeWindows(trips);
  const client = proxiedPublicClient();
  const now = Date.now();
  const store: CandleStore = {};
  let done = 0;
  let failed = 0;
  let firstError: string | null = null;
  let cursor = 0;

  async function lane(): Promise<void> {
    while (cursor < windows.length && !signal.aborted) {
      const w = windows[cursor++];
      if (!w) return;
      try {
        const bars = await loadWindow(client, w, now);
        if (bars.length > 0) {
          const merged = new Map<number, CandleBar>((store[w.symbol] ?? []).map((b) => [b.ts, b]));
          for (const b of bars) merged.set(b.ts, b);
          store[w.symbol] = [...merged.values()].sort((a, b) => a.ts - b.ts);
        } else failed += 1;
      } catch (e) {
        failed += 1;
        firstError ??= e instanceof BitgetError ? `${e.endpoint}: ${e.code} ${e.msg}` : e instanceof Error ? e.message : 'candle request failed';
      }
      done += 1;
      onProgress(done, windows.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, windows.length) }, lane));
  return { store, windows: windows.length, failed, firstError };
}

export async function fetchStockSymbols(): Promise<string[] | null> {
  try {
    const list = await proxiedPublicClient().getInstruments('USDT-FUTURES');
    return list.filter((i) => i.symbolType === 'stock').map((i) => i.symbol);
  } catch {
    return null;
  }
}
