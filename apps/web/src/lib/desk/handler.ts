import { analyzeHistory, auditAll, parseCsvText, type AnalysisSeed } from './pipeline';
import { normalizeSyncPayload } from './sync-normalize';
import type { WorkerRequest, WorkerResult } from './worker-protocol';

export function createHandler(): (request: WorkerRequest) => WorkerResult {
  let seed: AnalysisSeed | null = null;
  return (request) => {
    switch (request.type) {
      case 'parse-csv': {
        const { adapter, history, report } = parseCsvText(request.text);
        return { type: 'parse-csv', value: { adapter, history, report } };
      }
      case 'normalize-sync':
        return { type: 'normalize-sync', value: normalizeSyncPayload(request.payload) };
      case 'analyze': {
        const out = analyzeHistory(request.traderId, request.history, request.candles);
        seed = out.seed;
        return { type: 'analyze', value: out.base };
      }
      case 'audit': {
        if (!seed) throw new Error('No history is analyzed yet');
        return { type: 'audit', value: auditAll(seed, request.rules) };
      }
    }
  };
}
