import { readFileSync, writeFileSync } from 'node:fs';
import { Firewall, configFromEnv, createClient, narrateCard, validateNarration, type NarratedCardType } from '../packages/llm/src/index.ts';
import { renderRule, type Rule } from '../packages/engine/src/index.ts';
import type { TraderResult } from './lib/compute.ts';

const latest = JSON.parse(readFileSync('evidence/runs/latest.json', 'utf8')) as { runId: string; resultsPath: string };
const run = JSON.parse(readFileSync(latest.resultsPath, 'utf8')) as { results: TraderResult[] };
const client = createClient(configFromEnv(process.env));
const firewall = new Firewall();
const usd = (n: number | string) => `${Number(n) < 0 ? '-' : ''}$${Math.abs(Number(n)).toFixed(4)}`;

interface Call {
  traderId: string;
  type: NarratedCardType;
  usedFallback: boolean;
  text: string;
  provider?: string;
  model?: string;
  providerError?: string;
}
const calls: Call[] = [];

for (const r of run.results) {
  for (const a of r.audits) {
    if (a.status !== 'priced') continue;
    const slots = { rule_text: a.rendered, breaks: String(a.breaks), trades: String(a.tripsConsidered), cost: usd(a.costDelta) };
    const out = await narrateCard(client, firewall, 'audit_rule_card', slots);
    calls.push({ traderId: r.id, type: 'audit_rule_card', usedFallback: out.usedFallback, text: out.text, provider: out.job?.provider, model: out.job?.model, providerError: out.providerError });
  }
  const t = r.outcome.test;
  if (!r.outcome.freeze || !t) {
    const best = r.outcome.selection?.candidates[0];
    const rule = (best?.rule ?? { t: 'no_add_to_loser' }) as Rule;
    const slots = { rule_text: renderRule(rule), held_out: String(r.outcome.nTest), interval_lo: usd(0), interval_hi: usd(0) };
    if (r.outcome.verdict === 'NO_RULE_NEEDED') {
      const out = await narrateCard(client, firewall, 'null_result_card', slots);
      calls.push({ traderId: r.id, type: 'null_result_card', usedFallback: out.usedFallback, text: out.text, provider: out.job?.provider, model: out.job?.model, providerError: out.providerError });
    }
  }
}

const injected = validateNarration('You saved {saved} and beat 90 percent of random rules.', { saved: '$1.0000' });
const clean = validateNarration('You saved {saved} on held-out trades.', { saved: '$1.0000' });
const stats = firewall.stats();
const file = {
  ...stats,
  calls,
  injectionTest: { text: 'You saved {saved} and beat 90 percent of random rules.', rejected: !injected.ok, violations: injected.ok ? [] : injected.violations },
  cleanTest: { accepted: clean.ok },
  note: 'Outputs of a live LLM are not deterministic. pnpm verify does not recompute this file. The texts above are the stored outputs.',
};
writeFileSync('apps/web/public/data/evidence/firewall.json', JSON.stringify(file, null, 2) + '\n');
writeFileSync(`evidence/runs/${latest.runId}/narration.json`, JSON.stringify(file, null, 2) + '\n');
console.log(`firewall passes ${stats.passes}, fallbacks ${stats.failures}, injection rejected ${!injected.ok}`);
