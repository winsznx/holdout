import type { RoundTrip } from '../types.ts';
import { D, num, str, sum } from '../decimal.ts';
import { sha256Hex } from '../hash.ts';
import { bootstrapSum, rngFromHex, type Interval } from '../stats.ts';
import { applyRule, type Context, type CounterfactualResult } from './counterfactual.ts';
import { renderRule } from './render.ts';
import type { Rule } from './schema.ts';

export const MIN_BREAKS_TO_PRICE = 5;
export const BOOTSTRAP_RESAMPLES = 10_000;

export type AuditStatus = 'priced' | 'not_enough_breaks' | 'no_breaks' | 'untestable';

export interface RuleAudit {
  rule: Rule;
  rendered: string;
  status: AuditStatus;
  breaks: number;
  brokenTripIds: string[];
  brokenExecIds: string[];
  costDelta: string;
  interval: Interval | null;
  untestableReason?: string;
  untestableTrips: number;
  tripsConsidered: number;
}

export function auditSeed(traderId: string, rule: Rule): string {
  return sha256Hex(`holdout-audit-v1|${traderId}|${JSON.stringify(rule)}`);
}

export function auditRule(traderId: string, trips: RoundTrip[], rule: Rule, ctx: Context = {}): RuleAudit {
  const result = applyRule(trips, rule, ctx);
  return summarize(traderId, trips, rule, result);
}

export function summarize(traderId: string, trips: RoundTrip[], rule: Rule, result: CounterfactualResult): RuleAudit {
  const byId = new Map(trips.map((t) => [t.id, t]));
  const broken = result.affectedIds.map((id) => byId.get(id) as RoundTrip);
  const deltas = result.outcomes
    .filter((o) => result.affectedIds.includes(o.tripId))
    .map((o) => D(o.cfNet).minus((byId.get(o.tripId) as RoundTrip).netPnl));
  const base = {
    rule,
    rendered: renderRule(rule),
    breaks: broken.length,
    brokenTripIds: broken.map((t) => t.id),
    brokenExecIds: broken.flatMap((t) => t.execIds),
    costDelta: str(sum(deltas)),
    untestableTrips: result.untestableIds.length,
    tripsConsidered: trips.length,
  };
  if (result.untestableRule) {
    return { ...base, status: 'untestable', interval: null, untestableReason: result.untestableReason };
  }
  if (broken.length === 0) return { ...base, status: 'no_breaks', interval: null };
  if (broken.length < MIN_BREAKS_TO_PRICE) return { ...base, status: 'not_enough_breaks', interval: null };
  const seed = auditSeed(traderId, rule);
  const interval = bootstrapSum(deltas.map(num), rngFromHex(seed), BOOTSTRAP_RESAMPLES, 0.9, seed.slice(0, 16));
  return { ...base, status: 'priced', interval };
}
