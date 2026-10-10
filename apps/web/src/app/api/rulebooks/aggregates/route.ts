import { RULEBOOK_BODY_LIMIT_BYTES } from '@/lib/server/guards';
import { apiError, apiOk, guardedJson } from '@/lib/server/http';
import { AggregatesBody } from '@/lib/server/rulebook-schema';
import { SUPABASE_SURFACE, supabaseRest, validDeviceId } from '@/lib/server/supabase';

const GUARD = { route: 'rulebooks-aggregates', surface: 'Supabase (cohort rule aggregates)', limit: 30 } as const;

export async function POST(request: Request): Promise<Response> {
  const body = await guardedJson(request, GUARD, RULEBOOK_BODY_LIMIT_BYTES);
  if (!body.ok) return body.response;
  const deviceId = request.headers.get('x-device-id');
  if (!validDeviceId(deviceId)) return apiError(GUARD.surface, 'Send a valid x-device-id header.', 400);
  const parsed = AggregatesBody.safeParse(body.value);
  if (!parsed.success) return apiError(GUARD.surface, 'Send {aggregates: [{rule, breaks, costDelta, intervalLo, intervalHi, historyLabel}]}, up to 50.', 400);
  const rest = supabaseRest();
  if (!rest) return apiError(SUPABASE_SURFACE, 'SUPABASE_URL or SUPABASE_ANON_KEY is not set on the server.', 503);

  const rows = parsed.data.aggregates.map((a) => ({
    device_id: deviceId,
    rule: a.rule,
    rule_type: a.rule.t,
    breaks: a.breaks,
    cost_delta: a.costDelta,
    interval_lo: a.intervalLo,
    interval_hi: a.intervalHi,
    history_label: a.historyLabel,
  }));
  try {
    const res = await rest.request('cohort_rule_aggregates', { method: 'POST', deviceId, body: rows, prefer: 'return=minimal' });
    if (!res.ok) {
      const detail = await res.text();
      return apiError(GUARD.surface, `Supabase answered HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`, 502);
    }
    return apiOk({ inserted: rows.length }, 201);
  } catch (e) {
    return apiError(GUARD.surface, e instanceof Error ? e.message : 'Supabase did not answer', 502);
  }
}
