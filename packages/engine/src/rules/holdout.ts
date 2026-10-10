import type { RoundTrip } from '../types.ts';
import { D, num, sum } from '../decimal.ts';
import { sha256Hex, stableStringify } from '../hash.ts';
import { median, monteCarloP, rngFromHex, sampleWithoutReplacement, totalOf, type Rng } from '../stats.ts';
import { tagTrip } from '../sessions.ts';
import { applyRule, type Context, type CounterfactualResult } from './counterfactual.ts';
import type { Rule } from './schema.ts';

export const MIN_TRIPS = 30;
export const MIN_TRAIN = 30;
export const MIN_TEST = 15;
export const MIN_AFFECTED_TRAIN = 5;
export const MIN_RATE = 0.02;
export const MAX_RATE = 0.5;
export const SHAM_DRAWS = 1000;
export const ALPHA = 0.1;

export type Verdict = 'ADOPT_WORTHY' | 'NO_RULE_NEEDED' | 'INSUFFICIENT';

export interface Split {
  train: RoundTrip[];
  test: RoundTrip[];
  splitTs: number;
}

export function sortByClose(trips: RoundTrip[]): RoundTrip[] {
  return [...trips].sort((a, b) => a.closeTs - b.closeTs || (a.id < b.id ? -1 : 1));
}

export function splitTrips(trips: RoundTrip[]): Split {
  const sorted = sortByClose(trips);
  const k = Math.ceil((2 * sorted.length) / 3);
  const train = sorted.slice(0, k);
  const test = sorted.slice(k);
  return { train, test, splitTs: train[train.length - 1]?.closeTs ?? 0 };
}

export function candidateGrid(train: RoundTrip[], ctx: Context = {}): Rule[] {
  const medAbs = median(train.map((t) => Math.abs(num(t.netPnl))));
  const stockScope = ['stock_perp', 'rtoken'] as ('stock_perp' | 'rtoken')[];
  return [
    ...(ctx.dayLevel ? [1440, 2880, 4320] : [15, 30, 45, 60, 120]).map((minutes): Rule => ({ t: 'cooldown_after_loss', minutes })),
    ...[3, 5, 10, 20].map((x): Rule => ({ t: 'max_leverage', x })),
    ...[1, 2, 3, 5].map((pct): Rule => ({ t: 'hard_stop', pct })),
    ...[2, 3, 5].map((m): Rule => ({ t: 'daily_loss_limit', usdt: Number((m * medAbs).toFixed(6)) })),
    { t: 'session_filter', block: ['overnight'], products: stockScope },
    { t: 'session_filter', block: ['weekend'], products: stockScope },
    { t: 'session_filter', block: ['friday_close'], products: stockScope },
    { t: 'session_filter', block: ['overnight', 'weekend', 'holiday'], products: stockScope },
    ...[12, 24, 48].map((hoursBefore): Rule => ({ t: 'earnings_blackout', hoursBefore })),
    { t: 'no_add_to_loser' },
    { t: 'product_switch_weekend', from: 'stock_perp', to: 'rtoken' },
  ];
}

export interface Candidate {
  rule: Rule;
  deltaTrain: number;
  affectedTrain: number;
  rate: number;
  eligible: boolean;
  skippedReason?: string;
}

export interface Selection {
  candidates: Candidate[];
  top3: Candidate[];
  selected: Candidate | null;
}

export function selectRule(train: RoundTrip[], ctx: Context = {}, grid: Rule[] = candidateGrid(train, ctx)): Selection {
  const candidates: Candidate[] = grid.map((rule) => {
    const result = applyRule(train, rule, ctx);
    const affected = result.affectedIds.length;
    const rate = train.length === 0 ? 0 : affected / train.length;
    const base = { rule, deltaTrain: num(result.delta), affectedTrain: affected, rate };
    if (result.untestableRule) return { ...base, eligible: false, skippedReason: result.untestableReason ?? 'untestable' };
    if (affected < MIN_AFFECTED_TRAIN) return { ...base, eligible: false, skippedReason: `affects ${affected} train trades, needs ${MIN_AFFECTED_TRAIN}` };
    if (rate < MIN_RATE || rate > MAX_RATE) return { ...base, eligible: false, skippedReason: `affects ${(rate * 100).toFixed(1)}% of train trades, allowed 2% to 50%` };
    return { ...base, eligible: true };
  });
  const ranked = candidates.filter((c) => c.eligible).sort((a, b) => b.deltaTrain - a.deltaTrain);
  const top3 = ranked.slice(0, 3);
  const best = top3[0];
  return { candidates, top3, selected: best && best.deltaTrain > 0 ? best : null };
}

