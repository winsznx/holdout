import { describe, expect, it } from 'vitest';
import { Firewall } from './firewall.ts';
import { runChat, type Card, type ChatTools } from './chat.ts';
import type { Completion, LlmClient } from './provider.ts';

const card: Card = { kind: 'audit_rule_card', title: 'Cooldown', slots: { cost: '$1,240' } };
const tools: ChatTools = {
  get_audit: async () => [card],
  get_proposals: async () => [],
  explain_rule: async () => [],
  check_trade: async () => [],
  compare_sessions: async () => [],
  get_evidence: async () => [],
};

function scripted(steps: Partial<Completion>[]): LlmClient {
  let i = 0;
  return {
    config: { name: 'test', model: 'test-model' },
    async complete() {
      const s = steps[i++] ?? {};
      return { content: null, toolCalls: [], finishReason: 'stop', latencyMs: 1, ...s };
    },
  };
}

const auditCall = { id: 't1', type: 'function' as const, function: { name: 'get_audit', arguments: '{}' } };

describe('runChat', () => {
  it('runs tools, returns cards and a firewalled text', async () => {
    const client = scripted([{ toolCalls: [auditCall] }, { content: 'The cooldown rule cost you {c1.cost}.' }]);
    const fw = new Firewall();
    const res = await runChat(client, tools, fw, 'how am I doing');
    expect(res.text).toBe('The cooldown rule cost you $1,240.');
    expect(res.cards).toHaveLength(1);
    expect(res.cards[0]?.id).toBe('c1');
    expect(fw.stats()).toEqual({ passes: 1, failures: 0 });
  });

  it('falls back when the model writes its own digits', async () => {
    const client = scripted([{ toolCalls: [auditCall] }, { content: 'It cost you about 900 dollars.' }]);
    const fw = new Firewall();
    const res = await runChat(client, tools, fw, 'how am I doing');
    expect(res.usedFallback).toBe(true);
    expect(res.text).not.toMatch(/\d/);
    expect(fw.stats().failures).toBe(1);
  });

  it('rejects a tool result that is not an aggregate card', async () => {
    const bad: ChatTools = { ...tools, get_audit: async () => [{ kind: 'audit_rule_card', title: 't', slots: { cost: 5 as unknown as string } }] };
    const client = scripted([{ toolCalls: [auditCall] }, { content: 'Nothing available.' }]);
    const res = await runChat(client, bad, new Firewall(), 'audit');
    expect(res.cards).toHaveLength(0);
  });
});
