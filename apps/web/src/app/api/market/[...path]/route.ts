import { NextResponse } from 'next/server';
import { validateMarketRequest } from '@/lib/server/allowlist';
import { apiError, rateLimit } from '@/lib/server/http';

const SURFACE = 'Bitget public market data';
const UPSTREAM = 'https://api.bitget.com';
const GUARD = { route: 'market', surface: SURFACE, limit: 120 } as const;

interface WorkersCacheStorage extends CacheStorage {
  default?: Cache;
}

function edgeCache(): Cache | null {
  if (typeof caches === 'undefined') return null;
  return (caches as WorkersCacheStorage).default ?? null;
}

function isSuccessEnvelope(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && (parsed as { code?: unknown }).code === '00000';
  } catch {
    return false;
  }
}

export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const limited = rateLimit(request, GUARD);
  if (limited) return limited;

  const { path } = await ctx.params;
  const url = new URL(request.url);
  const checked = validateMarketRequest(path, url.searchParams);
  if (!checked.ok) return apiError(SURFACE, checked.reason, 400);

  const upstreamUrl = `${UPSTREAM}${checked.upstreamPath}${checked.query ? `?${checked.query}` : ''}`;
  const cacheKey = new Request(upstreamUrl, { method: 'GET' });
  const cache = edgeCache();
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, { headers: { locale: 'en-US' } });
  } catch (e) {
    return apiError(SURFACE, e instanceof Error ? `Bitget did not answer: ${e.message}` : 'Bitget did not answer', 502);
  }
  const text = await upstream.text();
  if (upstream.status >= 500) return apiError(SURFACE, `Bitget answered HTTP ${upstream.status}`, 502);

  const cacheable = upstream.ok && isSuccessEnvelope(text);
  const response = new NextResponse(text, {
    status: upstream.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheable ? `public, max-age=${checked.ttlSeconds}` : 'no-store',
    },
  });
  if (cache && cacheable) await cache.put(cacheKey, response.clone());
  return response;
}
