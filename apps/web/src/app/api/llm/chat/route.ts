import {
  ChatToolError,
  Firewall,
  NO_ORDERS_REPLY,
  ProviderError,
  runChat,
  type Card,
  type ChatMessage,
  type ChatTools,
  type TradeIdeaArgs,
} from '@holdout/llm';
import { checkTrade, type Product, type Rulebook, type RulebookRule } from '@holdout/engine';
import { LLM_BODY_LIMIT_BYTES } from '@/lib/server/guards';
import { apiError, apiOk, guardedJson } from '@/lib/server/http';
import { openLlm, providerFailureMessage } from '@/lib/server/llm';
import { ChatBody, type ChatContextValue } from '@/lib/server/schemas';

const GUARD = { route: 'llm', surface: 'Desk chat', limit: 30 } as const;

function rulesOnlyBook(rules: ChatContextValue['rules']): Rulebook {
  const mapped: RulebookRule[] = rules.map((r) => ({ id: r.id, rule: r.rule, rendered: r.rendered, status: r.status }));
  return {
    schema: 'holdout.rulebook.v1',
    version: 0,
    traderId: 'chat-context',
    label: 'chat context',
    createdAt: new Date(0).toISOString(),
    rules: mapped,
    buckets: [],
    ledger: { roundTrips: 0, reconciled: false, incomplete: false },
    sha256: '',
  };
}

function ideaTime(time: string): number {
  if (time.trim().toLowerCase() === 'now') return Date.now();
  const parsed = Date.parse(time);
  if (Number.isNaN(parsed)) throw new ChatToolError('time must be the word now or an ISO-8601 timestamp');
  return parsed;
}

function buildTools(context: ChatContextValue, ideas: TradeIdeaArgs[]): ChatTools {
  const book = rulesOnlyBook(context.rules);
  return {
    get_audit: async () => context.audit,
    get_proposals: async () => context.proposals,
    explain_rule: async ({ rule_id }) => context.explain[rule_id] ?? [],
    compare_sessions: async () => context.sessions,
    get_evidence: async () => context.evidence,
    check_trade: async (idea) => {
      const check = checkTrade(book, {
        symbol: idea.symbol.toUpperCase(),
        side: idea.side,
        leverage: idea.leverage,
        product: idea.product as Product,
        time: ideaTime(idea.time),
      });
      ideas.push(idea);
      const firstBroken = check.rules.find((r) => r.state === 'broken');
      const card: Card = {
        kind: 'check_trade_card',
        title: `Check ${idea.symbol.toUpperCase()}`,
        slots: {
          symbol: idea.symbol.toUpperCase(),
          violated: String(check.broken),
          rule_text: firstBroken ? firstBroken.rendered : 'no rule in the rulebook',
        },
      };
      return [card];
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  const body = await guardedJson(request, GUARD, LLM_BODY_LIMIT_BYTES);
  if (!body.ok) return body.response;
  const parsed = ChatBody.safeParse(body.value);
  if (!parsed.success) return apiError(GUARD.surface, 'Send {messages, context}. The last message must be from the user.', 400);

  const { messages, context } = parsed.data;
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') return apiError(GUARD.surface, 'The last message must be from the user.', 400);

  const llm = openLlm();
  if (!llm.ok) return apiError(llm.label, llm.message, 503);

  const history: ChatMessage[] = messages.slice(0, -1).map((m): ChatMessage => (m.role === 'user' ? { role: 'user', content: m.content } : { role: 'assistant', content: m.content }));
  const ideas: TradeIdeaArgs[] = [];
  const firewall = new Firewall();
  try {
    const result = await runChat(llm.client, buildTools(context, ideas), firewall, last.content, history);
    const text = ideas.length > 0 && !result.text.includes(NO_ORDERS_REPLY) ? `${NO_ORDERS_REPLY} ${result.text}` : result.text;
    return apiOk({
      provider: llm.label,
      model: llm.model,
      text,
      cards: result.cards,
      usedFallback: result.usedFallback,
      jobs: result.jobs,
      ideas,
      firewall: firewall.stats(),
    });
  } catch (e) {
    const status = e instanceof ProviderError ? 502 : 503;
    return apiError(llm.label, providerFailureMessage(llm.label, e), status);
  }
}
