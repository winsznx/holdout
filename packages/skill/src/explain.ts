import type { Rulebook, RulebookRule } from '@holdout/engine';

export interface RuleCard {
  kind: 'holdout.explain_rule.v1';
  ruleId: string;
  rule: string;
  status: RulebookRule['status'];
  statedRuleAudit: {
    breaks?: number;
    costDelta?: string;
    intervalLo?: number | null;
    intervalHi?: number | null;
  } | null;
  holdout: {
    deltaTest?: number;
    p?: number;
    shamMedian?: number;
    baselineDelta?: number;
    nTrain?: number;
    nTest?: number;
    freezeSha256?: string;
  } | null;
  rulebookSha256: string;
}

export type ExplainResult = { ok: true; card: RuleCard } | { ok: false; error: string };

function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function explainRule(book: Rulebook, ruleId: string): ExplainResult {
  const found = book.rules.find((r) => r.id === ruleId);
  if (!found) {
    const known = book.rules.map((r) => r.id).join(', ');
    return { ok: false, error: `rule ${ruleId} is not in this rulebook. Known rule ids: ${known || 'none'}` };
  }
  const e = found.evidence;
  const audit = e ? definedOnly({ breaks: e.breaks, costDelta: e.costDelta, intervalLo: e.intervalLo, intervalHi: e.intervalHi }) : {};
  const holdout = e
    ? definedOnly({ deltaTest: e.deltaTest, p: e.p, shamMedian: e.shamMedian, baselineDelta: e.baselineDelta, nTrain: e.nTrain, nTest: e.nTest, freezeSha256: e.freezeSha256 })
    : {};
  return {
    ok: true,
    card: {
      kind: 'holdout.explain_rule.v1',
      ruleId: found.id,
      rule: found.rendered,
      status: found.status,
      statedRuleAudit: Object.keys(audit).length > 0 ? audit : null,
      holdout: Object.keys(holdout).length > 0 ? holdout : null,
      rulebookSha256: book.sha256,
    },
  };
}

export function renderRuleCard(card: RuleCard): string {
  const lines = [`Rule ${card.ruleId}: ${card.rule}`, `Status: ${card.status}`];
  if (card.statedRuleAudit) {
    lines.push('Stated rule audit:');
    for (const [k, v] of Object.entries(card.statedRuleAudit)) lines.push(`  ${k}: ${v === null ? 'none' : String(v)}`);
  }
  if (card.holdout) {
    lines.push('Holdout test:');
    for (const [k, v] of Object.entries(card.holdout)) lines.push(`  ${k}: ${String(v)}`);
  }
  if (!card.statedRuleAudit && !card.holdout) lines.push('No evidence is recorded for this rule in the rulebook.');
  lines.push(`Rulebook sha256: ${card.rulebookSha256}`);
  return lines.join('\n');
}
