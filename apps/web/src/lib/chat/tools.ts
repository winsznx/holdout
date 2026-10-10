import type { Card } from '@holdout/llm';
import { renderRule, type Rulebook } from '@holdout/engine';
import { formatPercent, formatSignedUsdt } from '@/lib/format';
import { money, signedMoney } from '@/lib/desk/display';
import { STATUS_LABEL } from '@/lib/desk/rule-view';
import type { Analysis, DeskRule } from '@/lib/desk/types';
import type { EvidenceData, FirewallFile } from '@/lib/evidence-data';
import { cohortTitle } from '@/lib/evidence-data';

export interface DeskSnapshot {
  rules: DeskRule[];
  analysis: Analysis | null;
  rulebook: Rulebook | null;
}

const SLOT_MAX = 240;

function card(kind: Card['kind'], title: string, slots: Record<string, string>): Card {
  const clipped: Record<string, string> = {};
  for (const [k, v] of Object.entries(slots)) clipped[k] = v.length > SLOT_MAX ? `${v.slice(0, SLOT_MAX - 1)}…` : v;
  return { kind, title: title.slice(0, 200), slots: clipped };
}

export function auditCards(s: DeskSnapshot): Card[] {
  if (!s.analysis) return [];
  const out: Card[] = [];
  for (const r of s.rules) {
    const a = s.analysis.audits[r.id];
    if (!a) continue;
    if (a.status === 'priced') {
      out.push(card('audit_rule_card', a.rendered, { rule_text: a.rendered, breaks: String(a.breaks), trades: String(a.tripsConsidered), cost: `${signedMoney(a.costDelta)} USDT` }));
    } else {
      out.push(
        card('explain_rule_card', a.rendered, {
          rule_text: a.rendered,
          status: STATUS_LABEL[a.status],
          breaks: String(a.breaks),
          trades: String(a.tripsConsidered),
          reason: a.untestableReason ?? 'not priced',
        }),
      );
    }
  }
  return out.slice(0, 12);
}

export function proposalCards(s: DeskSnapshot): Card[] {
  const h = s.analysis?.holdout;
  if (!s.analysis) return [];
  if (!h) {
    return [card('evidence_card', 'Proposals blocked', { status: 'blocked', reason: s.analysis.holdoutBlockedReason ?? 'no holdout result' })];
  }
  if (!h.test || !h.freeze) {
    return [card('evidence_card', 'No proposal', { verdict: h.verdict, reason: h.reason, train_trades: String(h.nTrain), test_trades: String(h.nTest) })];
  }
  return [
    card('evidence_card', `Proposal: ${renderRule(h.freeze.rule)}`, {
      verdict: h.verdict,
      reason: h.reason,
      test_delta: `${formatSignedUsdt(h.test.deltaTest)} USDT`,
      p_vs_sham: h.test.p.toFixed(3),
      sham_median: `${formatSignedUsdt(h.test.shamMedian)} USDT`,
      train_trades: String(h.nTrain),
      test_trades: String(h.nTest),
    }),
  ];
}

export function explainCards(s: DeskSnapshot, ruleId: string): Card[] {
  const rule = s.rulebook?.rules.find((r) => r.id === ruleId);
  if (!rule) return [];
  const e = rule.evidence;
  const slots: Record<string, string> = { rule_text: rule.rendered, status: rule.status };
  if (e?.breaks !== undefined) slots.breaks = String(e.breaks);
  if (e?.costDelta !== undefined) slots.cost = `${signedMoney(e.costDelta)} USDT`;
  if (e?.deltaTest !== undefined) slots.test_delta = `${formatSignedUsdt(e.deltaTest)} USDT`;
  if (e?.p !== undefined) slots.p_vs_sham = e.p.toFixed(3);
  if (e?.nTest !== undefined) slots.test_trades = String(e.nTest);
  return [card('explain_rule_card', rule.rendered, slots)];
}

export function explainMap(s: DeskSnapshot): Record<string, Card[]> {
  const out: Record<string, Card[]> = {};
  for (const r of s.rulebook?.rules.slice(0, 20) ?? []) out[r.id] = explainCards(s, r.id);
  return out;
}

export function sessionCards(s: DeskSnapshot): Card[] {
  const lens = s.analysis?.sessionLens;
  if (!lens) return [];
  if (lens.unavailableReason) return [card('evidence_card', 'Session lens unavailable', { reason: lens.unavailableReason })];
  return lens.bySession.slice(0, 8).map((g) =>
    card('compare_sessions_card', g.label, {
      session: g.label,
      trades: String(g.n),
      net: `${signedMoney(g.net)} USDT`,
      win_rate: g.winRate === null ? 'n/a' : formatPercent(g.winRate, 0),
    }),
  );
}

export function evidenceCards(s: DeskSnapshot, evidence: EvidenceData | null, firewall: FirewallFile | null): Card[] {
  const out: Card[] = [];
  if (s.analysis) {
    const r = s.analysis.reconciliation;
    out.push(card('evidence_card', 'Your ledger reconciliation', { result: r.pass ? 'passed' : 'failed', reason: r.reason ?? 'within limits', round_trips: String(s.analysis.ledger.roundTrips.length), delta: `${(r.totalDeltaPct * 100).toFixed(2)}%`, our_net: `${money(r.totalOurs)} USDT` }));
  }
  if (!evidence) {
    out.push(card('evidence_card', 'Published evaluation', { status: 'not published yet', source: 'Holdout data file /data/evidence/summary.json' }));
  } else {
    for (const c of evidence.cohorts.slice(0, 4)) {
      out.push(
        card('evidence_card', `Cohort: ${cohortTitle(c.cohort)}`, {
          headline: c.headline === 'audit' ? 'audit' : 'discovered rules help',
          traders: String(c.traders),
          tested: String(c.tested),
          adopt_worthy: String(c.adoptWorthy),
          median_test_delta: c.medianDeltaTest === null ? 'none' : `${formatSignedUsdt(c.medianDeltaTest)} USDT`,
          median_sham_median: c.medianShamMedian === null ? 'none' : `${formatSignedUsdt(c.medianShamMedian)} USDT`,
        }),
      );
    }
  }
  if (firewall) out.push(card('evidence_card', 'Numbers firewall', { passes: String(firewall.passes), fallbacks: String(firewall.failures) }));
  return out.slice(0, 8);
}
