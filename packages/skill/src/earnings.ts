import { etToUtc, type EarningsEvent } from '@holdout/engine';
import type { EarningsCalendarRow } from '@holdout/bitget';

const QUOTE_SUFFIX = /(USDT|USDC|USD)$/;
const PRE_MARKET_MINUTES = 8 * 60;
const MARKET_CLOSE_MINUTES = 16 * 60;
const BEFORE_OPEN_LABEL = '盘前';

export function underlyingOf(symbol: string): string {
  return symbol.trim().toUpperCase().replace(QUOTE_SUFFIX, '');
}

export function reportDateOf(row: EarningsCalendarRow): string | null {
  return (
    row.perf_report_dsclsr_date ??
    row.perf_brief_dsclsr_date ??
    row.perf_briefing_fore_dsclsr_date ??
    row.perf_report_fore_dsclsr_date ??
    null
  );
}

export function toEarningsEvents(rows: EarningsCalendarRow[], knownAtTs: number): Array<EarningsEvent & { date: string }> {
  const events: Array<EarningsEvent & { date: string }> = [];
  for (const row of rows) {
    const date = reportDateOf(row);
    if (date === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const minutes = row.is_trading_time === BEFORE_OPEN_LABEL ? PRE_MARKET_MINUTES : MARKET_CLOSE_MINUTES;
    events.push({ eventTs: etToUtc(date, minutes), knownAtTs, date });
  }
  return events;
}
