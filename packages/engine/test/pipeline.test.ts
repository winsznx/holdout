import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { bootstrapCoverage, shamUniformity, syntheticTrips } from '../src/checks.ts';
import { D, sum } from '../src/decimal.ts';
import { stableStringify } from '../src/hash.ts';
import { applyRule, counterfactual } from '../src/rules/counterfactual.ts';
import { runHoldout, stageSelect } from '../src/rules/holdout.ts';
import type { Rule } from '../src/rules/schema.ts';
import { rngFromSeed } from '../src/stats.ts';
import type { RoundTrip } from '../src/types.ts';

const RUNS = { numRuns: 1000 };

const tripsArb = fc
  .integer({ min: 1, max: 40 })
  .chain((n) => fc.tuple(fc.integer({ min: 1, max: 1_000_000 }), fc.constant(n)))
  .map(([seed, n]) => syntheticTrips(n, rngFromSeed(seed), 0, 5));

const removalRule: fc.Arbitrary<Rule> = fc.oneof(
  fc.integer({ min: 1, max: 240 }).map((minutes): Rule => ({ t: 'cooldown_after_loss', minutes })),
  fc.integer({ min: 1, max: 20 }).map((usdt): Rule => ({ t: 'daily_loss_limit', usdt })),
);

describe('L3 null rule identity', () => {
  it('counterfactual(ledger, empty rule set) returns the ledger exactly', () => {
    fc.assert(
      fc.property(tripsArb, (trips) => {
        expect(counterfactual(trips, [])).toEqual(trips);
        expect(stableStringify(counterfactual(trips, []))).toBe(stableStringify(trips));
      }),
      RUNS,
    );
  });

  it('a rule that touches nothing changes nothing', () => {
    fc.assert(
      fc.property(tripsArb, (trips) => {
        const r = applyRule(trips, { t: 'daily_loss_limit', usdt: 1e12 });
        expect(r.delta).toBe('0');
        expect(counterfactual(trips, [{ t: 'daily_loss_limit', usdt: 1e12 }])).toEqual(trips);
      }),
      RUNS,
    );
  });
});

describe('L4 removal decomposition', () => {
  it('delta equals minus the sum of net P&L of removed trades', () => {
    fc.assert(
      fc.property(tripsArb, removalRule, (trips, rule) => {
        const r = applyRule(trips, rule);
        const removed = new Set(r.outcomes.filter((o) => o.kind === 'removed').map((o) => o.tripId));
        const expected = sum(trips.filter((t) => removed.has(t.id)).map((t) => t.netPnl)).neg();
        expect(D(r.delta).toFixed()).toBe(expected.toFixed());
      }),
      RUNS,
    );
  });
});

describe('L5 sham p-value validity', () => {
  it('a rule chosen without looking at outcomes gives p-values that are not below nominal rates more often than allowed', () => {
    const u = shamUniformity(200, 60);
    expect(u.seeds).toBeGreaterThan(150);
    expect(u.fractionBelow10).toBeLessThanOrEqual(0.1 + 0.07);
    expect(u.fractionBelow05).toBeLessThanOrEqual(0.05 + 0.05);
  });
});

describe('L7 bootstrap interval coverage', () => {
  it('90 percent interval covers the true sum in roughly 90 percent of trials', () => {
    const c = bootstrapCoverage(300, 30, 1000);
    expect(c.coverage).toBeGreaterThan(0.8);
    expect(c.coverage).toBeLessThan(0.97);
  });
});

describe('L8 selection blindness', () => {
  it('mutating any test period trade leaves the frozen selection byte identical', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100000 }), fc.integer({ min: 0, max: 1000 }), fc.double({ min: -500, max: 500, noNaN: true }), (seed, pick, newNet) => {
        const trips = syntheticTrips(90, rngFromSeed(seed), 0, 3);
        const before = stageSelect('t', trips, {}, 'c', 'ts');
        const testStart = before.split.train.length;
        const sorted = [...trips].sort((a, b) => a.closeTs - b.closeTs);
        const target = testStart + (pick % (sorted.length - testStart));
        const mutated: RoundTrip[] = sorted.map((t, i) => (i === target ? { ...t, netPnl: newNet.toFixed(6), grossPnl: newNet.toFixed(6) } : t));
        const after = stageSelect('t', mutated, {}, 'c', 'ts');
        expect(stableStringify({ s: after.selection, f: after.freeze })).toBe(stableStringify({ s: before.selection, f: before.freeze }));
      }),
      { numRuns: 200 },
    );
  });
});

describe('thresholds', () => {
  it('returns INSUFFICIENT under 30 trades', () => {
    const trips = syntheticTrips(20, rngFromSeed(5));
    expect(runHoldout('t', trips, {}, 'c', 'ts').verdict).toBe('INSUFFICIENT');
  });
});
