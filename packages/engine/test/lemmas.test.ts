import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { D, sum } from '../src/decimal.ts';
import { ingest } from '../src/ingest.ts';
import { parseBitgetExport } from '../src/csv.ts';
import { ledgerFromFills } from '../src/ledger.ts';
import {
  NYSE_2026,
  earningsWindowHours,
  holdsAcrossOpen,
  holdsAcrossWeekend,
  intoFridayClose,
  tagSession,
  tagTrip,
  type EarningsEvent,
} from '../src/sessions.ts';
import { validLedgerInput } from './generators.ts';

const RUNS = { numRuns: 1000 };

describe('L1 ledger conservation', () => {
  it('sum of round trip net P&L equals sum execPnl minus fees plus funding', () => {
    fc.assert(
      fc.property(validLedgerInput, ({ fills, funding }) => {
        const ledger = ledgerFromFills('t', fills, funding);
        expect(ledger.flags.openPositions).toEqual([]);
        expect(ledger.flags.incompleteReasons).toEqual([]);
        const pnl = sum(fills.filter((f) => f.execPnl !== undefined).map((f) => f.execPnl as string));
        const fees = sum(fills.map((f) => f.fee));
        const fund = sum(funding.map((f) => f.amount));
        const lhs = sum(ledger.roundTrips.map((t) => t.netPnl));
        expect(lhs.toFixed()).toBe(pnl.minus(fees).plus(fund).toFixed());
      }),
      RUNS,
    );
  });
});

describe('L2 idempotent and order independent ingest', () => {
  it('ingest(A union A) equals ingest(A)', () => {
    fc.assert(
      fc.property(validLedgerInput, ({ fills }) => {
        expect(ingest(fills, fills).fills).toEqual(ingest(fills).fills);
      }),
      RUNS,
    );
  });

  it('ingest(A union B) is order independent and the ledger is identical', () => {
    fc.assert(
      fc.property(validLedgerInput, fc.infiniteStream(fc.nat()), ({ fills, funding }, stream) => {
        const split = fills.length >> 1;
        const a = fills.slice(0, split);
        const b = fills.slice(split);
        const shuffled = [...fills];
        const picks = stream[Symbol.iterator]();
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = (picks.next().value as number) % (i + 1);
          [shuffled[i], shuffled[j]] = [shuffled[j] as (typeof shuffled)[number], shuffled[i] as (typeof shuffled)[number]];
        }
        expect(ingest(a, b).fills).toEqual(ingest(b, a).fills);
        expect(ledgerFromFills('t', shuffled, funding)).toEqual(ledgerFromFills('t', [...a, ...b, ...a], funding));
      }),
      RUNS,
    );
  });
});

describe('P6 API fills merged with their CSV rendering', () => {
  it('leaves the ledger identical', () => {
    fc.assert(
      fc.property(validLedgerInput, ({ fills, funding }) => {
        // #given the same fills as an API list and as a CSV in the documented Bitget export columns
        const header = 'Trade ID,Order ID,Symbol,Side,Price,Quantity,Fee,Realized PnL,Time';
        const rows = fills.map((f) => [f.execId, f.orderId, f.symbol, `${f.tradeSide} ${f.posSide}`, f.price, f.qty, f.fee, f.execPnl ?? '', new Date(f.ts).toISOString()].join(','));
        const fromCsv = parseBitgetExport([header, ...rows].join('\n')).fills;

        // #when merged
        const merged = ledgerFromFills('t', [...fills, ...fromCsv], funding);

        // #then
        expect(merged).toEqual(ledgerFromFills('t', fills, funding));
      }),
      { numRuns: 300 },
    );
  });
});

