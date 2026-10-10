import { z } from 'zod';
import type { Product, Rulebook } from '@holdout/engine';
import type { IdeaInput } from './live';

const IdeaOut = z.object({
  idea: z.object({
    symbol: z.string(),
    side: z.enum(['long', 'short']),
    leverage: z.number(),
    product: z.enum(['perp', 'stock_perp', 'rtoken', 'stock_plus', 'spot']),
    time: z.string(),
  }),
});
const ClarifyOut = z.object({ clarify: z.string() });
const FailureOut = z.object({ ok: z.literal(false), error: z.object({ surface: z.string(), message: z.string() }) });

export type ParseOutcome =
  | { kind: 'idea'; idea: IdeaInput; via: 'llm' | 'rules' }
  | { kind: 'clarify'; question: string }
  | { kind: 'provider_error'; surface: string; message: string };

export async function parseIdeaRemote(text: string): Promise<ParseOutcome> {
  try {
    const res = await fetch('/api/llm/parse-idea', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    const raw: unknown = await res.json().catch(() => null);
    const failure = FailureOut.safeParse(raw);
    if (failure.success) return { kind: 'provider_error', surface: failure.data.error.surface, message: failure.data.error.message };
    const idea = IdeaOut.safeParse(raw);
    if (idea.success) return { kind: 'idea', idea: idea.data.idea, via: 'llm' };
    const clarify = ClarifyOut.safeParse(raw);
    if (clarify.success) return { kind: 'clarify', question: clarify.data.clarify };
    return { kind: 'provider_error', surface: 'OpenAI', message: 'The trade idea parser answered with a shape Holdout does not recognize.' };
  } catch (e) {
    return { kind: 'provider_error', surface: 'OpenAI', message: e instanceof Error ? e.message : 'The request failed' };
  }
}

const STOP = new Set(['LONG', 'SHORT', 'NOW', 'BUY', 'SELL', 'OPEN', 'PLACE', 'TRADE', 'PERP', 'SPOT', 'RTOKEN', 'THE', 'AND', 'AT', 'ON', 'IN', 'A', 'AN', 'FOR', 'ME', 'I', 'WITH', 'USING', 'STOCK']);
const QUOTE = /(USDT|USDC|USD)$/;

export function productFromHistory(book: Rulebook | null, symbol: string): Product | null {
  return book?.buckets.find((b) => b.symbol.replace(QUOTE, '') === symbol)?.product ?? null;
}

/** Strict reader used only when the LLM provider is down. It never fills in a missing field. */
export function parseIdeaStrict(text: string, book: Rulebook | null): ParseOutcome {
  const words = text.trim().split(/\s+/);
  const lower = text.toLowerCase();
  const side = /\blong\b|\bbuy\b/.test(lower) ? 'long' : /\bshort\b|\bsell\b/.test(lower) ? 'short' : null;
  const lev = /(\d+(?:\.\d+)?)\s*x\b/i.exec(text);
  const symbolWord = words.map((w) => w.replace(/[^A-Za-z0-9]/g, '')).find((w) => /^[A-Z][A-Z0-9]{1,14}$/.test(w) && !STOP.has(w));
  const symbol = symbolWord?.replace(QUOTE, '');
  const missing = [!side && 'long or short', !lev && 'leverage like 20x', !symbol && 'the symbol'].filter((m): m is string => typeof m === 'string');
  if (missing.length > 0 || !side || !lev || !symbol) {
    return { kind: 'clarify', question: `I could not read ${missing.join(', ')}. Write it like: long NVDA 20x now.` };
  }
  const explicit: Product | null = /\brtoken\b/.test(lower) ? 'rtoken' : /\bspot\b/.test(lower) ? 'spot' : /\bstock perp\b/.test(lower) ? 'stock_perp' : /\bperp\b/.test(lower) ? 'perp' : null;
  const product = explicit ?? productFromHistory(book, symbol);
  if (!product) return { kind: 'clarify', question: `Which product for ${symbol}: perp, stock perp, rToken or spot?` };
  const iso = /\d{4}-\d{2}-\d{2}T[\d:.]+Z?/.exec(text);
  return { kind: 'idea', via: 'rules', idea: { symbol, side, leverage: Number(lev[1]), product, time: iso ? iso[0] : 'now' } };
}
