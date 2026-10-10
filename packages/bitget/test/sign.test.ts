import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildQueryString, buildSignedHeaders, prehash, signRequest } from '../src/sign.ts';

const SECRET = 'test-secret-not-real';
const TS = '1791670526570';

describe('signRequest', () => {
  it('matches a known-answer vector computed with node:crypto', async () => {
    const query = 'category=USDT-FUTURES&limit=100';
    const expected = createHmac('sha256', SECRET)
      .update(`${TS}GET/api/v3/trade/fills?${query}`)
      .digest('base64');
    expect(expected).toBe('nSjncTHFqOF/eJZZnUXNw7C1o+JuYRRl7RIWZm8ZKX0=');
    const actual = await signRequest({ method: 'GET', path: '/api/v3/trade/fills', query, secret: SECRET, timestamp: TS });
    expect(actual).toBe(expected);
  });

  it('appends the body without a separator', async () => {
    const body = '{"symbol":"BTCUSDT"}';
    const actual = await signRequest({ method: 'POST', path: '/api/v3/trade/place-order', body, secret: SECRET, timestamp: TS });
    expect(actual).toBe('gKnqkFp6oao3dz1MUj0uW99KhJg5qBJbJfOlIlGR1DM=');
  });

  it('omits the question mark when the query is empty', () => {
    expect(prehash({ method: 'GET', path: '/a', query: '', timestamp: '1' })).toBe('1GET/a');
  });
});

describe('buildQueryString', () => {
  it('keeps insertion order, skips undefined and encodes values', () => {
    expect(buildQueryString({ b: 2, a: 'x y', skip: undefined })).toBe('b=2&a=x%20y');
  });
});

describe('buildSignedHeaders', () => {
  it('builds the five Bitget headers and paptrading only for paper mode', async () => {
    const credentials = { apiKey: 'k', secret: SECRET, passphrase: 'p' };
    const live = await buildSignedHeaders({ credentials, method: 'GET', path: '/x', query: 'a=1', timestamp: TS });
    expect(live['ACCESS-KEY']).toBe('k');
    expect(live['ACCESS-PASSPHRASE']).toBe('p');
    expect(live['ACCESS-TIMESTAMP']).toBe(TS);
    expect(live['ACCESS-SIGN']).toBe(createHmac('sha256', SECRET).update(`${TS}GET/x?a=1`).digest('base64'));
    expect(live.paptrading).toBeUndefined();
    const paper = await buildSignedHeaders({ credentials, method: 'GET', path: '/x', timestamp: TS, paper: true });
    expect(paper.paptrading).toBe('1');
  });
});
