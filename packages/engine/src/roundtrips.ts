import type { Decimal as DecimalType } from 'decimal.js';
import type { Direction, Exit, Fill, FundingRecord, LedgerFlags, Lot, RoundTrip } from './types.ts';
import { compareFills } from './ingest.ts';
import { D, Decimal, num, str, sum, ZERO } from './decimal.ts';
import { sha256Hex } from './hash.ts';

export interface BuildOptions {
  fundingSettlements?: Record<string, number[]>;
}

export interface BuildResult {
  roundTrips: RoundTrip[];
  flags: LedgerFlags;
}

interface Episode {
  symbol: string;
  side: Direction;
  product: Fill['product'];
  entries: Lot[];
  exits: Exit[];
  openQty: DecimalType;
  entryQty: DecimalType;
  entryCost: DecimalType;
  maxLeverage?: number;
  addedWhileLosing: boolean;
  execIds: string[];
}

const DUST = new Decimal('1e-12');

export function buildRoundTrips(fills: Fill[], funding: FundingRecord[], options: BuildOptions = {}): BuildResult {
  const groups = new Map<string, Fill[]>();
  for (const f of [...fills].sort(compareFills)) {
    const key = `${f.symbol}|${f.posSide}`;
    const list = groups.get(key);
    if (list) list.push(f);
    else groups.set(key, [f]);
  }

  const trips: RoundTrip[] = [];
  const reasons: string[] = [];
  const openPositions: LedgerFlags['openPositions'] = [];

  for (const list of groups.values()) {
    let ep: Episode | null = null;
    for (const f of list) {
      const qty = D(f.qty);
      const price = D(f.price);
      if (f.tradeSide === 'open') {
        if (!ep) {
          ep = {
            symbol: f.symbol,
            side: f.posSide,
            product: f.product,
            entries: [],
            exits: [],
            openQty: ZERO,
            entryQty: ZERO,
            entryCost: ZERO,
            addedWhileLosing: false,
            execIds: [],
          };
        }
        const avg = ep.entryQty.isZero() ? null : ep.entryCost.div(ep.entryQty);
        const losing = avg !== null && (f.posSide === 'long' ? price.lt(avg) : price.gt(avg));
        if (losing) ep.addedWhileLosing = true;
        ep.entries.push({ execId: f.execId, ts: f.ts, qty: f.qty, price: f.price, fee: f.fee, addedWhileLosing: losing });
        ep.openQty = ep.openQty.plus(qty);
        ep.entryQty = ep.entryQty.plus(qty);
        ep.entryCost = ep.entryCost.plus(qty.times(price));
        ep.execIds.push(f.execId);
        if (f.leverage !== undefined) ep.maxLeverage = Math.max(ep.maxLeverage ?? 0, f.leverage);
      } else {
        if (!ep) {
          reasons.push(`close without open: ${f.symbol} ${f.posSide} execId ${f.execId}`);
          continue;
        }
        ep.exits.push({ execId: f.execId, ts: f.ts, qty: f.qty, price: f.price, fee: f.fee, execPnl: f.execPnl });
        ep.openQty = ep.openQty.minus(qty);
        ep.execIds.push(f.execId);
        if (ep.openQty.abs().lte(DUST)) {
          trips.push(finalize(ep));
          ep = null;
        } else if (ep.openQty.lt(0)) {
          reasons.push(`close exceeds open qty: ${f.symbol} ${f.posSide} execId ${f.execId}`);
          trips.push(finalize(ep));
          ep = null;
        }
      }
    }
    if (ep && ep.entries.length > 0) {
      openPositions.push({ symbol: ep.symbol, side: ep.side, qty: str(ep.openQty) });
    }
  }

  trips.sort((a, b) => a.closeTs - b.closeTs || (a.id < b.id ? -1 : 1));
  const withFunding = attachFunding(trips, funding);
  reasons.push(...fundingGaps(withFunding, funding, options.fundingSettlements));

  return {
    roundTrips: withFunding,
    flags: {
      incomplete: reasons.length > 0,
      incompleteReasons: reasons,
      weakIdCount: fills.filter((f) => f.weakId).length,
      openPositions,
    },
  };
}

