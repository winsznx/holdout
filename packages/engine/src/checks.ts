import type { RoundTrip } from './types.ts';
import { applyRule } from './rules/counterfactual.ts';
import { shamTest } from './rules/holdout.ts';
import type { Rule } from './rules/schema.ts';
import { bootstrapSum, rngFromSeed } from './stats.ts';

export function syntheticTrips(n: number, rng: () => number, mean = 0, sd = 1): RoundTrip[] {
  const normal = () => {
    const u = Math.max(rng(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  };
  let ts = 1_700_000_000_000;
  return Array.from({ length: n }, (_, i) => {
    const open = ts + Math.floor(rng() * 3_000_000);
    const close = open + 60_000 + Math.floor(rng() * 600_000);
    ts = close + Math.floor(rng() * 900_000);
    const net = (mean + sd * normal()).toFixed(6);
    return {
      id: `s${i}`,
      symbol: 'BTCUSDT',
      product: 'perp',
      side: 'long',
      entries: [],
      exits: [],
      openTs: open,
      closeTs: close,
      qty: '1',
      avgEntry: '1',
      avgExit: '1',
      grossPnl: net,
      fees: '0',
      funding: '0',
      netPnl: net,
      addedWhileLosing: false,
      liquidated: false,
      execIds: [`s${i}`],
    } satisfies RoundTrip;
  });
}

export interface ShamUniformity {
  seeds: number;
  histogram: number[];
  fractionBelow10: number;
  fractionBelow05: number;
}

export function shamUniformity(seeds = 200, tripsPerRun = 60): ShamUniformity {
  const bins = new Array<number>(10).fill(0);
  const rule: Rule = { t: 'cooldown_after_loss', minutes: 30 };
  let b10 = 0;
  let b05 = 0;
  let counted = 0;
  for (let s = 1; s <= seeds; s++) {
    const rng = rngFromSeed(s * 7919);
    const trips = syntheticTrips(tripsPerRun, rng, 0, 1).map((t, i) => ({ ...t, openTs: 1_700_000_000_000 + i * 600_000, closeTs: 1_700_000_000_000 + i * 600_000 + 300_000 }));
    const real = applyRule(trips, rule);
    if (real.affectedIds.length === 0) continue;
    const sham = shamTest(rule, trips, real, rngFromSeed(s * 104729), 1000);
    counted += 1;
    bins[Math.min(9, Math.floor(sham.p * 10))] = (bins[Math.min(9, Math.floor(sham.p * 10))] as number) + 1;
    if (sham.p <= 0.1) b10 += 1;
    if (sham.p <= 0.05) b05 += 1;
  }
  return { seeds: counted, histogram: bins, fractionBelow10: b10 / counted, fractionBelow05: b05 / counted };
}

export interface BootstrapCoverage {
  trials: number;
  n: number;
  resamples: number;
  coverage: number;
}

export function bootstrapCoverage(trials = 1000, n = 30, resamples = 2000, mean = 0.4, sd = 1): BootstrapCoverage {
  let covered = 0;
  const rng = rngFromSeed(424242);
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-12))) * Math.cos(2 * Math.PI * rng());
  for (let t = 0; t < trials; t++) {
    const values = Array.from({ length: n }, () => mean + sd * normal());
    const interval = bootstrapSum(values, rngFromSeed(t + 1), resamples, 0.9);
    const trueSum = n * mean;
    if (interval.lo <= trueSum && trueSum <= interval.hi) covered += 1;
  }
  return { trials, n, resamples, coverage: covered / trials };
}
