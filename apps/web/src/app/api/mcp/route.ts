import { handleMcpRequest } from '@holdout/skill';
import { serverEnv } from '@/lib/server/env';
import { apiError, rateLimit } from '@/lib/server/http';

const GUARD = { route: 'mcp', surface: 'Holdout MCP', limit: 60 } as const;

async function handle(request: Request): Promise<Response> {
  if (request.method !== 'OPTIONS') {
    const limited = rateLimit(request, GUARD);
    if (limited) return limited;
  }
  const env = serverEnv();
  try {
    return await handleMcpRequest(request, { HOLDOUT_RULEBOOK_URL: env.HOLDOUT_RULEBOOK_URL, HOLDOUT_RULEBOOK_JSON: env.HOLDOUT_RULEBOOK_JSON });
  } catch (e) {
    return apiError(GUARD.surface, e instanceof Error ? e.message : 'The MCP handler failed', 500);
  }
}

export { handle as GET, handle as POST, handle as DELETE, handle as OPTIONS };