function finalize(ep: Episode): RoundTrip {
  const entryQty = ep.entryQty;
  const avgEntry = entryQty.isZero() ? ZERO : ep.entryCost.div(entryQty);
  const exitQty = sum(ep.exits.map((e) => e.qty));
  const exitCost = sum(ep.exits.map((e) => D(e.qty).times(e.price)));
  const avgExit = exitQty.isZero() ? ZERO : exitCost.div(exitQty);
  const dir = ep.side === 'long' ? 1 : -1;
  const allHavePnl = ep.exits.length > 0 && ep.exits.every((e) => e.execPnl !== undefined);
  const gross = allHavePnl
    ? sum(ep.exits.map((e) => e.execPnl as string))
    : sum(ep.exits.map((e) => D(e.price).minus(avgEntry).times(e.qty).times(dir)));
  const fees = sum([...ep.entries.map((l) => l.fee), ...ep.exits.map((e) => e.fee)]);
  const openTs = ep.entries[0]?.ts ?? 0;
  const closeTs = ep.exits[ep.exits.length - 1]?.ts ?? openTs;
  const id = `rt_${sha256Hex(ep.execIds.join('|')).slice(0, 16)}`;
  return {
    id,
    symbol: ep.symbol,
    product: ep.product,
    side: ep.side,
    entries: ep.entries,
    exits: ep.exits,
    openTs,
    closeTs,
    qty: str(entryQty),
    avgEntry: str(avgEntry),
    avgExit: str(avgExit),
    grossPnl: str(gross),
    fees: str(fees),
    funding: '0',
    netPnl: str(gross.minus(fees)),
    maxLeverage: ep.maxLeverage,
    addedWhileLosing: ep.addedWhileLosing,
    liquidated: false,
    execIds: ep.execIds,
  };
}

function attachFunding(trips: RoundTrip[], funding: FundingRecord[]): RoundTrip[] {
  const extra = new Map<string, DecimalType>();
  for (const rec of [...funding].sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1))) {
    const active = trips.filter((t) => t.symbol === rec.symbol && t.openTs <= rec.ts && rec.ts <= t.closeTs);
    if (active.length === 0) continue;
    const weights = active.map((t) => D(t.avgEntry).times(t.qty));
    const total = sum(weights);
    const amount = D(rec.amount);
    let allocated = ZERO;
    active.forEach((t, i) => {
      const isLast = i === active.length - 1;
      const share = isLast
        ? amount.minus(allocated)
        : amount.times(total.isZero() ? D(1).div(active.length) : (weights[i] as DecimalType).div(total)).toDecimalPlaces(12);
      allocated = allocated.plus(share);
      extra.set(t.id, (extra.get(t.id) ?? ZERO).plus(share));
    });
  }
  return trips.map((t) => {
    const f = extra.get(t.id);
    if (!f) return t;
    return { ...t, funding: str(f), netPnl: str(D(t.grossPnl).minus(t.fees).plus(f)) };
  });
}

function fundingGaps(trips: RoundTrip[], funding: FundingRecord[], settlements?: Record<string, number[]>): string[] {
  if (!settlements) return [];
  const reasons: string[] = [];
  for (const t of trips) {
    const times = settlements[t.symbol] ?? [];
    for (const s of times) {
      if (s <= t.openTs || s > t.closeTs) continue;
      const covered = funding.some((r) => r.symbol === t.symbol && Math.abs(r.ts - s) <= 60_000);
      if (!covered) reasons.push(`missing funding record: ${t.symbol} at ${new Date(s).toISOString()} inside ${t.id}`);
    }
  }
  return reasons;
}

export function tripNetNumber(t: RoundTrip): number {
  return num(t.netPnl);
}
