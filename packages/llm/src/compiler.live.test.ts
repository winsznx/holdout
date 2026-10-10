import { describe, expect, it } from 'vitest';
import { RuleSchema, renderRule, type Rule, type RuleType } from '@holdout/engine';
import { compileRule } from './compiler.ts';
import { parseIdea } from './idea.ts';
import { configFromEnv, createClient } from './provider.ts';

const client = createClient(configFromEnv(process.env));

const TEMPLATE_CASES: { t: RuleType; text: string; expected: Rule }[] = [
  { t: 'cooldown_after_loss', text: 'After I lose a trade I wait 2 hours before taking another one.', expected: { t: 'cooldown_after_loss', minutes: 120 } },
  { t: 'max_leverage', text: 'Never use more than 5x leverage.', expected: { t: 'max_leverage', x: 5 } },
  { t: 'no_add_to_loser', text: 'Stop averaging down. Never add to a losing position.', expected: { t: 'no_add_to_loser' } },
  { t: 'hard_stop', text: 'Cut any trade that goes 3% against my entry.', expected: { t: 'hard_stop', pct: 3 } },
  { t: 'daily_loss_limit', text: 'If I am down 200 USDT on the day I am done trading.', expected: { t: 'daily_loss_limit', usdt: 200 } },
  {
    t: 'session_filter',
    text: 'No opening stock perps or rtokens on weekends or overnight.',
    expected: { t: 'session_filter', block: ['weekend', 'overnight'], products: ['stock_perp', 'rtoken'] },
  },
  { t: 'earnings_blackout', text: 'Do not open anything within 24 hours before earnings.', expected: { t: 'earnings_blackout', hoursBefore: 24 } },
  { t: 'product_switch_weekend', text: 'For weekend stock exposure use the rToken instead of the stock perp.', expected: { t: 'product_switch_weekend', from: 'stock_perp', to: 'rtoken' } },
];

function sorted(rule: Rule): string {
  return JSON.stringify(rule, (_k, v: unknown) => (Array.isArray(v) ? [...v].sort() : v));
}

describe('live compiler', () => {
  for (const c of TEMPLATE_CASES) {
    it(`compiles ${c.t}`, async () => {
      const out = await compileRule(client, c.text);
      console.log(`LIVE ${c.t} ${out.job.model} ${out.job.latencyMs}ms ${out.refuse ? `REFUSED: ${out.reason}` : out.canonical}`);
      expect(out.refuse).toBe(false);
      if (out.refuse) return;
      expect(RuleSchema.safeParse(out.rule).success).toBe(true);
      expect(out.canonical).toBe(renderRule(out.rule));
      expect(out.rule.t).toBe(c.t);
      expect(sorted(out.rule)).toBe(sorted(c.expected));
    });
  }

  it('refuses an untestable rule', async () => {
    const out = await compileRule(client, 'Only trade when I feel confident.');
    console.log(`LIVE refusal ${out.job.latencyMs}ms ${out.refuse ? out.reason : 'COMPILED'}`);
    expect(out.refuse).toBe(true);
  });

  it('parses a trade idea', async () => {
    const out = await parseIdea(client, 'long NVDA 20x now');
    console.log(`LIVE idea ${out.job.latencyMs}ms ${JSON.stringify('idea' in out ? out.idea : out)}`);
    expect('idea' in out).toBe(true);
  });

  it('asks to clarify an ambiguous idea', async () => {
    const out = await parseIdea(client, 'get me into tesla somehow');
    expect('clarify' in out).toBe(true);
  });
});
