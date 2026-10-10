import { z } from 'zod';
import { Firewall, type Slots } from './firewall.ts';
import {
  report,
  type ChatMessage,
  type JobReport,
  type JsonSchema,
  type LlmClient,
  type ToolCall,
  type ToolDef,
} from './provider.ts';
import type { NarratedCardType } from './narrator.ts';

export type CardKind = NarratedCardType | 'explain_rule_card' | 'compare_sessions_card' | 'evidence_card';

const CARD_KINDS: readonly CardKind[] = [
  'audit_rule_card',
  'proposal_card',
  'check_trade_card',
  'null_result_card',
  'explain_rule_card',
  'compare_sessions_card',
  'evidence_card',
];

/** Aggregate-only engine card. Slot values are engine-formatted strings, never raw fills. */
export interface Card {
  kind: CardKind;
  title: string;
  slots: Readonly<Record<string, string>>;
}

export interface TradeIdeaArgs {
  symbol: string;
  side: 'long' | 'short';
  leverage: number;
  product: 'perp' | 'stock_perp' | 'rtoken' | 'stock_plus' | 'spot';
  time: string;
}

export interface ChatTools {
  get_audit(): Promise<Card[]>;
  get_proposals(): Promise<Card[]>;
  explain_rule(args: { rule_id: string }): Promise<Card[]>;
  check_trade(args: TradeIdeaArgs): Promise<Card[]>;
  compare_sessions(args: { session_a: string; session_b: string }): Promise<Card[]>;
  get_evidence(args: { topic: string }): Promise<Card[]>;
}

export const NO_ORDERS_REPLY = "Holdout doesn't place orders. Here's what your rulebook says.";

export const CHAT_SYSTEM_PROMPT = `You are the Holdout desk assistant. Holdout turns a trader's own fills into a rulebook tested on trades it never saw.

Rules you never break:
1. Holdout never places orders. When the user asks you to trade, buy, sell, open, close or place anything, your answer is exactly: "${NO_ORDERS_REPLY}" and you call check_trade with the idea they described. If the idea is missing a field, ask one short question instead of calling the tool.
2. You never compute, estimate or recall numbers. You never write a digit. Numbers appear only in cards, which the app shows next to your text.
3. To refer to a number in your text, write the slot token from a card you received, like {c1.cost}. The app fills it. Tokens only exist for cards that tools returned in this conversation.
4. You only know what tools return. Call a tool before answering any question about the audit, rules, proposals, trades, sessions or evidence. If a tool returns nothing, say so.
5. You have no access to raw fills, API keys or account credentials. Do not ask for them.
6. Report null results and failures as plainly as wins.
Write short plain sentences. No emojis, no dashes as pauses.`;

const emptyObject = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

function tool(name: string, description: string, parameters: JsonSchema): ToolDef {
  return { type: 'function', function: { name, description, parameters, strict: true } };
}

export const CHAT_TOOL_DEFS: ToolDef[] = [
  tool('get_audit', 'Get the trader audit: which rules were broken, how often, and what it cost.', emptyObject({})),
  tool('get_proposals', 'Get proposed rules with held-out results and intervals, including null results.', emptyObject({})),
  tool(
    'explain_rule',
    'Explain one rule in the rulebook and its evidence.',
    emptyObject({ rule_id: { type: 'string', description: 'Rule id from an earlier card.' } }),
  ),
  tool(
    'check_trade',
    'Check a trade idea against the rulebook. Use this whenever the user wants to trade.',
    emptyObject({
      symbol: { type: 'string' },
      side: { type: 'string', enum: ['long', 'short'] },
      leverage: { type: 'number' },
      product: { type: 'string', enum: ['perp', 'stock_perp', 'rtoken', 'stock_plus', 'spot'] },
      time: { type: 'string', description: 'The word now or an ISO-8601 timestamp.' },
    }),
  ),
  tool(
    'compare_sessions',
    'Compare results between two sessions such as regular and overnight.',
    emptyObject({ session_a: { type: 'string' }, session_b: { type: 'string' } }),
  ),
  tool(
    'get_evidence',
    'Get evidence-page facts: reconciliation, holdout results, null results, firewall stats.',
    emptyObject({ topic: { type: 'string' } }),
  ),
];

export class ChatToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatToolError';
  }
}

function assertCard(value: Card, toolName: string): void {
  const validKind = CARD_KINDS.includes(value.kind);
  const stringSlots = Object.values(value.slots).every((v) => typeof v === 'string');
  if (!validKind || typeof value.title !== 'string' || !stringSlots) {
    throw new ChatToolError(`${toolName} returned something that is not an aggregate card`);
  }
}

