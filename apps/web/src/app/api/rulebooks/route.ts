import { verifyRulebook, type Rulebook } from '@holdout/engine';
import { z } from 'zod';
import { RULEBOOK_BODY_LIMIT_BYTES } from '@/lib/server/guards';
import { apiError, apiOk, guardedJson, rateLimit } from '@/lib/server/http';
import { RulebookSchema } from '@/lib/server/rulebook-schema';
import { SUPABASE_SURFACE, isSha256, isUuid, supabaseRest, validDeviceId } from '@/lib/server/supabase';

const GUARD = { route: 'rulebooks', surface: SUPABASE_SURFACE, limit: 60 } as const;

const Body = z.object({ rulebook: RulebookSchema });

function deviceIdOf(request: Request): string | null {
  const header = request.headers.get('x-device-id');
  return validDeviceId(header) ? header : null;
}

async function upstreamError(res: Response): Promise<Response> {
  const detail = await res.text();
  return apiError(SUPABASE_SURFACE, `Supabase answered HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`, 502);
}

export async function GET(request: Request): Promise<Response> {
  const limited = rateLimit(request, GUARD);
  if (limited) return limited;
  const deviceId = deviceIdOf(request);
  if (!deviceId) return apiError(SUPABASE_SURFACE, 'Send a valid x-device-id header.', 400);
  const rest = supabaseRest();
  if (!rest) return apiError(SUPABASE_SURFACE, 'SUPABASE_URL or SUPABASE_ANON_KEY is not set on the server.', 503);

  try {
    const res = await rest.request(`saved_rulebooks?select=id,sha256,created_at,rulebook&device_id=eq.${encodeURIComponent(deviceId)}&order=created_at.desc&limit=50`, {
      method: 'GET',
      deviceId,
    });
    if (!res.ok) return await upstreamError(res);
    return apiOk({ rulebooks: (await res.json()) as unknown[] });
  } catch (e) {
    return apiError(SUPABASE_SURFACE, e instanceof Error ? e.message : 'Supabase did not answer', 502);
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await guardedJson(request, GUARD, RULEBOOK_BODY_LIMIT_BYTES);
  if (!body.ok) return body.response;
  const deviceId = deviceIdOf(request);
  if (!deviceId) return apiError(SUPABASE_SURFACE, 'Send a valid x-device-id header.', 400);
  const parsed = Body.safeParse(body.value);
  if (!parsed.success) return apiError(SUPABASE_SURFACE, 'Send {rulebook} in the holdout.rulebook.v1 shape.', 400);
  const rulebook = parsed.data.rulebook as unknown as Rulebook;
  if (!verifyRulebook(rulebook)) return apiError(SUPABASE_SURFACE, 'The rulebook hash does not match its contents, so it was not saved.', 422);
  const rest = supabaseRest();
  if (!rest) return apiError(SUPABASE_SURFACE, 'SUPABASE_URL or SUPABASE_ANON_KEY is not set on the server.', 503);

  try {
    const res = await rest.request('saved_rulebooks?on_conflict=device_id,sha256', {
      method: 'POST',
      deviceId,
      body: { device_id: deviceId, rulebook, sha256: rulebook.sha256 },
      prefer: 'resolution=ignore-duplicates,return=representation',
    });
    if (!res.ok) return await upstreamError(res);
    const rows = (await res.json()) as unknown[];
    return apiOk({ saved: rows.length > 0, duplicate: rows.length === 0, sha256: rulebook.sha256 }, rows.length > 0 ? 201 : 200);
  } catch (e) {
    return apiError(SUPABASE_SURFACE, e instanceof Error ? e.message : 'Supabase did not answer', 502);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const limited = rateLimit(request, GUARD);
  if (limited) return limited;
  const deviceId = deviceIdOf(request);
  if (!deviceId) return apiError(SUPABASE_SURFACE, 'Send a valid x-device-id header.', 400);
  const params = new URL(request.url).searchParams;
  const id = params.get('id');
  const sha = params.get('sha256');
  let filter: string;
  if (id !== null && isUuid(id)) filter = `id=eq.${id}`;
  else if (sha !== null && isSha256(sha)) filter = `sha256=eq.${sha}`;
  else return apiError(SUPABASE_SURFACE, 'Send ?id=<uuid> or ?sha256=<hash> of the rulebook to delete.', 400);
  const rest = supabaseRest();
  if (!rest) return apiError(SUPABASE_SURFACE, 'SUPABASE_URL or SUPABASE_ANON_KEY is not set on the server.', 503);

  try {
    const res = await rest.request(`saved_rulebooks?${filter}&device_id=eq.${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
      deviceId,
      prefer: 'return=representation',
    });
    if (!res.ok) return await upstreamError(res);
    const rows = (await res.json()) as unknown[];
    return apiOk({ deleted: rows.length });
  } catch (e) {
    return apiError(SUPABASE_SURFACE, e instanceof Error ? e.message : 'Supabase did not answer', 502);
  }
}
