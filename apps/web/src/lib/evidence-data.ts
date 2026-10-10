import { z } from 'zod';
import { RuleSchema } from '@holdout/engine';
import { loadPublicJson, type DataResult } from './data-result';

export const EVIDENCE_BASE = '/data/evidence';
export const BUNDLE_URL = '/evidence/bundle.zip';

const Interval = z.object({ lo: z.number(), hi: z.number() }).nullable();

const AuditSchema = z.object({
  rule: RuleSchema,
  rendered: z.string(),
  status: z.enum(['priced', 'not_enough_breaks', 'no_breaks', 'untestable']),
  breaks: z.number(),
  costDelta: z.string(),
  interval: Interval,
  untestableReason: z.string().optional(),
  tripsConsidered: z.number(),
});

const CandidateSchema = z.object({
  rule: RuleSchema,
  deltaTrain: z.number(),
  affectedTrain: z.number(),
  rate: z.number(),
  eligible: z.boolean(),
  skippedReason: z.string().optional(),
});

const FreezeSchema = z.object({
  sha256: z.string(),
  rule: RuleSchema,
  codeCommit: z.string(),
  timestamp: z.string(),
  nTrain: z.number(),
  trainStats: z.object({ n: z.number(), deltaTrain: z.number(), affectedTrain: z.number(), netTrain: z.number() }),
});

const TestSchema = z.object({
  rule: RuleSchema,
  deltaTest: z.number(),
  affectedTest: z.number(),
  p: z.number(),
  shamMedian: z.number(),
  shamDraws: z.array(z.number()),
  shamDesign: z.enum(['remove_k_random', 'modify_k_random', 'none']),
  baseline: z.object({ bucket: z.string().nullable(), trainTotal: z.number(), deltaTest: z.number(), removedTest: z.number() }),
  untestable: z.boolean(),
});

const OutcomeSchema = z.object({
  traderId: z.string(),
  verdict: z.enum(['ADOPT_WORTHY', 'NO_RULE_NEEDED', 'INSUFFICIENT']),
  reason: z.string(),
  nTrips: z.number(),
  nTrain: z.number(),
  nTest: z.number(),
  selection: z.object({ candidates: z.array(CandidateSchema), top3: z.array(CandidateSchema), selected: CandidateSchema.nullable() }).nullable(),
  freeze: FreezeSchema.nullable(),
  test: TestSchema.nullable(),
});

export const TraderResultSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(['bot', 'strategy-sample', 'human-demo', 'human-live']),
  cohort: z.string(),
  nTrips: z.number(),
  recon: z.object({
    pass: z.boolean(),
    totalOurs: z.string(),
    totalReference: z.string(),
    totalDelta: z.string(),
    totalDeltaPct: z.number(),
    reason: z.string().optional(),
  }),
  blocked: z.string().nullable(),
  audits: z.array(AuditSchema),
  outcome: OutcomeSchema,
});
export type TraderResult = z.infer<typeof TraderResultSchema>;

const CohortSchema = z.object({
  cohort: z.string(),
  traders: z.number(),
  tested: z.number(),
  medianDeltaTest: z.number().nullable(),
  medianShamMedian: z.number().nullable(),
  adoptWorthy: z.number(),
  headline: z.enum(['audit', 'discovered_rules_help']),
  killRuleApplied: z.boolean(),
});
export type Cohort = z.infer<typeof CohortSchema>;

const ManifestSchema = z.object({
  runId: z.string(),
  commit: z.string(),
  node: z.string(),
  pnpm: z.string(),
  preregSha256: z.string(),
  dataHashes: z.record(z.string(), z.string()),
  seeds: z.string(),
  llm: z.unknown().nullable(),
  createdAt: z.string(),
});

const Status = z.string();

const P1bSchema = z.object({
  rules: z.array(z.string()),
  matrix: z.array(
    z.object({
      bot: z.string(),
      plantedLeak: z.string().nullable(),
      cells: z.array(
        z.object({
          rule: z.string(),
          status: z.string(),
          breaks: z.number(),
          cost: z.string(),
          intervalLo: z.number().nullable(),
          intervalHi: z.number().nullable(),
          flagged: z.boolean(),
        }),
      ),
      topProposal: z.string().nullable(),
    }),
  ),
  audit: z.object({ tp: z.number(), fp: z.number(), fn: z.number(), precision: z.number().nullable(), recall: z.number().nullable() }),
  proposals: z.object({ targetedOwnLeak: z.number(), targetedOtherRule: z.number() }),
});

