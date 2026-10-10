import { readFileSync } from 'node:fs';
import {
  makeFreeze,
  median,
  runHoldout,
  stageSelect,
  stageTest,
  type FreezeRecord,
  type HoldoutOutcome,
  type Candle,
  type RuleAudit,
} from '../../packages/engine/src/index.ts';
import { campaignExtras } from './campaign.ts';
import type { History } from './history.ts';
import { prepare, statedAudits, type TraderBase } from './pipeline.ts';

export const FREEZE_DIR = 'evidence/freeze';

export interface TraderResult {
  id: string;
  label: string;
  kind: string;
  cohort: string;
  nTrips: number;
  recon: TraderBase['recon'];
  flags: TraderBase['ledger']['flags'];
  blocked: string | null;
  audits: RuleAudit[];
  outcome: HoldoutOutcome;
}

export type FreezeLoader = (traderId: string) => FreezeRecord;

export const readFreezeFile: FreezeLoader = (id) => JSON.parse(readFileSync(`${FREEZE_DIR}/${id}.json`, 'utf8')) as FreezeRecord;

export function computeTrader(history: History, market: Record<string, Candle[]>, loadFreeze: FreezeLoader): TraderResult {
  const base = prepare(history, market);
  const id = history.meta.id;
  const audits = statedAudits(base);
  const cohort = history.meta.kind === 'bot' ? 'bitget-demo-bots' : history.meta.kind;
  let outcome: HoldoutOutcome;
  if (base.blocked) {
    outcome = { traderId: id, verdict: 'INSUFFICIENT', reason: base.blocked, nTrips: base.ledger.roundTrips.length, nTrain: 0, nTest: 0, splitTs: 0, selection: null, freeze: null, test: null };
  } else {
    const staged = stageSelect(id, base.ledger.roundTrips, base.ctx, 'replay', 'replay');
    if (staged.insufficient || !staged.selection) {
      outcome = runHoldout(id, base.ledger.roundTrips, base.ctx, 'replay', 'replay');
    } else if (!staged.freeze) {
      outcome = stageTest(id, staged.split, staged.selection, null, base.ctx);
    } else {
      const frozen = loadFreeze(id);
      const recomputed = makeFreeze(id, staged.split, staged.selection, frozen.codeCommit, frozen.timestamp);
      if (!recomputed || recomputed.sha256 !== frozen.sha256) throw new Error(`${id}: frozen selection does not match a recomputation from train data`);
      outcome = stageTest(id, staged.split, staged.selection, frozen, base.ctx);
    }
  }
  return { id, label: history.meta.label, kind: history.meta.kind, cohort, nTrips: base.ledger.roundTrips.length, recon: base.recon, flags: base.ledger.flags, blocked: base.blocked, audits, outcome };
}

export function computeCohorts(results: TraderResult[]) {
  return [...new Set(results.map((r) => r.cohort))].map((cohort) => {
    const rows = results.filter((r) => r.cohort === cohort && r.outcome.test && !r.outcome.test.untestable);
    const deltas = rows.map((r) => (r.outcome.test as NonNullable<typeof r.outcome.test>).deltaTest);
    const shamMedians = rows.map((r) => (r.outcome.test as NonNullable<typeof r.outcome.test>).shamMedian);
    const medDelta = deltas.length ? median(deltas) : null;
    const medSham = shamMedians.length ? median(shamMedians) : null;
    const killed = medDelta === null || medSham === null || medDelta <= medSham || medDelta <= 0;
    return {
      cohort,
      traders: results.filter((r) => r.cohort === cohort).length,
      tested: rows.length,
      medianDeltaTest: medDelta,
      medianShamMedian: medSham,
      adoptWorthy: results.filter((r) => r.cohort === cohort && r.outcome.verdict === 'ADOPT_WORTHY').length,
      headline: killed ? 'audit' : 'discovered_rules_help',
      killRuleApplied: killed,
    };
  });
}

export function computeAll(histories: History[], market: Record<string, Candle[]>, loadFreeze: FreezeLoader) {
  const results = histories.map((h) => computeTrader(h, market, loadFreeze));
  const cohorts = computeCohorts(results);
  const campaign = campaignExtras(histories, market, results.map((r) => ({ id: r.id, outcome: r.outcome, audits: r.audits })));
  return { cohorts, results, campaign };
}
