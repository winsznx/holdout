import { describe, expect, it } from 'vitest';
import { syntheticTrips } from '../src/checks.ts';
import { checkTrade, makeRulebook, similarTradeIndex, verifyRulebook } from '../src/rulebook.ts';
import { rngFromSeed } from '../src/stats.ts';

// Test fixture: synthetic trips built by the engine's own check helper, used only inside unit tests.
const trips = syntheticTrips(40, rngFromSeed(11), 0.2, 2).map((t, i) => ({ ...t, maxLeverage: i % 2 ? 5 : 15 }));

describe('rulebook', () => {
  const book = makeRulebook({
    version: 1,
    traderId: 'unit',
    label: 'unit',
    createdAt: '2026-01-01T00:00:00.000Z',
    rules: [
      { rule: { t: 'max_leverage', x: 10 }, status: 'stated' },
      { rule: { t: 'cooldown_after_loss', minutes: 5 }, status: 'stated' },
      { rule: { t: 'hard_stop', pct: 2 }, status: 'rejected' },
    ],
    buckets: similarTradeIndex(trips),
    ledger: { roundTrips: trips.length, reconciled: true, incomplete: false },
  });

  it('verifies and detects tampering', () => {
    expect(verifyRulebook(book)).toBe(true);
    expect(verifyRulebook({ ...book, label: 'changed' })).toBe(false);
  });

  it('flags a leverage above the cap, skips rejected rules and reports what it cannot check', () => {
    const check = checkTrade(book, { symbol: 'BTCUSDT', side: 'long', leverage: 20, product: 'perp', time: Date.UTC(2026, 9, 8, 15) });
    expect(check.rules.map((r) => r.state)).toEqual(['broken', 'not_checkable']);
    expect(check.broken).toBe(1);
    const ok = checkTrade(book, { symbol: 'BTCUSDT', side: 'long', leverage: 5, product: 'perp', time: Date.UTC(2026, 9, 8, 15) }, { lastLossClosedTs: Date.UTC(2026, 9, 8, 14) });
    expect(ok.rules.map((r) => r.state)).toEqual(['ok', 'ok']);
  });

  it('reports a missing similar-trade bucket instead of guessing', () => {
    const check = checkTrade(book, { symbol: 'ZZZUSDT', side: 'short', leverage: 3, product: 'perp', time: Date.UTC(2026, 9, 8, 15) });
    expect(check.similar.found).toBe(false);
    expect(check.similar.winRate).toBeNull();
  });
});
