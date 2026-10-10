import { buildProductClassifier, normalizeFill, normalizeFundingRecords, normalizeHistoryPosition } from '@holdout/bitget/src/normalize.ts';
import type { RawFill, RawFinancialRecord, RawHistoryPosition } from '@holdout/bitget/src/private.ts';
import type { Fill, ReferencePosition } from '@holdout/engine';
import { summarizeIngest } from './pipeline';
import type { DeskHistory, ImportReport } from './types';

export interface RawSyncPayload {
  fills: RawFill[];
  positions: RawHistoryPosition[];
  financial: RawFinancialRecord[];
  stockSymbols: string[] | null;
}

export function normalizeSyncPayload(raw: RawSyncPayload): { history: DeskHistory; report: ImportReport } {
  const classify = buildProductClassifier((raw.stockSymbols ?? []).map((symbol) => ({ symbol, symbolType: 'stock' })));
  const issues: ImportReport['issues'] = [];
  const fills: Fill[] = [];
  raw.fills.forEach((row, i) => {
    try {
      fills.push(normalizeFill(row, classify));
    } catch (e) {
      issues.push({ line: i + 1, reason: e instanceof Error ? e.message : 'could not normalize fill' });
    }
  });
  const reference: ReferencePosition[] = [];
  raw.positions.forEach((row, i) => {
    try {
      reference.push(normalizeHistoryPosition(row));
    } catch (e) {
      issues.push({ line: i + 1, reason: e instanceof Error ? e.message : 'could not normalize position' });
    }
  });
  const funding = normalizeFundingRecords(raw.financial);
  const notes: string[] = ['Imported USDT-FUTURES only. Spot and rToken fills are not imported yet.'];
  if (raw.stockSymbols === null) {
    notes.push('The Bitget stock futures list (S3) was unavailable, so every futures symbol is classed as a perp and stock perps are not separated.');
  }
  return {
    history: { fills, funding, reference },
    report: {
      ...summarizeIngest(fills),
      rowsRead: raw.fills.length,
      issues,
      untestedAgainstLiveExport: false,
      notes,
    },
  };
}
