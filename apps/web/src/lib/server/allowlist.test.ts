import { describe, expect, it } from 'vitest';
import { validateMarketRequest, validateSyncRequest } from './allowlist';

const q = (s: string) => new URLSearchParams(s);
const NOW = 1_800_000_000_000;

describe('validateMarketRequest', () => {
  it('accepts a candle request and sorts the query', () => {
    const r = validateMarketRequest(['candles'], q('symbol=BTCUSDT&category=USDT-FUTURES&interval=1m'), NOW);
    expect(r).toEqual({ ok: true, upstreamPath: '/api/v3/market/candles', query: 'category=USDT-FUTURES&interval=1m&symbol=BTCUSDT', ttlSeconds: 30 });
  });

  it('caches old candle windows for a day', () => {
    const r = validateMarketRequest(['candles'], q(`symbol=BTCUSDT&category=USDT-FUTURES&interval=1H&endTime=${NOW - 5 * 86_400_000}`), NOW);
    expect(r.ok && r.ttlSeconds).toBe(86_400);
  });

  it.each([
    [['orders'], 'category=SPOT'],
    [['candles', 'extra'], 'symbol=BTCUSDT&category=SPOT&interval=1m'],
    [[], ''],
    [['constructor'], ''],
    [['__proto__'], ''],
  ])('rejects path %j', (path, query) => {
    expect(validateMarketRequest(path, q(query), NOW).ok).toBe(false);
  });

  it('rejects missing, unknown, repeated and malformed parameters', () => {
    expect(validateMarketRequest(['candles'], q('symbol=BTCUSDT&category=USDT-FUTURES'), NOW).ok).toBe(false);
    expect(validateMarketRequest(['candles'], q('symbol=BTCUSDT&category=USDT-FUTURES&interval=1m&apiKey=x'), NOW).ok).toBe(false);
    expect(validateMarketRequest(['tickers'], q('category=SPOT&category=SPOT'), NOW).ok).toBe(false);
    expect(validateMarketRequest(['candles'], q('symbol=btc/usdt&category=USDT-FUTURES&interval=1m'), NOW).ok).toBe(false);
    expect(validateMarketRequest(['candles'], q('symbol=BTCUSDT&category=USDT-FUTURES&interval=1m&limit=5000'), NOW).ok).toBe(false);
    expect(validateMarketRequest(['history-fund-rate'], q('symbol=BTCUSDT&category=SPOT'), NOW).ok).toBe(false);
  });
});

const signed = {
  'ACCESS-KEY': 'k',
  'ACCESS-SIGN': 'c2ln',
  'ACCESS-TIMESTAMP': '1800000000000',
  'ACCESS-PASSPHRASE': 'p',
};

describe('validateSyncRequest', () => {
  const base = { method: 'GET', path: '/api/v3/trade/fills', query: 'category=USDT-FUTURES&limit=100', headers: signed };

  it('accepts an allowlisted signed GET', () => {
    const r = validateSyncRequest({ ...base, headers: { ...signed, paptrading: '1' } });
    expect(r.ok && r.request.headers.paptrading).toBe('1');
  });

  it('refuses non-GET methods', () => {
    expect(validateSyncRequest({ ...base, method: 'POST' }).ok).toBe(false);
    expect(validateSyncRequest({ ...base, method: 'get' }).ok).toBe(false);
  });

  it.each(['/api/v3/trade/place-order', '/api/v3/trade/cancel-order', '/api/v3/account/transfer', '/api/v3/trade/fills/', '/api/v3/trade/fills/../place-order', '//api/v3/trade/fills'])(
    'refuses path %s',
    (path) => {
      expect(validateSyncRequest({ ...base, path }).ok).toBe(false);
    },
  );

  it('refuses a query that tries to add a second path or fragment', () => {
    expect(validateSyncRequest({ ...base, query: '?a=1' }).ok).toBe(false);
    expect(validateSyncRequest({ ...base, query: 'a=1#x' }).ok).toBe(false);
  });

  it('requires the four signed headers and refuses extras', () => {
    const partial = Object.fromEntries(Object.entries(signed).filter(([k]) => k !== 'ACCESS-SIGN'));
    expect(validateSyncRequest({ ...base, headers: partial }).ok).toBe(false);
    expect(validateSyncRequest({ ...base, headers: { ...signed, cookie: 'a=b' } }).ok).toBe(false);
    expect(validateSyncRequest({ ...base, headers: { ...signed, paptrading: '0' } }).ok).toBe(false);
    expect(validateSyncRequest({ ...base, headers: { ...signed, 'ACCESS-KEY': 'bad value' } }).ok).toBe(false);
  });
});
