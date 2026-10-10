import type { Fill, FundingRecord, Ledger, ReferencePosition, RoundTrip } from '../../packages/engine/src/index.ts';
import { ledgerFromFills, ledgerFromTrips } from '../../packages/engine/src/index.ts';

export type HistoryKind = 'bot' | 'strategy-sample' | 'human-demo' | 'human-live';

export interface HistoryMeta {
  id: string;
  label: string;
  kind: HistoryKind;
  source: string;
  notes: string[];
  exportedAt: string;
  statedRules?: string[];
  plantedLeak?: string;
}

export interface History {
  meta: HistoryMeta;
  fills: Fill[];
  funding: FundingRecord[];
  reference: ReferencePosition[];
  fundingSettlements?: Record<string, number[]>;
  dayLevel?: boolean;
  trips?: RoundTrip[];
}

export function ledgerOf(history: History): Ledger {
  if (history.trips) return ledgerFromTrips(history.meta.id, history.fills, history.trips);
  return ledgerFromFills(history.meta.id, history.fills, history.funding, { fundingSettlements: history.fundingSettlements });
}