const P7Schema = z.object({
  sourcesDisabled: z.array(z.string()),
  rows: z.array(
    z.object({
      id: z.string(),
      probes: z.number(),
      untestableFull: z.number(),
      untestableAblated: z.number(),
      becameUntestable: z.number(),
      auditedCostVanished: z.number(),
    }),
  ),
  totalBecameUntestable: z.number(),
  totalCostVanished: z.number(),
});

const CampaignSchema = z.object({
  p1b: P1bSchema.optional(),
  p2: z.looseObject({ status: Status.optional(), pass: z.boolean().optional(), verdict: z.string().optional(), reason: z.string().optional(), traderId: z.string().optional() }).optional(),
  p3: z.looseObject({ status: Status.optional(), reason: z.string().optional() }).optional(),
  p4: z.looseObject({ status: Status.optional(), reason: z.string().optional() }).optional(),
  p5: z.looseObject({ status: Status.optional(), note: z.string().optional() }).optional(),
  p6: z.looseObject({ status: Status.optional(), note: z.string().optional() }).optional(),
  p7: P7Schema.optional(),
  p9: z.looseObject({ status: Status.optional(), reason: z.string().optional() }).optional(),
});
export type Campaign = z.infer<typeof CampaignSchema>;

export const EvidenceSummarySchema = z.object({
  manifest: ManifestSchema,
  cohorts: z.array(CohortSchema),
  results: z.array(TraderResultSchema),
  campaign: CampaignSchema,
});
export type EvidenceData = z.infer<typeof EvidenceSummarySchema>;

export const FirewallFileSchema = z.looseObject({ passes: z.number(), failures: z.number() });
export type FirewallFile = z.infer<typeof FirewallFileSchema>;

export function loadEvidenceData(): Promise<DataResult<EvidenceData>> {
  return loadPublicJson(`${EVIDENCE_BASE}/summary.json`, (raw) => EvidenceSummarySchema.parse(raw), { cache: 'no-store' });
}

export function loadTraderResult(traderId: string): Promise<DataResult<TraderResult>> {
  return loadPublicJson(`${EVIDENCE_BASE}/${encodeURIComponent(traderId)}.json`, (raw) => TraderResultSchema.parse(raw), { cache: 'no-store' });
}

export function loadFirewall(): Promise<DataResult<FirewallFile>> {
  return loadPublicJson(`${EVIDENCE_BASE}/firewall.json`, (raw) => FirewallFileSchema.parse(raw), { cache: 'no-store' });
}

export async function bundleAvailable(): Promise<boolean> {
  try {
    const res = await fetch(BUNDLE_URL, { method: 'HEAD', cache: 'no-store' });
    const type = res.headers.get('content-type') ?? '';
    return res.ok && (type.includes('zip') || type.includes('octet-stream'));
  } catch {
    return false;
  }
}

export type CampaignRowStatus = 'pass' | 'fail' | 'not_run' | 'reported';

export interface CampaignRow {
  id: string;
  name: string;
  status: CampaignRowStatus;
  detail: string;
}

function mapStatus(raw: string | undefined, fallbackPass?: boolean): CampaignRowStatus {
  if (raw === 'pass') return 'pass';
  if (raw === 'fail') return 'fail';
  if (raw === undefined && fallbackPass !== undefined) return fallbackPass ? 'pass' : 'fail';
  return 'not_run';
}

