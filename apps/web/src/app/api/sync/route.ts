import { BITGET_BASE_URL, forwardSignedGet } from '@holdout/bitget';
import { validateSyncRequest } from '@/lib/server/allowlist';
import { SMALL_BODY_LIMIT_BYTES } from '@/lib/server/guards';
import { apiError, guardedJson } from '@/lib/server/http';

const SURFACE = 'Bitget account read (S1, S2)';
const GUARD = { route: 'sync', surface: SURFACE, limit: 60 } as const;

export async function POST(request: Request): Promise<Response> {
  const body = await guardedJson(request, GUARD, SMALL_BODY_LIMIT_BYTES);
  if (!body.ok) return body.response;

  const checked = validateSyncRequest(body.value);
  if (!checked.ok) return apiError(SURFACE, checked.reason, 400);

  let upstream: Response;
  try {
    upstream = await forwardSignedGet(checked.request, { baseUrl: BITGET_BASE_URL });
  } catch (e) {
    return apiError(SURFACE, e instanceof Error ? `Bitget did not answer: ${e.message}` : 'Bitget did not answer', 502);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
