import { describe, expect, it } from 'vitest';
import { RateLimiter, clientIp, readJsonBody, readLimitedText } from './guards';

const post = (body: string, headers: Record<string, string> = {}) => new Request('http://x.test/', { method: 'POST', body, headers });

describe('readLimitedText', () => {
  it('reads a body within the limit', async () => {
    expect(await readLimitedText(post('{"a":1}'), 16)).toEqual({ ok: true, text: '{"a":1}' });
  });

  it('rejects a body over the limit without a content-length header', async () => {
    const big = 'x'.repeat(100);
    const res = await readLimitedText(post(big), 16);
    expect(res).toMatchObject({ ok: false, status: 413 });
  });

  it('rejects early when content-length already exceeds the limit', async () => {
    const res = await readLimitedText(post('hi', { 'content-length': '99999' }), 16);
    expect(res).toMatchObject({ ok: false, status: 413 });
  });

  it('counts bytes, not characters', async () => {
    const res = await readLimitedText(post('é'.repeat(10)), 16);
    expect(res).toMatchObject({ ok: false, status: 413 });
  });
});

describe('readJsonBody', () => {
  it('parses JSON and reports invalid JSON', async () => {
    expect(await readJsonBody(post('{"a":1}'), 100)).toEqual({ ok: true, value: { a: 1 } });
    expect(await readJsonBody(post('{nope'), 100)).toMatchObject({ ok: false, status: 400 });
  });
});

describe('RateLimiter', () => {
  it('allows up to the limit, then blocks until the window passes', () => {
    const limiter = new RateLimiter(2, 1000);
    expect(limiter.check('a', 0).allowed).toBe(true);
    expect(limiter.check('a', 10).allowed).toBe(true);
    const blocked = limiter.check('a', 20);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(limiter.check('a', 1000).allowed).toBe(true);
  });

  it('keeps keys independent', () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.check('a', 0).allowed).toBe(true);
    expect(limiter.check('b', 0).allowed).toBe(true);
    expect(limiter.check('a', 1).allowed).toBe(false);
  });

  it('stays bounded when many keys arrive', () => {
    const limiter = new RateLimiter(1, 1000, 3);
    for (let i = 0; i < 20; i += 1) limiter.check(`k${i}`, 0);
    expect(limiter.check('k19', 1).allowed).toBe(false);
    expect(limiter.check('fresh', 2000).allowed).toBe(true);
  });
});

describe('clientIp', () => {
  it('prefers the Cloudflare header, then the first forwarded address', () => {
    expect(clientIp(new Headers({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }))).toBe('1.2.3.4');
    expect(clientIp(new Headers({ 'x-forwarded-for': '5.6.7.8, 9.9.9.9' }))).toBe('5.6.7.8');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
