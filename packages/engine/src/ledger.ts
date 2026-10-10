import type { Fill, FundingRecord, Ledger, ReferencePosition, RoundTrip } from './types.ts';
import { ingest } from './ingest.ts';
import { buildRoundTrips, type BuildOptions } from './roundtrips.ts';

export function ledgerFromFills(
  traderId: string,
  fills: Fill[],
  funding: FundingRecord[] = [],
  options: BuildOptions = {},
): Ledger {
  const ingested = ingest(fills);
  const uniqueFunding = [...new Map(funding.map((f) => [f.id, f])).values()].sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
  const built = buildRoundTrips(ingested.fills, uniqueFunding, options);
  return { traderId, fills: ingested.fills, funding: uniqueFunding, roundTrips: built.roundTrips, flags: built.flags };
}

export function ledgerFromTrips(traderId: string, fills: Fill[], roundTrips: RoundTrip[], notes: string[] = []): Ledger {
  const sorted = [...roundTrips].sort((a, b) => a.closeTs - b.closeTs || (a.id < b.id ? -1 : 1));
  return {
    traderId,
    fills,
    funding: [],
    roundTrips: sorted,
    flags: { incomplete: notes.length > 0, incompleteReasons: notes, weakIdCount: 0, openPositions: [] },
  };
}

export function referenceFromTrips(trips: RoundTrip[]): ReferencePosition[] {
  return trips.map((t) => ({ symbol: t.symbol, openTs: t.openTs, closeTs: t.closeTs, side: t.side, netProfit: t.netPnl }));
}
