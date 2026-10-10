import { describe, expect, it } from 'vitest';
import type { CursorPage } from '../src/http.ts';
import {
  DAY_MS,
  PrivateClient,
  classifyAuthorities,
  credentialsAuthorizer,
  drainCursor,
  fetchFillsRange,
  forwardSignedGet,
  splitWindows,
  type RawFill,
} from '../src/private.ts';
import { PublicClient, fetchCandlesRange, fetchFundingRateHistory, type FundingRatePoint } from '../src/public.ts';
import { BitgetError } from '../src/errors.ts';
import { fixture, jsonResponse, type Envelope } from './helpers.ts';

const fills = fixture<Envelope<CursorPage<RawFill>>>('fills').data.list;
const candleRows = fixture<Envelope<string[][]>>('candles-market').data;
const fundingRows = fixture<Envelope<{ resultList: FundingRatePoint[] }>>('history-fund-rate').data.resultList;

describe('splitWindows', () => {
  it('covers the range in contiguous windows no longer than the limit, oldest first', () => {
    const windows = splitWindows({ startTime: 0, endTime: 70 * DAY_MS }, 29 * DAY_MS);
    expect(windows).toHaveLength(3);
    expect(windows[0]?.startTime).toBe(0);
    expect(windows.at(-1)?.endTime).toBe(70 * DAY_MS);
    for (const [i, w] of windows.entries()) {
      expect(w.endTime - w.startTime).toBeLessThanOrEqual(29 * DAY_MS);
      if (i > 0) expect(w.startTime).toBe(windows[i - 1]?.endTime);
    }
  });

  it('returns no windows for an empty range', () => {
    expect(splitWindows({ startTime: 5, endTime: 5 }, 10)).toEqual([]);
  });
});

describe('drainCursor', () => {
  it('follows cursors until a short page', async () => {
    const pages = [fills.slice(0, 4), fills.slice(4, 8), fills.slice(8)];
    const seen: (string | undefined)[] = [];
    const rows = await drainCursor(
      async (cursor) => {
        seen.push(cursor);
        const index = cursor === undefined ? 0 : Number(cursor);
        return { list: pages[index] ?? [], cursor: String(index + 1) };
      },
      { pageSize: 4 },
    );
    expect(seen).toEqual([undefined, '1', '2']);
    expect(rows).toHaveLength(fills.length);
  });

  it('stops when the server repeats a cursor', async () => {
    let calls = 0;
    const rows = await drainCursor(
      async () => {
        calls += 1;
        return { list: fills.slice(0, 2), cursor: 'same' };
      },
      { pageSize: 2 },
    );
    expect(calls).toBe(2);
    expect(rows).toHaveLength(4);
  });

  it('throws a typed error when the page cap is exceeded', async () => {
    let n = 0;
    await expect(
      drainCursor(async () => ({ list: fills.slice(0, 2), cursor: String((n += 1)) }), { pageSize: 2, maxPages: 3 }),
    ).rejects.toBeInstanceOf(BitgetError);
  });
});

describe('empty windows', () => {
  it('treats the real list:null response as an empty page', async () => {
    const empty = fixture<Envelope<unknown>>('fills-empty-window');
    expect(empty.data).toEqual({ list: null, cursor: null });
    const client = new PrivateClient({
      authorize: async () => ({}),
      fetchImpl: async () => jsonResponse(empty),
    });
    const page = await client.getFillsPage({ category: 'USDT-FUTURES', startTime: 1, endTime: 2 });
    expect(page).toEqual({ list: [], cursor: '' });
    const rows = await fetchFillsRange(client, { category: 'USDT-FUTURES', range: { startTime: 1, endTime: 2 }, now: 3 });
    expect(rows).toEqual([]);
  });
});

