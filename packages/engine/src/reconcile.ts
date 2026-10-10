import type { ReferencePosition, RoundTrip } from './types.ts';
import { D, num, str, sum, ZERO } from './decimal.ts';

export interface SymbolReconciliation {
  symbol: string;
  ours: string;
  reference: string;
  delta: string;
  deltaPct: number;
  pass: boolean;
}

export interface Reconciliation {
  pass: boolean;
  totalOurs: string;
  totalReference: string;
  totalDelta: string;
  totalDeltaPct: number;
  perSymbol: SymbolReconciliation[];
  referenceRows: number;
  tripRows: number;
  reason?: string;
}

const TOTAL_LIMIT = 0.01;
const SYMBOL_LIMIT = 0.02;
const DUST = 1e-6;

export function reconcile(trips: RoundTrip[], refs: ReferencePosition[]): Reconciliation {
  const symbols = [...new Set([...trips.map((t) => t.symbol), ...refs.map((r) => r.symbol)])].sort();
  const perSymbol: SymbolReconciliation[] = symbols.map((symbol) => {
    const mine = trips.filter((t) => t.symbol === symbol);
    const theirs = refs.filter((r) => r.symbol === symbol);
    const ours = sum(mine.map((t) => t.netPnl));
    const reference = sum(theirs.map((r) => r.netProfit));
    const delta = ours.minus(reference);
    const scale = sum(mine.map((t) => D(t.netPnl).abs()));
    const pct = scale.isZero() ? (delta.abs().lte(DUST) ? 0 : 1) : num(delta.abs().div(scale));
    return {
      symbol,
      ours: str(ours),
      reference: str(reference),
      delta: str(delta),
      deltaPct: pct,
      pass: delta.abs().lte(DUST) || pct <= SYMBOL_LIMIT,
    };
  });
  const totalOurs = sum(trips.map((t) => t.netPnl));
  const totalReference = sum(refs.map((r) => r.netProfit));
  const totalDelta = totalOurs.minus(totalReference);
  const totalScale = sum(trips.map((t) => D(t.netPnl).abs()));
  const totalPct = totalScale.isZero() ? (totalDelta.abs().lte(DUST) ? 0 : 1) : num(totalDelta.abs().div(totalScale));
  const totalPass = totalDelta.abs().lte(DUST) || totalPct <= TOTAL_LIMIT;
  const failing = perSymbol.filter((s) => !s.pass).map((s) => s.symbol);
  const pass = totalPass && failing.length === 0;
  return {
    pass,
    totalOurs: str(totalOurs),
    totalReference: str(totalReference),
    totalDelta: str(totalDelta),
    totalDeltaPct: totalPct,
    perSymbol,
    referenceRows: refs.length,
    tripRows: trips.length,
    reason: pass
      ? undefined
      : !totalPass
        ? `total delta ${(totalPct * 100).toFixed(2)}% exceeds ${TOTAL_LIMIT * 100}%`
        : `symbols over ${SYMBOL_LIMIT * 100}%: ${failing.join(', ')}`,
  };
}

export const NO_REFERENCE: Reconciliation = {
  pass: false,
  totalOurs: str(ZERO),
  totalReference: str(ZERO),
  totalDelta: str(ZERO),
  totalDeltaPct: 0,
  perSymbol: [],
  referenceRows: 0,
  tripRows: 0,
  reason: 'no reference data',
};
