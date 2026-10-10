import { NextResponse } from 'next/server';
import { RateLimiter, clientIp, readJsonBody } from './guards';

export interface ApiErrorBody {
  ok: false;
  error: { surface: string; message: string };
}

export function apiError(surface: string, message: string, status: number, headers?: HeadersInit): NextResponse<ApiErrorBody> {
  return NextResponse.json({ ok: false, error: { surface, message } }, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

export function apiOk<T extends object>(body: T, status = 200): NextResponse<T & { ok: true }> {
  return NextResponse.json({ ok: true, ...body }, { status, headers: { 'cache-control': 'no-store' } });
}

const limiters = new Map<string, RateLimiter>();

function limiterFor(route: string, limit: number, windowMs: number): RateLimiter {
  let limiter = limiters.get(route);
  if (!limiter) {
    limiter = new RateLimiter(limit, windowMs);
    limiters.set(route, limiter);
  }
  return limiter;
}

export interface RouteGuard {
  route: string;
  surface: string;
  limit: number;
  windowMs?: number;
}

export function rateLimit(request: Request, guard: RouteGuard): NextResponse<ApiErrorBody> | null {
  const decision = limiterFor(guard.route, guard.limit, guard.windowMs ?? 60_000).check(clientIp(request.headers));
  if (decision.allowed) return null;
  return apiError(guard.surface, `Too many requests. Try again in ${decision.retryAfterSeconds} seconds.`, 429, {
    'retry-after': String(decision.retryAfterSeconds),
  });
}

export async function guardedJson(
  request: Request,
  guard: RouteGuard,
  maxBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; response: NextResponse<ApiErrorBody> }> {
  const limited = rateLimit(request, guard);
  if (limited) return { ok: false, response: limited };
  const body = await readJsonBody(request, maxBytes);
  if (!body.ok) return { ok: false, response: apiError(guard.surface, body.reason, body.status) };
  return { ok: true, value: body.value };
}
