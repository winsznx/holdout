import { z } from 'zod';
import { NO_ORDERS_REPLY, fallbackNarration, type Card } from '@holdout/llm';
import { parseIdeaStrict } from '@/lib/check/parse';
import type { IdeaInput } from '@/lib/check/live';
import type { EvidenceData, FirewallFile } from '@/lib/evidence-data';
import { auditCards, evidenceCards, explainMap, proposalCards, sessionCards, type DeskSnapshot } from './tools';

export interface ChatCardView extends Card {
  id: string;
}

export interface FirewallCount {
  passes: number;
  failures: number;
}

const CardOut = z.object({
  id: z.string(),
  kind: z.enum(['audit_rule_card', 'proposal_card', 'check_trade_card', 'null_result_card', 'explain_rule_card', 'compare_sessions_card', 'evidence_card']),
  title: z.string(),
  slots: z.record(z.string(), z.string()),
});

const OkOut = z.object({
  ok: z.literal(true),
  provider: z.string(),
  model: z.string(),
  text: z.string(),
  cards: z.array(CardOut),
  usedFallback: z.boolean(),
  ideas: z.array(z.object({ symbol: z.string(), side: z.enum(['long', 'short']), leverage: z.number(), product: z.enum(['perp', 'stock_perp', 'rtoken', 'stock_plus', 'spot']), time: z.string() })),
  firewall: z.object({ passes: z.number(), failures: z.number() }),
});
const FailureOut = z.object({ ok: z.literal(false), error: z.object({ surface: z.string(), message: z.string() }) });

export type RemoteChat =
  | { kind: 'ok'; provider: string; model: string; text: string; cards: ChatCardView[]; usedFallback: boolean; ideas: IdeaInput[]; firewall: FirewallCount }
  | { kind: 'error'; surface: string; message: string };

export interface WireMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function buildContext(s: DeskSnapshot, evidence: EvidenceData | null, firewall: FirewallFile | null) {
  return {
    audit: auditCards(s),
    proposals: proposalCards(s),
    explain: explainMap(s),
    sessions: sessionCards(s),
    evidence: evidenceCards(s, evidence, firewall),
    rules: (s.rulebook?.rules ?? []).slice(0, 20).map((r) => ({ id: r.id, rendered: r.rendered.slice(0, 300), status: r.status, rule: r.rule })),
  };
}

export async function chatRemote(messages: WireMessage[], context: ReturnType<typeof buildContext>): Promise<RemoteChat> {
  try {
    const res = await fetch('/api/llm/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages, context }) });
    const raw: unknown = await res.json().catch(() => null);
    const failure = FailureOut.safeParse(raw);
    if (failure.success) return { kind: 'error', surface: failure.data.error.surface, message: failure.data.error.message };
    const ok = OkOut.safeParse(raw);
    if (!ok.success) return { kind: 'error', surface: 'OpenAI', message: 'The chat answered with a shape Holdout does not recognize.' };
    return { kind: 'ok', ...ok.data };
  } catch (e) {
    return { kind: 'error', surface: 'OpenAI', message: e instanceof Error ? e.message : 'The request failed' };
  }
}

export interface LocalAnswer {
  text: string;
  cards: ChatCardView[];
  idea: IdeaInput | null;
}

const NARRATED = new Set<Card['kind']>(['audit_rule_card']);

function withIds(cards: Card[]): ChatCardView[] {
  return cards.map((c, i) => ({ ...c, id: `c${i + 1}` }));
}

function describe(cards: ChatCardView[], empty: string): string {
  if (cards.length === 0) return empty;
  const lines = cards.map((c) => (NARRATED.has(c.kind) ? fallbackNarration('audit_rule_card', c.slots) : c.title));
  return lines.join(' ');
}

const TRADE_INTENT = /\b(buy|sell|long|short|open|place|trade|enter)\b/i;

export function answerLocally(text: string, s: DeskSnapshot, evidence: EvidenceData | null, firewall: FirewallFile | null): LocalAnswer {
  const t = text.toLowerCase();
  if (TRADE_INTENT.test(t)) {
    const parsed = parseIdeaStrict(text, s.rulebook);
    if (parsed.kind === 'idea') return { text: NO_ORDERS_REPLY, cards: [], idea: parsed.idea };
    return { text: `${NO_ORDERS_REPLY} ${parsed.kind === 'clarify' ? parsed.question : ''}`.trim(), cards: [], idea: null };
  }
  if (/audit|broke|break|cost|stated/.test(t)) {
    const cards = withIds(auditCards(s));
    return { text: describe(cards, 'There is no audit yet. Load a history and add rules first.'), cards, idea: null };
  }
  if (/proposal|propose|suggest|holdout|adopt/.test(t)) {
    const cards = withIds(proposalCards(s));
    return { text: describe(cards, 'There are no proposals yet. Load a history first.'), cards, idea: null };
  }
  if (/session|overnight|weekend|compare|regular/.test(t)) {
    const cards = withIds(sessionCards(s));
    return { text: describe(cards, 'There is no session comparison yet. Load a history first.'), cards, idea: null };
  }
  if (/evidence|proof|firewall|cohort|verify/.test(t)) {
    const cards = withIds(evidenceCards(s, evidence, firewall));
    return { text: describe(cards, 'No evidence is available.'), cards, idea: null };
  }
  if (/rule|explain/.test(t)) {
    const rules = s.rulebook?.rules ?? [];
    const match = rules.find((r) => t.includes(r.rendered.toLowerCase()) || t.includes(r.rule.t.replaceAll('_', ' ')));
    const cards = withIds(Object.values(explainMap(s)).flat().filter((c) => (match ? c.title === match.rendered : true)));
    return { text: describe(cards, 'The rulebook has no rules yet.'), cards, idea: null };
  }
  return { text: 'I can only answer from your audit data. Ask about your audit, proposals, a rule, a trade idea, a session comparison or the evidence.', cards: [], idea: null };
}
