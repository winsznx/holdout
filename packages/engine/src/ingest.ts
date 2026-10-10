import type { Fill } from './types.ts';
import { D } from './decimal.ts';
import { sha256Hex } from './hash.ts';

export function weakExecId(f: Pick<Fill, 'orderId' | 'ts' | 'price' | 'qty' | 'side'>): string {
  const canon = [f.orderId, f.ts, D(f.price).toFixed(), D(f.qty).toFixed(), f.side].join('|');
  return `weak_${sha256Hex(canon).slice(0, 24)}`;
}

export function compareFills(a: Fill, b: Fill): number {
  if (a.ts !== b.ts) return a.ts - b.ts;
  return a.execId < b.execId ? -1 : a.execId > b.execId ? 1 : 0;
}

export interface IngestResult {
  fills: Fill[];
  duplicatesDropped: number;
  weakIdCount: number;
}

export function ingest(...sources: Fill[][]): IngestResult {
  const byId = new Map<string, Fill>();
  let total = 0;
  for (const source of sources) {
    for (const fill of source) {
      total += 1;
      const existing = byId.get(fill.execId);
      if (!existing || preferred(fill, existing)) byId.set(fill.execId, fill);
    }
  }
  const fills = [...byId.values()].sort(compareFills);
  return {
    fills,
    duplicatesDropped: total - fills.length,
    weakIdCount: fills.filter((f) => f.weakId).length,
  };
}

function preferred(candidate: Fill, existing: Fill): boolean {
  const score = (f: Fill) => (f.execPnl !== undefined ? 1 : 0) + (f.leverage !== undefined ? 1 : 0) + (f.clientOid ? 1 : 0);
  const diff = score(candidate) - score(existing);
  if (diff !== 0) return diff > 0;
  return JSON.stringify(candidate) < JSON.stringify(existing);
}
