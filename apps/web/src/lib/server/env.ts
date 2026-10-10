import { getCloudflareContext } from '@opennextjs/cloudflare';

export const ENV_NAMES = [
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'QWEN_API_KEY',
  'QWEN_BASE_URL',
  'QWEN_MODEL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'HOLDOUT_RULEBOOK_URL',
  'HOLDOUT_RULEBOOK_JSON',
] as const;

export type EnvName = (typeof ENV_NAMES)[number];
export type ServerEnv = Partial<Record<EnvName, string>>;

function cloudflareEnv(): Record<string, unknown> | null {
  try {
    return getCloudflareContext().env as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function serverEnv(): ServerEnv {
  const cf = cloudflareEnv();
  const out: ServerEnv = {};
  for (const name of ENV_NAMES) {
    const fromWorker = cf?.[name];
    const value = typeof fromWorker === 'string' && fromWorker !== '' ? fromWorker : process.env[name];
    if (value) out[name] = value;
  }
  return out;
}