describe('L6 no look-ahead', () => {
  const baseEvents: EarningsEvent[] = [
    { eventTs: Date.UTC(2026, 10, 19, 21), knownAtTs: Date.UTC(2026, 9, 1) },
    { eventTs: Date.UTC(2026, 7, 27, 21), knownAtTs: Date.UTC(2026, 6, 1) },
  ];

  it('tags are invariant to events and calendar entries that arrive after the trade timestamp', () => {
    const lo = Date.UTC(2026, 0, 1);
    const hi = Date.UTC(2026, 11, 31);
    fc.assert(
      fc.property(
        fc.integer({ min: lo, max: hi }),
        fc.array(fc.record({ eventTs: fc.integer({ min: lo, max: hi + 90 * 86_400_000 }), knownAtTs: fc.integer({ min: lo, max: hi }) }), { maxLength: 8 }),
        fc.integer({ min: 1, max: 5 * 86_400_000 }),
        (ts, extra, dur) => {
          const before = tagTrip({ openTs: ts, closeTs: ts + dur }, baseEvents);
          const lateOnly = extra.filter((e) => e.knownAtTs > ts);
          const after = tagTrip({ openTs: ts, closeTs: ts + dur }, [...baseEvents, ...lateOnly]);
          expect(after).toEqual(before);
          expect(earningsWindowHours(ts, [...baseEvents, ...lateOnly])).toBe(earningsWindowHours(ts, baseEvents));
        },
      ),
      RUNS,
    );
  });

  it('session tag depends only on the timestamp and the calendar', () => {
    fc.assert(
      fc.property(fc.integer({ min: Date.UTC(2026, 0, 1), max: Date.UTC(2026, 11, 31) }), (ts) => {
        expect(tagSession(ts, NYSE_2026)).toBe(tagSession(ts, { ...NYSE_2026 }));
        expect(holdsAcrossOpen(ts, ts + 3600_000)).toBe(holdsAcrossOpen(ts, ts + 3600_000, NYSE_2026));
      }),
      RUNS,
    );
  });
});

describe('session tags against known dates', () => {
  it('classifies a regular Thursday, a Saturday, a holiday, an early close and DST correctly', () => {
    expect(tagSession(Date.UTC(2026, 9, 8, 15, 0))).toBe('regular');
    expect(tagSession(Date.UTC(2026, 9, 8, 12, 0))).toBe('pre_market');
    expect(tagSession(Date.UTC(2026, 9, 8, 21, 0))).toBe('after_hours');
    expect(tagSession(Date.UTC(2026, 9, 8, 2, 0))).toBe('overnight');
    expect(tagSession(Date.UTC(2026, 9, 10, 22, 0))).toBe('weekend');
    expect(tagSession(Date.UTC(2026, 6, 3, 15, 0))).toBe('holiday');
    expect(tagSession(Date.UTC(2026, 10, 27, 19, 0))).toBe('early_close');
    expect(tagSession(Date.UTC(2026, 2, 9, 13, 30))).toBe('regular');
    expect(tagSession(Date.UTC(2026, 2, 6, 14, 29))).toBe('pre_market');
  });

  it('detects holds across the open, the weekend and the Friday close window', () => {
    expect(holdsAcrossOpen(Date.UTC(2026, 9, 8, 1, 0), Date.UTC(2026, 9, 8, 15, 0))).toBe(true);
    expect(holdsAcrossOpen(Date.UTC(2026, 9, 8, 15, 0), Date.UTC(2026, 9, 8, 16, 0))).toBe(false);
    expect(holdsAcrossWeekend(Date.UTC(2026, 9, 9, 18, 0), Date.UTC(2026, 9, 12, 14, 0))).toBe(true);
    expect(holdsAcrossWeekend(Date.UTC(2026, 9, 8, 15, 0), Date.UTC(2026, 9, 8, 16, 0))).toBe(false);
    expect(intoFridayClose(Date.UTC(2026, 9, 9, 19, 30))).toBe(true);
    expect(intoFridayClose(Date.UTC(2026, 9, 9, 17, 0))).toBe(false);
  });
});

describe('decimal helpers', () => {
  it('keeps exact arithmetic', () => {
    expect(D('0.1').plus('0.2').toFixed()).toBe('0.3');
  });
});