export interface ChatCard extends Card {
  id: string;
}

export interface ChatResult {
  text: string;
  cards: ChatCard[];
  usedFallback: boolean;
  jobs: JobReport[];
}

const MAX_ROUNDS = 6;
const EMPTY_FALLBACK =
  'I can only answer from your audit data. Ask about your audit, proposals, a rule, a trade idea, a session comparison or the evidence.';
const CARDS_FALLBACK = 'Here is what the engine returned.';

const ArgSchemas = {
  explain_rule: z.object({ rule_id: z.string() }),
  check_trade: z.object({
    symbol: z.string(),
    side: z.enum(['long', 'short']),
    leverage: z.number(),
    product: z.enum(['perp', 'stock_perp', 'rtoken', 'stock_plus', 'spot']),
    time: z.string(),
  }),
  compare_sessions: z.object({ session_a: z.string(), session_b: z.string() }),
  get_evidence: z.object({ topic: z.string() }),
};

function parseArgs<T>(schema: z.ZodType<T>, args: unknown, name: string): T {
  const parsed = schema.safeParse(args);
  if (!parsed.success) throw new ChatToolError(`${name} arguments invalid: ${parsed.error.message}`);
  return parsed.data;
}

async function dispatch(tools: ChatTools, name: string, args: unknown): Promise<Card[]> {
  switch (name) {
    case 'get_audit':
      return tools.get_audit();
    case 'get_proposals':
      return tools.get_proposals();
    case 'explain_rule':
      return tools.explain_rule(parseArgs(ArgSchemas.explain_rule, args, name));
    case 'check_trade':
      return tools.check_trade(parseArgs(ArgSchemas.check_trade, args, name));
    case 'compare_sessions':
      return tools.compare_sessions(parseArgs(ArgSchemas.compare_sessions, args, name));
    case 'get_evidence':
      return tools.get_evidence(parseArgs(ArgSchemas.get_evidence, args, name));
    default:
      throw new ChatToolError(`unknown tool ${name}`);
  }
}

function cardsForModel(cards: ChatCard[]): string {
  return JSON.stringify({
    cards: cards.map((c) => ({ id: c.id, kind: c.kind, title: c.title, slots: c.slots })),
    note: 'Refer to values with tokens like {id.slot}. Never write digits.',
  });
}

function slotMap(cards: ChatCard[]): Slots {
  const out: Record<string, string> = {};
  for (const c of cards) {
    for (const [name, value] of Object.entries(c.slots)) out[`${c.id}.${name}`] = value;
  }
  return out;
}

export async function runChat(
  client: LlmClient,
  tools: ChatTools,
  firewall: Firewall,
  userMessage: string,
  history: ChatMessage[] = [],
): Promise<ChatResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: userMessage },
  ];
  const cards: ChatCard[] = [];
  const jobs: JobReport[] = [];

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const completion = await client.complete({ messages, tools: CHAT_TOOL_DEFS });
    jobs.push(report('chat', client, completion.latencyMs));

    if (completion.toolCalls.length === 0) {
      const fallback = cards.length > 0 ? CARDS_FALLBACK : EMPTY_FALLBACK;
      const guarded = firewall.guard(completion.content, slotMap(cards), fallback);
      return { text: guarded.text, cards, usedFallback: guarded.usedFallback, jobs };
    }

    messages.push({ role: 'assistant', content: completion.content, tool_calls: completion.toolCalls });
    for (const call of completion.toolCalls) {
      messages.push({ role: 'tool', tool_call_id: call.id, content: await runToolCall(tools, call, cards) });
    }
  }

  const guarded = firewall.guard(null, slotMap(cards), cards.length > 0 ? CARDS_FALLBACK : EMPTY_FALLBACK);
  return { text: guarded.text, cards, usedFallback: true, jobs };
}

async function runToolCall(tools: ChatTools, call: ToolCall, cards: ChatCard[]): Promise<string> {
  let args: unknown;
  try {
    args = JSON.parse(call.function.arguments);
  } catch {
    return JSON.stringify({ error: 'tool arguments were not valid JSON' });
  }
  try {
    const result = await dispatch(tools, call.function.name, args);
    const added = result.map((card, i): ChatCard => {
      assertCard(card, call.function.name);
      return { ...card, id: `c${cards.length + i + 1}` };
    });
    cards.push(...added);
    return cardsForModel(added);
  } catch (err) {
    if (err instanceof ChatToolError) return JSON.stringify({ error: err.message });
    throw err;
  }
}
