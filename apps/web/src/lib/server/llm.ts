import { ProviderError, configFromEnv, createClient, type LlmClient } from '@holdout/llm';
import { serverEnv, type ServerEnv } from './env';

export type ProviderLabel = 'OpenAI' | 'Qwen';

export function providerLabel(baseUrl: string | undefined, model: string | undefined): ProviderLabel {
  const host = baseUrl?.toLowerCase() ?? '';
  if (host.includes('bitgetops') || host.includes('dashscope') || host.includes('aliyun') || model?.toLowerCase().startsWith('qwen')) return 'Qwen';
  return 'OpenAI';
}

export type LlmHandle =
  | { ok: true; client: LlmClient; label: ProviderLabel; model: string }
  | { ok: false; label: ProviderLabel; message: string };

export function openLlm(env: ServerEnv = serverEnv()): LlmHandle {
  const primaryLabel = providerLabel(env.LLM_BASE_URL, env.LLM_MODEL);
  try {
    const config = configFromEnv(env, 'LLM');
    return { ok: true, client: createClient(config), label: primaryLabel, model: config.model };
  } catch (primary) {
    if (!(primary instanceof ProviderError)) throw primary;
    if (env.QWEN_API_KEY && env.QWEN_BASE_URL && env.QWEN_MODEL) {
      const config = configFromEnv(env, 'QWEN');
      return { ok: true, client: createClient(config), label: 'Qwen', model: config.model };
    }
    return { ok: false, label: primaryLabel, message: primary.message };
  }
}

export function providerFailureMessage(label: ProviderLabel, err: unknown): string {
  if (err instanceof ProviderError) return err.message.replace(/LLM provider "[^"]*"/, label);
  if (err instanceof Error) return `${label} returned an unusable answer: ${err.message}`;
  return `${label} failed`;
}
