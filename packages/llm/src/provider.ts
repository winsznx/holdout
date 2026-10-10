export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export type EnvLike = Record<string, string | undefined>;

export class ProviderError extends Error {
  readonly provider: string;
  readonly status?: number;
  constructor(provider: string, message: string, status?: number) {
    super(`LLM provider "${provider}" unavailable: ${message}`);
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = status;
  }
}

function providerNameFromUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

export function configFromEnv(env: EnvLike, prefix: 'LLM' | 'QWEN' = 'LLM'): ProviderConfig {
  const baseUrl = env[`${prefix}_BASE_URL`];
  const apiKey = env[`${prefix}_API_KEY`];
  const model = env[`${prefix}_MODEL`];
  const missing = [
    !baseUrl && `${prefix}_BASE_URL`,
    !apiKey && `${prefix}_API_KEY`,
    !model && `${prefix}_MODEL`,
  ].filter((m): m is string => typeof m === 'string');
  if (!baseUrl || !apiKey || !model) {
    throw new ProviderError(prefix, `missing env ${missing.join(', ')}`);
  }
  return { name: providerNameFromUrl(baseUrl), baseUrl: baseUrl.replace(/\/+$/, ''), apiKey, model };
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: JsonSchema; strict?: boolean };
}

export type JsonSchema = { [key: string]: JsonValue };
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface JsonSchemaFormat {
  name: string;
  schema: JsonSchema;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  tools?: ToolDef[];
  responseFormat?: JsonSchemaFormat;
  maxCompletionTokens?: number;
}

export interface Completion {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: string;
  latencyMs: number;
}

export interface JobReport {
  job: string;
  provider: string;
  model: string;
  latencyMs: number;
}

export interface LlmClient {
  readonly config: Pick<ProviderConfig, 'name' | 'model'>;
  complete(req: CompletionRequest): Promise<Completion>;
}

interface WireResponse {
  choices?: {
    finish_reason?: string;
    message?: { content?: string | null; tool_calls?: ToolCall[] };
  }[];
  error?: { message?: string };
}

function isWireResponse(v: unknown): v is WireResponse {
  return typeof v === 'object' && v !== null;
}

type FetchLike = typeof fetch;

export function createClient(config: ProviderConfig, fetchImpl: FetchLike = fetch): LlmClient {
  return {
    config: { name: config.name, model: config.model },
    async complete(req) {
      const body: Record<string, unknown> = {
        model: config.model,
        messages: req.messages,
      };
      if (req.tools?.length) body.tools = req.tools;
      if (req.responseFormat) {
        body.response_format = {
          type: 'json_schema',
          json_schema: { name: req.responseFormat.name, strict: true, schema: req.responseFormat.schema },
        };
      }
      if (req.maxCompletionTokens) body.max_completion_tokens = req.maxCompletionTokens;

      const started = Date.now();
      let res: Response;
      try {
        res = await fetchImpl(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify(body),
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'network error';
        throw new ProviderError(config.name, reason);
      }
      const raw: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = isWireResponse(raw) && raw.error?.message ? raw.error.message : res.statusText;
        throw new ProviderError(config.name, `HTTP ${res.status}: ${detail}`, res.status);
      }
      if (!isWireResponse(raw) || !raw.choices?.[0]?.message) {
        throw new ProviderError(config.name, 'malformed response', res.status);
      }
      const choice = raw.choices[0];
      return {
        content: choice.message?.content ?? null,
        toolCalls: choice.message?.tool_calls ?? [],
        finishReason: choice.finish_reason ?? 'unknown',
        latencyMs: Date.now() - started,
      };
    },
  };
}

export function report(job: string, client: LlmClient, latencyMs: number): JobReport {
  return { job, provider: client.config.name, model: client.config.model, latencyMs };
}
