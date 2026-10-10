export const CATEGORIES = ['SPOT', 'USDT-FUTURES', 'COIN-FUTURES', 'USDC-FUTURES'] as const;
const CANDLE_INTERVALS = ['1m', '3m', '5m', '15m', '30m', '1H', '4H', '6H', '12H', '1D'] as const;
const CANDLE_TYPES = ['market', 'mark', 'index', 'premium'] as const;

const SYMBOL = /^[A-Z0-9]{2,30}$/;
const INTEGER = /^\d{1,16}$/;

type ParamCheck = (value: string) => boolean;

interface ParamSpec {
  required: boolean;
  check: ParamCheck;
}

const oneOf = (values: readonly string[]): ParamCheck => (v) => values.includes(v);
const intInRange = (min: number, max: number): ParamCheck => (v) => INTEGER.test(v) && Number(v) >= min && Number(v) <= max;

interface MarketRoute {
  params: Record<string, ParamSpec>;
  ttlSeconds: (query: URLSearchParams, now: number) => number;
}

const candleParams: Record<string, ParamSpec> = {
  category: { required: true, check: oneOf(CATEGORIES) },
  symbol: { required: true, check: (v) => SYMBOL.test(v) },
  interval: { required: true, check: oneOf(CANDLE_INTERVALS) },
  type: { required: false, check: oneOf(CANDLE_TYPES) },
  startTime: { required: false, check: intInRange(0, 9_999_999_999_999) },
  endTime: { required: false, check: intInRange(0, 9_999_999_999_999) },
  limit: { required: false, check: intInRange(1, 1000) },
};

const DAY_MS = 86_400_000;

export const MARKET_ROUTES: Readonly<Record<string, MarketRoute>> = {
  'candles': {
    params: candleParams,
    ttlSeconds: (q, now) => {
      const end = Number(q.get('endTime'));
      return q.has('endTime') && end < now - 2 * DAY_MS ? 86_400 : 30;
    },
  },
  'history-candles': { params: candleParams, ttlSeconds: () => 3600 },
  'history-fund-rate': {
    params: {
      category: { required: true, check: oneOf(CATEGORIES.filter((c) => c !== 'SPOT')) },
      symbol: { required: true, check: (v) => SYMBOL.test(v) },
      cursor: { required: false, check: intInRange(1, 10_000) },
      limit: { required: false, check: intInRange(1, 100) },
    },
    ttlSeconds: () => 600,
  },
  'current-fund-rate': { params: { symbol: { required: true, check: (v) => SYMBOL.test(v) } }, ttlSeconds: () => 30 },
  'instruments': {
    params: {
      category: { required: true, check: oneOf(CATEGORIES) },
      symbol: { required: false, check: (v) => SYMBOL.test(v) },
    },
    ttlSeconds: () => 3600,
  },
  'tickers': {
    params: {
      category: { required: true, check: oneOf(CATEGORIES) },
      symbol: { required: false, check: (v) => SYMBOL.test(v) },
    },
    ttlSeconds: () => 5,
  },
};

export type MarketValidation =
  | { ok: true; upstreamPath: string; query: string; ttlSeconds: number }
  | { ok: false; reason: string };

export function validateMarketRequest(segments: readonly string[], params: URLSearchParams, now: number = Date.now()): MarketValidation {
  if (segments.length !== 1) return { ok: false, reason: 'path is not in the public market allowlist' };
  const name = segments[0] as string;
  const route = Object.hasOwn(MARKET_ROUTES, name) ? MARKET_ROUTES[name] : undefined;
  if (!route) return { ok: false, reason: `/api/v3/market/${name} is not in the public market allowlist` };

  const seen = new Set<string>();
  for (const [key, value] of params) {
    if (seen.has(key)) return { ok: false, reason: `parameter ${key} is repeated` };
    seen.add(key);
    const spec = Object.hasOwn(route.params, key) ? route.params[key] : undefined;
    if (!spec) return { ok: false, reason: `parameter ${key} is not allowed on ${name}` };
    if (!spec.check(value)) return { ok: false, reason: `parameter ${key} has an invalid value` };
  }
  for (const [key, spec] of Object.entries(route.params)) {
    if (spec.required && !seen.has(key)) return { ok: false, reason: `parameter ${key} is required on ${name}` };
  }
  const ordered = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = ordered.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return { ok: true, upstreamPath: `/api/v3/market/${name}`, query, ttlSeconds: route.ttlSeconds(params, now) };
}

export const SYNC_ALLOWED_PATHS: readonly string[] = [
  '/api/v3/trade/fills',
  '/api/v3/position/history-position',
  '/api/v3/account/financial-records',
  '/api/v3/tax/records',
  '/api/v3/account/assets',
  '/api/v2/spot/account/info',
];

const REQUIRED_SIGNED_HEADERS = ['ACCESS-KEY', 'ACCESS-SIGN', 'ACCESS-TIMESTAMP', 'ACCESS-PASSPHRASE'] as const;
const HEADER_VALUE = /^[\x21-\x7e]{1,512}$/;
const QUERY_STRING = /^[A-Za-z0-9_\-.=&%,:+]{0,2048}$/;

export interface SyncRequest {
  method: 'GET';
  path: string;
  query: string;
  headers: Record<string, string>;
}

export type SyncValidation = { ok: true; request: SyncRequest } | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateSyncRequest(body: unknown): SyncValidation {
  if (!isRecord(body)) return { ok: false, reason: 'body must be an object' };
  if (body.method !== 'GET') return { ok: false, reason: 'only GET requests are forwarded' };
  const path = body.path;
  if (typeof path !== 'string' || !SYNC_ALLOWED_PATHS.includes(path)) {
    return { ok: false, reason: 'path is not a read endpoint on the sync allowlist' };
  }
  const query = body.query ?? '';
  if (typeof query !== 'string' || !QUERY_STRING.test(query)) return { ok: false, reason: 'query must be a plain query string without the question mark' };
  if (!isRecord(body.headers)) return { ok: false, reason: 'headers must be an object' };

  const given = new Map<string, string>();
  for (const [name, value] of Object.entries(body.headers)) {
    if (typeof value !== 'string' || !HEADER_VALUE.test(value)) return { ok: false, reason: `header ${name} has an invalid value` };
    given.set(name.toUpperCase(), value);
  }
  const headers: Record<string, string> = {};
  for (const name of REQUIRED_SIGNED_HEADERS) {
    const value = given.get(name);
    if (value === undefined) return { ok: false, reason: `header ${name} is required` };
    headers[name] = value;
  }
  const paper = given.get('PAPTRADING');
  if (paper !== undefined) {
    if (paper !== '1') return { ok: false, reason: 'header paptrading must be 1 when present' };
    headers.paptrading = paper;
  }
  for (const name of given.keys()) {
    if (!(REQUIRED_SIGNED_HEADERS as readonly string[]).includes(name) && name !== 'PAPTRADING') {
      return { ok: false, reason: `header ${name} is not forwarded` };
    }
  }
  return { ok: true, request: { method: 'GET', path, query, headers } };
}
