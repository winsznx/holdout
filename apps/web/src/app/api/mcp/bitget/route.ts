import { z } from 'zod';
import { SMALL_BODY_LIMIT_BYTES } from '@/lib/server/guards';
import { apiError, apiOk, guardedJson } from '@/lib/server/http';
import { MCP_OPS, readEarnings, readQuote, readSignals, underlyingOf } from '@/lib/server/bitget-mcp';

const GUARD = { route: 'mcp-bitget', surface: 'bitget-mcp-server (S5) and bitget-signal (S6)', limit: 30 } as const;

const Body = z.object({
  op: z.enum(MCP_OPS),
  symbol: z.string().trim().min(1).max(30),
});

const SYMBOL = /^[A-Z0-9]{1,20}$/;

function unavailable(surface: 'S5' | 'S6', reason: string) {
  return apiOk({ unavailable: true as const, surface, reason });
}

export async function POST(request: Request): Promise<Response> {
  const body = await guardedJson(request, GUARD, SMALL_BODY_LIMIT_BYTES);
  if (!body.ok) return body.response;
  const parsed = Body.safeParse(body.value);
  if (!parsed.success) return apiError(GUARD.surface, "Send {op: 'earnings' | 'quote' | 'signal', symbol}.", 400);

  const underlying = underlyingOf(parsed.data.symbol);
  if (!SYMBOL.test(underlying)) return apiError(GUARD.surface, 'symbol must be letters and digits only', 400);

  if (parsed.data.op === 'signal') {
    const readings = await readSignals(underlying);
    if (readings.every((r) => !r.available)) {
      return unavailable('S6', readings.map((r) => r.reason ?? `${r.source} unavailable`).join('; '));
    }
    return apiOk({ op: 'signal' as const, surface: 'S6' as const, symbol: underlying, readings });
  }

  if (parsed.data.op === 'earnings') {
    const result = await readEarnings(underlying, Date.now());
    if (!result.available) return unavailable('S5', result.reason);
    return apiOk({ op: 'earnings' as const, surface: 'S5' as const, symbol: underlying, events: result.data });
  }

  const quote = await readQuote(underlying);
  if (!quote.available) return unavailable('S5', quote.reason);
  return apiOk({ op: 'quote' as const, surface: 'S5' as const, symbol: underlying, quote: quote.data });
}
