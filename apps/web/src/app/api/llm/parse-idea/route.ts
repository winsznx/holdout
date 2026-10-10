import { parseIdea } from '@holdout/llm';
import { LLM_BODY_LIMIT_BYTES } from '@/lib/server/guards';
import { apiError, apiOk, guardedJson } from '@/lib/server/http';
import { openLlm, providerFailureMessage } from '@/lib/server/llm';
import { TextBody } from '@/lib/server/schemas';

const GUARD = { route: 'llm', surface: 'Trade idea parser', limit: 30 } as const;

export async function POST(request: Request): Promise<Response> {
  const body = await guardedJson(request, GUARD, LLM_BODY_LIMIT_BYTES);
  if (!body.ok) return body.response;
  const parsed = TextBody.safeParse(body.value);
  if (!parsed.success) return apiError(GUARD.surface, 'Send {text} with 1 to 1500 characters.', 400);

  const llm = openLlm();
  if (!llm.ok) return apiError(llm.label, llm.message, 503);
  try {
    const result = await parseIdea(llm.client, parsed.data.text);
    return apiOk({ provider: llm.label, model: llm.model, ...result });
  } catch (e) {
    return apiError(llm.label, providerFailureMessage(llm.label, e), 503);
  }
}
