import { describe, expect, it } from 'vitest';
import type { RoundTrip } from '@holdout/engine';
import { deriveCheckContext, ideaTimeMs, nextEarningsDate } from './live';
import { parseIdeaStrict } from './parse';

const trip = (id: string, closeTs: number, net: string): RoundTrip => ({ id, closeTs, openTs: closeTs - 1000, netPnl: net }) as RoundTrip;
const DAY = 86_400_000;

describe('deriveCheckContext', () => {
  it('finds the latest losing close at or before the time and sums the UTC day', () => {
    const at = 10 * DAY + 5000;
    const ctx = deriveCheckContext([trip('a', 10 * DAY + 1000, '-4'), trip('b', 10 * DAY + 2000, '1.5'), trip('c', 9 * DAY, '-9'), trip('d', at + 1, '-100')], at);
    expect(ctx.lastLossClosedTs).toBe(10 * DAY + 1000);
    expect(ctx.dayRealizedUsdt).toBe(-2.5);
  });

  it('leaves the last loss undefined when there is none', () => {
    expect(deriveCheckContext([trip('a', 1000, '3')], 2000).lastLossClosedTs).toBeUndefined();
  });
});

describe('ideaTimeMs', () => {
  it('reads now and ISO timestamps and rejects the rest', () => {
    expect(ideaTimeMs('now', 5)).toBe(5);
    expect(ideaTimeMs('2026-10-12T14:00:00Z', 0)).toBe(Date.parse('2026-10-12T14:00:00Z'));
    expect(ideaTimeMs('tomorrow open', 0)).toBeNull();
  });
});

describe('nextEarningsDate', () => {
  it('returns the nearest future date and null when none is listed', () => {
    const dated = [
      { eventTs: 10, date: '2026-01-01' },
      { eventTs: 200, date: '2026-12-01' },
      { eventTs: 100, date: '2026-11-01' },
    ];
    const events = dated.map((d) => ({ eventTs: d.eventTs, knownAtTs: 0 }));
    expect(nextEarningsDate(events, dated, 50)).toBe('2026-11-01');
    expect(nextEarningsDate(events, dated, 500)).toBeNull();
  });
});

describe('parseIdeaStrict', () => {
  it('reads a complete idea', () => {
    expect(parseIdeaStrict('long NVDA 20x stock perp now', null)).toEqual({
      kind: 'idea',
      via: 'rules',
      idea: { symbol: 'NVDA', side: 'long', leverage: 20, product: 'stock_perp', time: 'now' },
    });
  });

  it('asks instead of guessing a missing field or product', () => {
    expect(parseIdeaStrict('NVDA 20x', null).kind).toBe('clarify');
    expect(parseIdeaStrict('long BTC 5x now', null).kind).toBe('clarify');
  });
});
