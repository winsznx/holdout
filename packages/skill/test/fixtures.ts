import { makeRulebook, type Rulebook } from '@holdout/engine';
import type { EarningsCalendarRow } from '@holdout/bitget';
import type { MarketData, SignalReading } from '../src/signals.ts';

/**
 * TEST FIXTURE ONLY. This rulebook is built in unit tests with makeRulebook from
 * invented numbers to exercise the tools. It is not trader history and must never
 * be shown to a user.
 */
export function testFixtureRulebook(): Rulebook {
  return makeRulebook({
    version: 1,
    traderId: 'test-fixture',
    label: 'TEST FIXTURE rulebook',
    createdAt: '2026-01-01T00:00:00.000Z',
    buckets: [
      { symbol: 'NVDAUSDT', product: 'stock_perp', side: 'long', session: 'regular', leverage: '10-20', holdsAcrossOpen: false, n: 4, winRate: 0.25, medianNet: -3.5, totalNet: -20 },
    ],
    ledger: { roundTrips: 4, reconciled: true, incomplete: false },
    rules: [
      { rule: { t: 'max_leverage', x: 10 }, status: 'stated', evidence: { breaks: 3, costDelta: '-12.5' } },
      { rule: { t: 'earnings_blackout', hoursBefore: 48 }, status: 'stated' },
      { rule: { t: 'cooldown_after_loss', minutes: 30 }, status: 'stated' },
      {
        rule: { t: 'daily_loss_limit', usdt: 50 },
        status: 'proposed',
        evidence: { deltaTest: 4.2, p: 0.03, shamMedian: 0.4, baselineDelta: 1.1, nTrain: 40, nTest: 18, freezeSha256: 'f'.repeat(64) },
      },
    ],
  });
}

export const WEDNESDAY_REGULAR_SESSION = Date.UTC(2026, 9, 14, 18, 0, 0);

export function earningsRow(date: string): EarningsCalendarRow {
  return {
    symbol: 'NVDA',
    period_ending: '2026-10-25',
    fiscal_year: '2027',
    report_type_name: 'Q3',
    perf_briefing_fore_dsclsr_date: date,
    perf_brief_dsclsr_date: null,
    perf_report_dsclsr_date: null,
    perf_report_fore_dsclsr_date: null,
    is_trading_time: '盘后',
    time: 0,
  };
}

export const LIVE_SIGNALS: SignalReading[] = [
  { source: 'technical_analysis', result: { available: true, surface: 'S6', data: [{ label: 'RSI', value: '47.09' }, { label: 'Verdict', value: 'NEUTRAL' }] } },
  { source: 'crypto_derivatives', result: { available: false, surface: 'S6', reason: 'no ticker' } },
];

export const DOWN_SIGNALS: SignalReading[] = [
  { source: 'technical_analysis', result: { available: false, surface: 'S6', reason: 'upstream error' } },
  { source: 'crypto_derivatives', result: { available: false, surface: 'S6', reason: 'timeout' } },
];

export function fakeMarketData(overrides: Partial<MarketData> = {}): MarketData {
  return {
    getEarnings: async () => ({ available: true, surface: 'S5', data: [earningsRow('2026-10-15')] }),
    getSignals: async () => LIVE_SIGNALS,
    ...overrides,
  };
}
