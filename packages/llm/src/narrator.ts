import { Firewall, type Slots } from './firewall.ts';
import { ProviderError, report, type JobReport, type LlmClient } from './provider.ts';

export type NarratedCardType = 'audit_rule_card' | 'proposal_card' | 'check_trade_card' | 'null_result_card';

interface CardSpec {
  slots: Readonly<Record<string, string>>;
  fallback: string;
  guidance: string;
}

export const CARD_SPECS: Readonly<Record<NarratedCardType, CardSpec>> = {
  audit_rule_card: {
    slots: {
      rule_text: 'the rule in plain English',
      breaks: 'how many times the trader broke the rule',
      trades: 'how many trades were checked',
      cost: 'dollars lost in the trades that broke the rule',
    },
    fallback: 'You broke "{rule_text}" {breaks} times in {trades} trades. Those trades cost {cost}.',
    guidance: 'Say how often the rule was broken and what it cost. Plain and direct.',
  },
  proposal_card: {
    slots: {
      rule_text: 'the proposed rule in plain English',
      saved: 'dollars the rule would have saved on trades it never saw',
      interval_lo: 'low end of the uncertainty interval',
      interval_hi: 'high end of the uncertainty interval',
      held_out: 'how many held-out trades were used',
    },
    fallback:
      'Proposed rule: {rule_text}. On {held_out} trades it never saw, it would have saved {saved}, with an interval from {interval_lo} to {interval_hi}.',
    guidance: 'Say what the rule would have saved on held-out trades and give the interval. Do not promise future results.',
  },
  check_trade_card: {
    slots: {
      symbol: 'the symbol of the trade idea',
      violated: 'how many rules the trade idea would break',
      rule_text: 'the first rule the trade idea would break',
    },
    fallback: 'Checked {symbol} against your rulebook. It would break {violated} rules, starting with "{rule_text}".',
    guidance: 'Say which rules the idea would break. Holdout never places orders, so do not tell the trader to place or skip it.',
  },
  null_result_card: {
    slots: {
      rule_text: 'the rule that was tested',
      held_out: 'how many held-out trades were used',
      interval_lo: 'low end of the uncertainty interval',
      interval_hi: 'high end of the uncertainty interval',
    },
    fallback:
      'No effect found for "{rule_text}". On {held_out} held-out trades the interval ran from {interval_lo} to {interval_hi}, so it does not beat doing nothing.',
    guidance: 'State plainly that the test found no effect. Do not soften or spin it.',
  },
};

export interface NarrationResult {
  text: string;
  usedFallback: boolean;
  job?: JobReport;
  providerError?: string;
}

export function fallbackNarration(type: NarratedCardType, slots: Slots): string {
  return new Firewall().guard(null, slots, CARD_SPECS[type].fallback).text;
}

function missingSlots(type: NarratedCardType, slots: Slots): string[] {
  return Object.keys(CARD_SPECS[type].slots).filter((name) => slots[name] === undefined);
}

export async function narrateCard(
  client: LlmClient | null,
  firewall: Firewall,
  type: NarratedCardType,
  slots: Slots,
): Promise<NarrationResult> {
  const spec = CARD_SPECS[type];
  const missing = missingSlots(type, slots);
  if (missing.length > 0) throw new Error(`${type} is missing slots: ${missing.join(', ')}`);
  if (!client) {
    return { ...firewall.guard(null, slots, spec.fallback) };
  }

  const slotList = Object.entries(spec.slots)
    .map(([name, desc]) => `{${name}}: ${desc}`)
    .join('\n');
  const system = `You write 1 or 2 short sentences for a trading-audit card.
You never write digits. Every number comes from a slot token written exactly like {cost}. The engine fills the tokens after you write.
Allowed tokens:
${slotList}
${spec.guidance}
Use plain words. No emojis, no dashes used as pauses, no hype.`;

  let content: string | null = null;
  let job: JobReport | undefined;
  let providerError: string | undefined;
  try {
    const completion = await client.complete({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Write the card text for a ${type}.` },
      ],
    });
    content = completion.content;
    job = report('narrator', client, completion.latencyMs);
  } catch (err) {
    if (!(err instanceof ProviderError)) throw err;
    providerError = err.message;
  }
  const guarded = firewall.guard(content, slots, spec.fallback);
  return { ...guarded, job, providerError };
}
