import { z } from 'zod';
import { auditRule, ledgerFromFills, ledgerFromTrips, num, reconcile, type Fill, type FundingRecord, type ReferencePosition, type RoundTrip, type Reconciliation, type Rule, type RuleAudit } from '@holdout/engine';
import { readPublicJson } from './data';
import type { DataResult } from './data-result';

export const SampleKindSchema = z.enum(['bot', 'strategy-sample', 'human-demo', 'human-live']);
export type SampleKind = z.infer<typeof SampleKindSchema>;

const MetaSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: SampleKindSchema,
  source: z.string(),
  notes: z.array(z.string()).default([]),
  statedRules: z.array(z.string()).optional(),
  plantedLeak: z.string().optional(),
});

export interface SampleFile {
  meta: z.infer<typeof MetaSchema>;
  fills: Fill[];
  funding: FundingRecord[];
  reference: ReferencePosition[];
  dayLevel?: boolean;
  trips?: RoundTrip[];
}

const SampleSchema = z.object({
  meta: MetaSchema,
  fills: z.array(z.custom<Fill>()),
  funding: z.array(z.custom<FundingRecord>()).default([]),
  reference: z.array(z.custom<ReferencePosition>()).default([]),
  dayLevel: z.boolean().optional(),
  trips: z.array(z.custom<RoundTrip>()).optional(),
});

const IndexEntrySchema = z.union([z.string().transform((id) => ({ id })), z.object({ id: z.string() }).passthrough()]);

const IndexSchema = z
  .object({
    default: z.string().optional(),
    defaultId: z.string().optional(),
    samples: z.array(IndexEntrySchema).default([]),
  })
  .transform((v) => ({ defaultId: v.default ?? v.defaultId ?? v.samples[0]?.id, ids: v.samples.map((s) => s.id) }));

export type SampleIndex = z.infer<typeof IndexSchema>;

export function loadSampleIndex(): Promise<DataResult<SampleIndex>> {
  return readPublicJson('data/samples/index.json', (raw) => IndexSchema.parse(raw));
}

export function loadSample(id: string): Promise<DataResult<SampleFile>> {
  return readPublicJson(`data/samples/${id}.json`, (raw) => SampleSchema.parse(raw) as SampleFile);
}

export async function loadDefaultSample(): Promise<DataResult<SampleFile>> {
  const index = await loadSampleIndex();
  if (index.status !== 'ok') return index;
  if (!index.data.defaultId) return { status: 'absent' };
  return loadSample(index.data.defaultId);
}

const EXAMPLE_RULES: Rule[] = [
  { t: 'cooldown_after_loss', minutes: 3 },
  { t: 'no_add_to_loser' },
  { t: 'max_leverage', x: 10 },
  { t: 'daily_loss_limit', usdt: 50 },
];

export interface HeroRule {
  audit: RuleAudit;
  effect: { value: number; lo: number; hi: number } | null;
  closedTrips: number;
}

function ledgerOf(sample: SampleFile) {
  return sample.trips ? ledgerFromTrips(sample.meta.id, sample.fills, sample.trips) : ledgerFromFills(sample.meta.id, sample.fills, sample.funding);
}

export interface SampleFacts {
  label: string;
  fills: number;
  closedTrips: number;
  reconciliation: Reconciliation | null;
}

export function sampleFacts(sample: SampleFile): SampleFacts {
  const trips = ledgerOf(sample).roundTrips;
  return {
    label: sample.meta.label,
    fills: sample.fills.length,
    closedTrips: trips.length,
    reconciliation: sample.reference.length > 0 ? reconcile(trips, sample.reference) : null,
  };
}

export function auditSample(sample: SampleFile): HeroRule | null {
  const ledger = ledgerOf(sample);
  const trips = ledger.roundTrips;
  if (trips.length === 0) return null;
  const audits = EXAMPLE_RULES.map((rule) => auditRule(sample.meta.id, trips, rule));
  const pick = audits.find((a) => a.status === 'priced') ?? audits.find((a) => a.breaks > 0) ?? audits[0];
  if (!pick) return null;
  const effect = pick.interval
    ? { value: -num(pick.costDelta), lo: -pick.interval.hi, hi: -pick.interval.lo }
    : null;
  return { audit: pick, effect, closedTrips: trips.length };
}