export interface FreezeRecord {
  traderId: string;
  rule: Rule;
  trainStats: { n: number; deltaTrain: number; affectedTrain: number; netTrain: number };
  splitTs: number;
  nTrain: number;
  codeCommit: string;
  timestamp: string;
  top3: { rule: Rule; deltaTrain: number }[];
  sha256: string;
}

export function makeFreeze(traderId: string, split: Split, selection: Selection, codeCommit: string, timestamp: string): FreezeRecord | null {
  const sel = selection.selected;
  if (!sel) return null;
  const body = {
    traderId,
    rule: sel.rule,
    trainStats: {
      n: split.train.length,
      deltaTrain: sel.deltaTrain,
      affectedTrain: sel.affectedTrain,
      netTrain: num(sum(split.train.map((t) => t.netPnl))),
    },
    splitTs: split.splitTs,
    nTrain: split.train.length,
    codeCommit,
    timestamp,
    top3: selection.top3.map((c) => ({ rule: c.rule, deltaTrain: c.deltaTrain })),
  };
  return { ...body, sha256: sha256Hex(stableStringify(body)) };
}

const MODIFYING: Rule['t'][] = ['hard_stop', 'max_leverage', 'product_switch_weekend'];

export function forcedDeltas(rule: Rule, test: RoundTrip[], real: CounterfactualResult): number[] | null {
  if (rule.t === 'hard_stop') {
    return test.map((t) => {
      const notional = D(t.avgEntry).times(t.qty);
      const cf = notional.times(rule.pct / 100).neg().minus(t.fees);
      return num(cf.minus(t.netPnl));
    });
  }
  if (rule.t === 'max_leverage') {
    const factors = real.outcomes.filter((o) => o.kind === 'modified').map((o) => num(D(o.cfNet).div(test.find((t) => t.id === o.tripId)?.netPnl ?? 1)));
    if (factors.length === 0) return null;
    const meanFactor = totalOf(factors) / factors.length;
    return test.map((t) => (meanFactor - 1) * num(t.netPnl));
  }
  return null;
}

export interface ShamResult {
  draws: number[];
  p: number;
  k: number;
  medianDraw: number;
  design: 'remove_k_random' | 'modify_k_random' | 'none';
}

export function shamTest(rule: Rule, test: RoundTrip[], real: CounterfactualResult, rng: Rng, draws = SHAM_DRAWS): ShamResult {
  const k = real.affectedIds.length;
  const observed = num(real.delta);
  const nets = test.map((t) => num(t.netPnl));
  const out: number[] = [];
  if (MODIFYING.includes(rule.t)) {
    const forced = forcedDeltas(rule, test, real);
    if (!forced || k === 0) return { draws: [], p: 1, k, medianDraw: 0, design: 'none' };
    for (let i = 0; i < draws; i++) {
      const idx = sampleWithoutReplacement(test.length, Math.min(k, test.length), rng);
      out.push(idx.reduce((s, j) => s + (forced[j] as number), 0));
    }
    return { draws: out, p: monteCarloP(observed, out), k, medianDraw: median(out), design: 'modify_k_random' };
  }
  for (let i = 0; i < draws; i++) {
    const idx = sampleWithoutReplacement(test.length, Math.min(k, test.length), rng);
    out.push(-idx.reduce((s, j) => s + (nets[j] as number), 0));
  }
  return { draws: out, p: monteCarloP(observed, out), k, medianDraw: median(out), design: 'remove_k_random' };
}

export interface BaselineResult {
  bucket: string | null;
  trainTotal: number;
  deltaTest: number;
  removedTest: number;
}

