import { z } from 'zod';
import type { Fill, FundingRecord, ReferencePosition, RoundTrip } from '@holdout/engine';
import type { DataResult } from '@/lib/data-result';
import { loadPublicJson } from '@/lib/data-result';
import type { DeskHistory, HistoryKind } from './types';

export const KNOWN_SAMPLE_IDS = ['bot-R', 'bot-A', 'bot-V', 'bot-S', 'bot-C', 'strategy-backtest', 'strategy-paper'] as const;
export const DEFAULT_FALLBACK_ID = 'bot-R';

const KindSchema = z.enum(['bot', 'strategy-sample', 'human-demo', 'human-live']);

const MetaSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: KindSchema,
  source: z.string(),
  notes: z.array(z.string()).default([]),
  exportedAt: z.string().optional(),
  statedRules: z.array(z.string()).optional(),
  plantedLeak: z.string().optional(),
});

function isRecordWith(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && keys.every((k) => k in value);
}

const SampleSchema = z.object({
  meta: MetaSchema,
  fills: z.array(z.custom<Fill>((v) => isRecordWith(v, ['execId', 'symbol', 'qty', 'price', 'ts', 'tradeSide', 'posSide']))),
  funding: z.array(z.custom<FundingRecord>((v) => isRecordWith(v, ['id', 'symbol', 'ts', 'amount']))).default([]),
  reference: z.array(z.custom<ReferencePosition>((v) => isRecordWith(v, ['symbol', 'openTs', 'closeTs', 'netProfit']))).default([]),
  fundingSettlements: z.record(z.string(), z.array(z.number())).optional(),
  dayLevel: z.boolean().optional(),
  trips: z.array(z.custom<RoundTrip>((v) => isRecordWith(v, ['id', 'symbol', 'netPnl', 'openTs', 'closeTs']))).optional(),
});

export interface SampleMeta {
  id: string;
  label: string;
  kind: HistoryKind;
  source: string;
  notes: string[];
  exportedAt?: string;
  statedRules?: string[];
  plantedLeak?: string;
}

export interface LoadedSample {
  meta: SampleMeta;
  history: DeskHistory;
}

const IndexEntrySchema = z.union([
  z.string().transform((id) => ({ id })),
  z.object({ id: z.string(), label: z.string().optional(), kind: KindSchema.optional(), fills: z.number().optional(), roundTrips: z.number().optional() }),
]);

const IndexSchema = z
  .object({
    default: z.string().optional(),
    defaultId: z.string().optional(),
    samples: z.array(IndexEntrySchema).default([]),
  })
  .transform((v) => ({ defaultId: v.default ?? v.defaultId, entries: v.samples }));

export interface CatalogEntry {
  id: string;
  label?: string;
  kind?: HistoryKind;
  fills?: number;
  roundTrips?: number;
}

export interface SampleCatalog {
  defaultId: string;
  entries: CatalogEntry[];
  fromIndex: boolean;
  missing: string[];
}

export async function loadCatalog(): Promise<DataResult<SampleCatalog>> {
  const index = await loadPublicJson('/data/samples/index.json', (raw) => IndexSchema.parse(raw));
  if (index.status === 'error') return index;
  if (index.status === 'ok' && index.data.entries.length > 0) {
    const entries = index.data.entries;
    return { status: 'ok', data: { entries, defaultId: index.data.defaultId ?? entries[0]?.id ?? DEFAULT_FALLBACK_ID, fromIndex: true, missing: [] } };
  }
  const probed = await Promise.all(
    KNOWN_SAMPLE_IDS.map(async (id) => ({ id, result: await loadSampleFile(id) })),
  );
  const entries: CatalogEntry[] = [];
  const missing: string[] = [];
  for (const { id, result } of probed) {
    if (result.status === 'ok') {
      const { meta, history } = result.data;
      entries.push({ id, label: meta.label, kind: meta.kind, fills: history.fills.length, roundTrips: history.trips?.length });
    } else missing.push(id);
  }
  return { status: 'ok', data: { entries, defaultId: entries.find((e) => e.id === DEFAULT_FALLBACK_ID)?.id ?? entries[0]?.id ?? DEFAULT_FALLBACK_ID, fromIndex: false, missing } };
}

export async function loadSampleFile(id: string): Promise<DataResult<LoadedSample>> {
  return loadPublicJson(`/data/samples/${encodeURIComponent(id)}.json`, (raw) => {
    const parsed = SampleSchema.parse(raw);
    const { meta, ...rest } = parsed;
    const history: DeskHistory = {
      fills: rest.fills,
      funding: rest.funding,
      reference: rest.reference,
      fundingSettlements: rest.fundingSettlements,
      dayLevel: rest.dayLevel,
      trips: rest.trips,
    };
    return { meta, history };
  });
}