export function campaignRows(data: EvidenceData): CampaignRow[] {
  const c = data.campaign;
  const rows: CampaignRow[] = [];

  const p1b = c.p1b;
  if (p1b) {
    const leaky = p1b.matrix.filter((m) => m.plantedLeak !== null);
    const caught = leaky.filter((m) => m.cells.some((cell) => cell.rule === m.plantedLeak && cell.flagged));
    rows.push({
      id: 'P1',
      name: 'Positive: the audit prices the planted broken rule',
      status: leaky.length === 0 ? 'not_run' : caught.length === leaky.length ? 'pass' : 'fail',
      detail: `${caught.length} of ${leaky.length} leaky Bitget Demo bots had their planted rule flagged with an interval above zero. Read from the specificity matrix.`,
    });
    const clean = p1b.proposals.targetedOtherRule === 0 && p1b.proposals.targetedOwnLeak === leaky.length;
    rows.push({
      id: 'P1b',
      name: 'Specificity matrix',
      status: clean ? 'pass' : 'fail',
      detail: `Audit precision ${fmtRatio(p1b.audit.precision)}, recall ${fmtRatio(p1b.audit.recall)}. Top proposal hit its own leak for ${p1b.proposals.targetedOwnLeak} of ${leaky.length} leaky bots, and targeted another rule ${p1b.proposals.targetedOtherRule} times.`,
    });
  } else {
    rows.push({ id: 'P1', name: 'Positive: the audit prices the planted broken rule', status: 'not_run', detail: 'campaign.p1b is absent from the evaluation file.' });
    rows.push({ id: 'P1b', name: 'Specificity matrix', status: 'not_run', detail: 'campaign.p1b is absent from the evaluation file.' });
  }

  const p2 = c.p2;
  rows.push({
    id: 'P2',
    name: 'Healthy control returns no rule needed',
    status: p2 ? mapStatus(p2.status, p2.pass) : 'not_run',
    detail: p2 ? `${p2.traderId ?? 'control'}: ${p2.verdict ?? p2.status ?? 'no verdict'}${p2.reason ? `. ${p2.reason}` : ''}` : 'campaign.p2 is absent from the evaluation file.',
  });
  rows.push(plainRow('P3', 'Too little data stays audit only', c.p3));
  rows.push(plainRow('P4', 'Planted leak recall and cost', c.p4));
  rows.push(plainRow('P5', 'Missing funding window blocks proposals', c.p5));
  rows.push(plainRow('P6', 'API and CSV merge is byte identical', c.p6));

  const p7 = c.p7;
  rows.push({
    id: 'P7',
    name: 'Sponsor ablation',
    status: p7 ? 'reported' : 'not_run',
    detail: p7
      ? `With ${p7.sourcesDisabled.join(', ')} disabled, ${p7.totalBecameUntestable} rule checks became untestable and ${p7.totalCostVanished.toFixed(2)} USDT of audited cost vanished.`
      : 'campaign.p7 is absent from the evaluation file.',
  });
  rows.push({
    id: 'P8',
    name: 'Every trader through the same frozen pipeline',
    status: data.results.length > 0 ? 'reported' : 'not_run',
    detail: `${data.results.length} trader results are published below, failures and null results included.`,
  });

  const p9 = c.p9;
  const total = p9 ? numberField(p9, 'total') : null;
  rows.push({
    id: 'P9',
    name: 'Rule compiler on volunteer rules',
    status: p9 && total !== null && total > 0 ? 'reported' : 'not_run',
    detail: p9 && total !== null && total > 0 ? `${numberField(p9, 'correct') ?? 0} of ${total} volunteer rules compiled correctly.` : NO_VOLUNTEER_RULES,
  });
  return rows;
}

export const NO_VOLUNTEER_RULES = 'no volunteer rules received yet (n = 0)';

function plainRow(id: string, name: string, v: { status?: string; reason?: string; note?: string } | undefined): CampaignRow {
  if (!v) return { id, name, status: 'not_run', detail: `campaign.${id.toLowerCase()} is absent from the evaluation file.` };
  const status = mapStatus(v.status);
  const reason = v.reason ?? v.note ?? '';
  const detail = reason || (status === 'not_run' ? `status ${v.status ?? 'unknown'}` : `status ${status}`);
  return { id, name, status, detail };
}

export function numberField(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function fmtRatio(v: number | null): string {
  return v === null ? 'not defined' : v.toFixed(2);
}

export function cohortTitle(cohort: string): string {
  switch (cohort) {
    case 'bitget-demo-bots':
      return 'Bitget Demo bots';
    case 'strategy-sample':
      return 'Strategy samples';
    case 'human-demo':
      return 'Humans on Bitget Demo';
    case 'human-live':
      return 'Humans on live accounts';
    default:
      return cohort;
  }
}
