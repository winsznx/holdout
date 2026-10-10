export const LLM_BODY_LIMIT_BYTES = 16 * 1024;
export const SMALL_BODY_LIMIT_BYTES = 16 * 1024;
export const RULEBOOK_BODY_LIMIT_BYTES = 256 * 1024;

export type BodyResult = { ok: true; text: string } | { ok: false; status: 400 | 413; reason: string };

export async function readLimitedText(request: Request, maxBytes: number): Promise<BodyResult> {
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) return { ok: false, status: 413, reason: `body is larger than ${maxBytes} bytes` };
  }
  if (!request.body) return { ok: false, status: 400, reason: 'request body is empty' };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false, status: 413, reason: `body is larger than ${maxBytes} bytes` };
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(merged) };
}

export type JsonBodyResult = { ok: true; value: unknown } | { ok: false; status: 400 | 413; reason: string };

export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBodyResult> {
  const body = await readLimitedText(request, maxBytes);
  if (!body.ok) return body;
  try {
    return { ok: true, value: JSON.parse(body.text) as unknown };
  } catch {
    return { ok: false, status: 400, reason: 'body is not valid JSON' };
  }
}

export interface RateDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 5000,
  ) {}

  check(key: string, now: number = Date.now()): RateDecision {
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.prune(now);
      this.hits.set(key, { windowStart: now, count: 1 });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (entry.count >= this.limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.windowStart + this.windowMs - now) / 1000)) };
    }
    entry.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private prune(now: number): void {
    if (this.hits.size < this.maxKeys) return;
    for (const [key, entry] of this.hits) {
      if (now - entry.windowStart >= this.windowMs) this.hits.delete(key);
    }
    if (this.hits.size >= this.maxKeys) this.hits.clear();
  }
}

export function clientIp(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return (forwarded.split(',')[0] ?? '').trim() || 'unknown';
  return headers.get('x-real-ip')?.trim() || 'unknown';
}
