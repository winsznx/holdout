import type { Rule, RuleAudit } from '@holdout/engine';
import type { RawSyncPayload } from './sync-normalize';
import type { BaseAnalysis, CandleStore, CsvAdapter, DeskHistory, ImportReport } from './types';

export type WorkerRequest =
  | { id: number; type: 'parse-csv'; text: string }
  | { id: number; type: 'normalize-sync'; payload: RawSyncPayload }
  | { id: number; type: 'analyze'; traderId: string; history: DeskHistory; candles: CandleStore }
  | { id: number; type: 'audit'; rules: Rule[] };

export interface ParsedImport {
  adapter?: CsvAdapter;
  history: DeskHistory;
  report: ImportReport;
}

export type WorkerResult =
  | { type: 'parse-csv'; value: ParsedImport }
  | { type: 'normalize-sync'; value: ParsedImport }
  | { type: 'analyze'; value: BaseAnalysis }
  | { type: 'audit'; value: Record<string, RuleAudit> };

export type WorkerResponse = { id: number; ok: true; result: WorkerResult } | { id: number; ok: false; error: string; name: string };