export function baselineBucket(train: RoundTrip[], test: RoundTrip[], ctx: Context = {}): BaselineResult {
  const keyers: { name: string; key: (t: RoundTrip) => string }[] = [
    { name: 'symbol_side', key: (t) => `${t.symbol}|${t.side}` },
    { name: 'product_session', key: (t) => `${t.product}|${tagTrip(t, [], ctx.calendar).session}` },
  ];
  let worst: { name: string; bucket: string; total: number; key: (t: RoundTrip) => string } | null = null;
  for (const k of keyers) {
    const totals = new Map<string, number>();
    for (const t of train) totals.set(k.key(t), (totals.get(k.key(t)) ?? 0) + num(t.netPnl));
    for (const [bucket, total] of [...totals.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (!worst || total < worst.total) worst = { name: k.name, bucket, total, key: k.key };
    }
  }
  if (!worst || worst.total >= 0) return { bucket: null, trainTotal: worst?.total ?? 0, deltaTest: 0, removedTest: 0 };
  const hit = test.filter((t) => (worst as NonNullable<typeof worst>).key(t) === (worst as NonNullable<typeof worst>).bucket);
  return {
    bucket: `${worst.name}:${worst.bucket}`,
    trainTotal: worst.total,
    deltaTest: -totalOf(hit.map((t) => num(t.netPnl))),
    removedTest: hit.length,
  };
}

export interface HoldoutOutcome {
  traderId: string;
  verdict: Verdict;
  reason: string;
  nTrips: number;
  nTrain: number;
  nTest: number;
  splitTs: number;
  selection: Selection | null;
  freeze: FreezeRecord | null;
  test: null | {
    rule: Rule;
    deltaTest: number;
    affectedTest: number;
    p: number;
    shamMedian: number;
    shamDraws: number[];
    shamDesign: ShamResult['design'];
    baseline: BaselineResult;
    untestable: boolean;
  };
}

export function stageSelect(traderId: string, trips: RoundTrip[], ctx: Context, codeCommit: string, timestamp: string) {
  const split = splitTrips(trips);
  if (trips.length < MIN_TRIPS) return { split, selection: null, freeze: null, insufficient: `not enough trades: ${trips.length} closed, needs ${MIN_TRIPS}` };
  if (split.train.length < MIN_TRAIN || split.test.length < MIN_TEST) {
    return { split, selection: null, freeze: null, insufficient: `train ${split.train.length} (needs ${MIN_TRAIN}) or test ${split.test.length} (needs ${MIN_TEST}) too small` };
  }
  const selection = selectRule(split.train, ctx);
  return { split, selection, freeze: makeFreeze(traderId, split, selection, codeCommit, timestamp), insufficient: null };
}

export function stageTest(traderId: string, split: Split, selection: Selection, freeze: FreezeRecord | null, ctx: Context): HoldoutOutcome {
  const base = {
    traderId,
    nTrips: split.train.length + split.test.length,
    nTrain: split.train.length,
    nTest: split.test.length,
    splitTs: split.splitTs,
    selection,
    freeze,
  };
  if (!freeze) {
    return { ...base, verdict: 'NO_RULE_NEEDED', reason: 'no candidate passed the train filters with a positive train gain', test: null };
  }
  const real = applyRule(split.test, freeze.rule, ctx);
  const rng = rngFromHex(freeze.sha256);
  const sham = shamTest(freeze.rule, split.test, real, rng);
  const baseline = baselineBucket(split.train, split.test, ctx);
  const deltaTest = num(real.delta);
  const adopt = !real.untestableRule && deltaTest > 0 && sham.p <= ALPHA;
  return {
    ...base,
    verdict: adopt ? 'ADOPT_WORTHY' : 'NO_RULE_NEEDED',
    reason: real.untestableRule
      ? `selected rule is untestable on test data: ${real.untestableReason}`
      : adopt
        ? 'test gain is positive and beats the same-size random sham'
        : deltaTest <= 0
          ? 'selected rule did not help on unseen trades'
          : `test gain does not beat the sham (p = ${sham.p.toFixed(3)})`,
    test: {
      rule: freeze.rule,
      deltaTest,
      affectedTest: real.affectedIds.length,
      p: sham.p,
      shamMedian: sham.medianDraw,
      shamDraws: sham.draws,
      shamDesign: sham.design,
      baseline,
      untestable: real.untestableRule,
    },
  };
}

export function runHoldout(traderId: string, trips: RoundTrip[], ctx: Context, codeCommit: string, timestamp: string): HoldoutOutcome {
  const staged = stageSelect(traderId, trips, ctx, codeCommit, timestamp);
  if (staged.insufficient || !staged.selection) {
    return {
      traderId,
      verdict: 'INSUFFICIENT',
      reason: staged.insufficient ?? 'insufficient',
      nTrips: trips.length,
      nTrain: staged.split.train.length,
      nTest: staged.split.test.length,
      splitTs: staged.split.splitTs,
      selection: null,
      freeze: null,
      test: null,
    };
  }
  return stageTest(traderId, staged.split, staged.selection, staged.freeze, ctx);
}
