import { makeRulebook, ruleId, type Rulebook, type RulebookRule, type RulebookStatus } from '@holdout/engine';
import type { Analysis, DeskRule, DeskSource, DeskVersionDiff, RulebookDecision } from './types';

type RulebookRuleDraft = Omit<RulebookRule, 'id' | 'rendered'>;

export function rulebookRulesFor(analysis: Analysis, rules: DeskRule[], decisions: Record<string, RulebookDecision>): RulebookRuleDraft[] {
  const drafts: RulebookRuleDraft[] = [];
  const seen = new Set<string>();

  for (const r of rules) {
    const audit = analysis.audits[r.id];
    seen.add(r.id);
    drafts.push({
      rule: r.rule,
      status: 'stated',
      evidence: audit
        ? {
            breaks: audit.breaks,
            costDelta: audit.costDelta,
            intervalLo: audit.interval?.lo ?? null,
            intervalHi: audit.interval?.hi ?? null,
          }
        : undefined,
    });
  }

  const outcome = analysis.holdout;
  const freeze = outcome?.freeze;
  const test = outcome?.test;
  if (outcome && freeze && test) {
    const id = ruleId(freeze.rule);
    if (!seen.has(id)) {
      const decision = decisions[id];
      const status: RulebookStatus | null = decision ?? (outcome.verdict === 'ADOPT_WORTHY' ? 'proposed' : null);
      if (status) {
        drafts.push({
          rule: freeze.rule,
          status,
          evidence: {
            deltaTest: test.deltaTest,
            p: test.p,
            shamMedian: test.shamMedian,
            baselineDelta: test.baseline.deltaTest,
            nTrain: outcome.nTrain,
            nTest: outcome.nTest,
            freezeSha256: freeze.sha256,
          },
        });
      }
    }
  }
  return drafts;
}

export function buildDraftRulebook(input: {
  source: DeskSource;
  analysis: Analysis;
  rules: DeskRule[];
  decisions: Record<string, RulebookDecision>;
  version: number;
  createdAt: string;
}): Rulebook {
  const { source, analysis } = input;
  return makeRulebook({
    version: input.version,
    traderId: source.id,
    label: source.label,
    createdAt: input.createdAt,
    rules: rulebookRulesFor(analysis, input.rules, input.decisions),
    buckets: analysis.buckets,
    ledger: {
      roundTrips: analysis.ledger.roundTrips.length,
      reconciled: analysis.reconciliation.pass,
      incomplete: analysis.ledger.flags.incomplete,
    },
  });
}

export function diffRulebooks(from: Rulebook, to: Rulebook): DeskVersionDiff {
  const before = new Map(from.rules.map((r) => [r.id, r]));
  const after = new Map(to.rules.map((r) => [r.id, r]));
  const added = to.rules.filter((r) => !before.has(r.id));
  const removed = from.rules.filter((r) => !after.has(r.id));
  const changed: DeskVersionDiff['changed'] = [];
  let unchanged = 0;
  for (const r of to.rules) {
    const prev = before.get(r.id);
    if (!prev) continue;
    if (prev.status !== r.status) changed.push({ id: r.id, rendered: r.rendered, from: prev.status, to: r.status });
    else unchanged += 1;
  }
  return { added, removed, changed, unchanged };
}