describe('fetchFillsRange', () => {
  it('walks 30-day windows inside the 90-day horizon, dedupes by execId and signs each request', async () => {
    const now = 1791670526570 + DAY_MS;
    const calls: { url: URL; headers: Record<string, string> }[] = [];
    const fetchImpl = async (input: string, init?: RequestInit): Promise<Response> => {
      const url = new URL(input);
      calls.push({ url, headers: init?.headers as Record<string, string> });
      const start = Number(url.searchParams.get('startTime'));
      const end = Number(url.searchParams.get('endTime'));
      const inWindow = fills.filter((f) => Number(f.createdTime) >= start && Number(f.createdTime) <= end);
      return jsonResponse({ code: '00000', msg: 'success', data: { list: inWindow, cursor: 'c' } });
    };
    const client = new PrivateClient({
      authorize: credentialsAuthorizer({ apiKey: 'k', secret: 's', passphrase: 'p' }, { paper: true }),
      fetchImpl,
    });
    const out = await fetchFillsRange(client, {
      category: 'USDT-FUTURES',
      range: { startTime: now - 400 * DAY_MS, endTime: now },
      now,
    });
    expect(calls).toHaveLength(4);
    for (const call of calls) {
      const span = Number(call.url.searchParams.get('endTime')) - Number(call.url.searchParams.get('startTime'));
      expect(span).toBeLessThanOrEqual(30 * DAY_MS);
      expect(Number(call.url.searchParams.get('startTime'))).toBeGreaterThanOrEqual(now - 90 * DAY_MS);
      expect(call.headers['ACCESS-SIGN']).toBeTruthy();
      expect(call.headers.paptrading).toBe('1');
    }
    expect(out).toHaveLength(fills.length);
    expect(new Set(out.map((f) => f.execId)).size).toBe(fills.length);
    const times = out.map((f) => Number(f.createdTime));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('throws BitgetError carrying code, msg and endpoint when code is not 00000', async () => {
    const client = new PrivateClient({
      authorize: async () => ({}),
      fetchImpl: async () => jsonResponse({ code: '40014', msg: 'Incorrect permissions', data: null }, 400),
    });
    const error = await client.getFillsPage({ category: 'USDT-FUTURES', startTime: 1, endTime: 2 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BitgetError);
    expect(error).toMatchObject({ code: '40014', msg: 'Incorrect permissions', endpoint: '/api/v3/trade/fills', httpStatus: 400 });
  });
});

describe('fetchCandlesRange', () => {
  it('pages backwards from endTime in 100-bar pages and returns oldest first without gaps', async () => {
    const rows = candleRows;
    const small = rows.slice(0, 60);
    const requested: number[] = [];
    const fetchImpl = async (input: string): Promise<Response> => {
      const url = new URL(input);
      const end = Number(url.searchParams.get('endTime'));
      const limit = Number(url.searchParams.get('limit'));
      requested.push(end);
      const eligible = small.filter((r) => Number(r[0]) <= end);
      return jsonResponse({ code: '00000', msg: 'success', data: eligible.slice(-limit) });
    };
    const client = new PublicClient({ fetchImpl });
    const first = Number(small[0]?.[0]);
    const last = Number(small.at(-1)?.[0]);
    const out = await fetchCandlesRange(client, {
      category: 'USDT-FUTURES',
      symbol: 'BTCUSDT',
      interval: '1m',
      startTime: first,
      endTime: last,
      pageSize: 25,
    });
    expect(out).toHaveLength(60);
    expect(out.map((c) => c.ts)).toEqual(small.map((r) => Number(r[0])));
    expect(requested).toHaveLength(3);
    expect(out[0]?.open).toBe(small[0]?.[1]);
  });

  it('rejects an inverted range and oversize pages', async () => {
    const client = new PublicClient({ fetchImpl: async () => jsonResponse({ code: '00000', msg: '', data: [] }) });
    const base = { category: 'USDT-FUTURES', symbol: 'BTCUSDT', interval: '1m', startTime: 2, endTime: 1 } as const;
    await expect(fetchCandlesRange(client, base)).rejects.toBeInstanceOf(RangeError);
    await expect(fetchCandlesRange(client, { ...base, endTime: 3, pageSize: 5000 })).rejects.toBeInstanceOf(RangeError);
  });

  it('sends the candle type param for mark, index and premium series', async () => {
    const seen: (string | null)[] = [];
    const client = new PublicClient({
      fetchImpl: async (input) => {
        seen.push(new URL(input).searchParams.get('type'));
        return jsonResponse({ code: '00000', msg: '', data: candleRows.slice(0, 2) });
      },
    });
    for (const type of ['market', 'mark', 'index', 'premium'] as const) {
      await client.getCandles({ category: 'USDT-FUTURES', symbol: 'BTCUSDT', interval: '1m', type });
    }
    expect(seen).toEqual(['market', 'mark', 'index', 'premium']);
  });
});

describe('fetchFundingRateHistory', () => {
  it('pages by page number and filters by sinceTs, oldest first', async () => {
    const pagesRequested: string[] = [];
    const client = new PublicClient({
      fetchImpl: async (input) => {
        const page = new URL(input).searchParams.get('cursor') ?? '';
        pagesRequested.push(page);
        return jsonResponse({ code: '00000', msg: '', data: { resultList: fundingRows } });
      },
    });
    const since = Number(fundingRows[2]?.fundingRateTimestamp);
    const out = await fetchFundingRateHistory(client, { category: 'USDT-FUTURES', symbol: 'BTCUSDT', sinceTs: since });
    expect(pagesRequested).toEqual(['1']);
    expect(out.length).toBe(3);
    expect(Number(out[0]?.fundingRateTimestamp)).toBe(since);
  });
});

describe('key permissions and forwarding', () => {
  it('flags write authorities and never calls an unknown set read-only', () => {
    expect(classifyAuthorities(['uamw']).verdict).toBe('has_write');
    expect(classifyAuthorities(['trade']).verdict).toBe('has_write');
    expect(classifyAuthorities(['readonly']).verdict).toBe('read_only');
    expect(classifyAuthorities(['mystery']).verdict).toBe('unknown');
    expect(classifyAuthorities([]).verdict).toBe('unknown');
  });

  it('forwards only allowlisted headers on GET and refuses other methods and paths', async () => {
    let sent: Record<string, string> = {};
    const fetchImpl = async (_url: string, init?: RequestInit): Promise<Response> => {
      sent = init?.headers as Record<string, string>;
      return jsonResponse({ code: '00000', msg: '', data: [] });
    };
    await forwardSignedGet(
      { method: 'GET', path: '/api/v3/trade/fills', query: 'a=1', headers: { 'ACCESS-KEY': 'k', Cookie: 'x', 'x-evil': '1' } },
      { fetchImpl },
    );
    expect(Object.keys(sent)).toEqual(['ACCESS-KEY']);
    await expect(
      forwardSignedGet({ method: 'POST', path: '/api/v3/trade/place-order', query: '', headers: {} }, { fetchImpl }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      forwardSignedGet({ method: 'GET', path: '/api/v2/mix/order/place-order', query: '', headers: {} }, { fetchImpl }),
    ).rejects.toBeInstanceOf(RangeError);
  });
});
