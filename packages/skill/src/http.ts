import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { MISSING_RULEBOOK_MESSAGE, loadRulebookFromUrl, parseRulebookText, type RulebookLoad } from './rulebook-load.ts';
import { createHoldoutServer } from './server.ts';
import { createLiveMarketData, type MarketData } from './signals.ts';

export const RULEBOOK_URL_HEADER = 'x-holdout-rulebook-url';

export interface HoldoutHttpEnv {
  HOLDOUT_RULEBOOK_URL?: string;
  HOLDOUT_RULEBOOK_JSON?: string;
}

export interface HttpOverrides {
  marketData?: MarketData;
  fetchImpl?: typeof fetch;
}

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
  'access-control-allow-headers': `content-type, accept, mcp-protocol-version, mcp-session-id, ${RULEBOOK_URL_HEADER}`,
  'access-control-expose-headers': 'mcp-session-id',
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function rulebookLoader(request: Request, env: HoldoutHttpEnv, fetchImpl: typeof fetch): () => Promise<RulebookLoad> {
  const headerUrl = request.headers.get(RULEBOOK_URL_HEADER);
  return async () => {
    if (headerUrl !== null && headerUrl !== '') return loadRulebookFromUrl(headerUrl, fetchImpl);
    if (env.HOLDOUT_RULEBOOK_URL) return loadRulebookFromUrl(env.HOLDOUT_RULEBOOK_URL, fetchImpl);
    if (env.HOLDOUT_RULEBOOK_JSON) return parseRulebookText(env.HOLDOUT_RULEBOOK_JSON, 'HOLDOUT_RULEBOOK_JSON');
    return { ok: false, error: `${MISSING_RULEBOOK_MESSAGE} Over HTTP, send the ${RULEBOOK_URL_HEADER} header.` };
  };
}

export async function handleMcpRequest(
  request: Request,
  env: HoldoutHttpEnv = {},
  overrides: HttpOverrides = {},
): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  const fetchImpl = overrides.fetchImpl ?? ((input, init) => fetch(input, init));
  const server = createHoldoutServer({
    loadRulebook: rulebookLoader(request, env, fetchImpl),
    marketData: overrides.marketData ?? createLiveMarketData(),
  });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return withCors(await transport.handleRequest(request));
}
