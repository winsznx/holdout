import { CARD_SPECS, Firewall, narrateCard } from '@holdout/llm';
import { LLM_BODY_LIMIT_BYTES } from '@/lib/server/guards';
import { apiError, apiOk, guardedJson } from '@/lib/server/http';
import { openLlm } from '@/lib/server/llm';
import { NarrateBody } from '@/lib/server/schemas';

const GUARD = { route: 'llm', surface: 'Card narrator', limit: 30 } as const;

export async function POST(request: Request): Promise<Response> {
  const body = await guardedJson(request, GUARD, LLM_BODY_LIMIT_BYTES);
  if (!body.ok) return body.response;
  const parsed = NarrateBody.safeParse(body.value);
  if (!parsed.success) return apiError(GUARD.surface, 'Send {card, slots} with a known card type and string slots.', 400);

  const { card, slots } = parsed.data;
  const missing = Object.keys(CARD_SPECS[card].slots).filter((name) => slots[name] === undefined);
  if (missing.length > 0) return apiError(GUARD.surface, `${card} is missing slots: ${missing.join(', ')}`, 400);

  const llm = openLlm();
  const firewall = new Firewall();
  const narration = await narrateCard(llm.ok ? llm.client : null, firewall, card, slots);
  const providerError = llm.ok ? (narration.providerError ?? null) : llm.message;
  const stats = providerError ? { passes: 0, failures: 0 } : firewall.stats();
  return apiOk({
    provider: llm.label,
    model: llm.ok ? llm.model : null,
    text: narration.text,
    usedFallback: narration.usedFallback,
    job: narration.job ?? null,
    providerError: providerError ? { surface: llm.label, message: providerError } : null,
    firewall: stats,
  });
}
