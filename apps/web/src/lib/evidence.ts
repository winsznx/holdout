import { z } from 'zod';
import { readPublicJson } from './data';
import type { DataResult } from './data-result';

export const EVIDENCE_SUMMARY_PATH = 'data/evidence/summary.json';
export const EVIDENCE_SUMMARY_URL = '/data/evidence/summary.json';

const SummarySchema = z.record(z.string(), z.unknown());
export type EvidenceSummary = z.infer<typeof SummarySchema>;

export function parseEvidenceSummary(raw: unknown): EvidenceSummary {
  return SummarySchema.parse(raw);
}

export function loadEvidenceSummary(): Promise<DataResult<EvidenceSummary>> {
  return readPublicJson(EVIDENCE_SUMMARY_PATH, parseEvidenceSummary);
}

export interface ScalarEntry {
  key: string;
  label: string;
  value: string;
}

export function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
}

export function scalarEntries(summary: EvidenceSummary): ScalarEntry[] {
  const out: ScalarEntry[] = [];
  for (const [key, value] of Object.entries(summary)) {
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      out.push({ key, label: humanizeKey(key), value: String(value) });
    }
  }
  return out;
}

export function structuredEntries(summary: EvidenceSummary): { key: string; label: string; json: string }[] {
  return Object.entries(summary)
    .filter(([, value]) => typeof value === 'object' && value !== null)
    .map(([key, value]) => ({ key, label: humanizeKey(key), json: JSON.stringify(value, null, 2) }));
}
