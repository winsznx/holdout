import type { Direction, RoundTrip, Session } from './types.ts';
import calendarData from './data/nyse-2026.json' with { type: 'json' };

export interface Calendar {
  holidays: Set<string>;
  earlyCloses: Set<string>;
  earlyCloseMinutes: number;
}

export interface EarningsEvent {
  eventTs: number;
  knownAtTs: number;
}

export interface TripTags {
  session: Session;
  holdsAcrossOpen: boolean;
  holdsAcrossWeekend: boolean;
  intoFridayClose: boolean;
  earningsWindowHours: number | null;
}

export const NYSE_2026: Calendar = {
  holidays: new Set(calendarData.holidays),
  earlyCloses: new Set(calendarData.earlyCloses),
  earlyCloseMinutes: calendarData.earlyCloseMinutes,
};

const ET = 'America/New_York';
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ET,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

interface EtParts {
  date: string;
  weekday: number;
  minutes: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function etParts(ts: number): EtParts {
  const parts = formatter.formatToParts(new Date(ts));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAYS.indexOf(get('weekday')),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

export function etToUtc(date: string, minutes: number): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  let guess = Date.UTC(y, m - 1, d, 0, minutes);
  for (let i = 0; i < 3; i++) {
    const p = etParts(guess);
    const [py, pm, pd] = p.date.split('-').map(Number) as [number, number, number];
    const diff = (Date.UTC(y, m - 1, d, 0, minutes) - Date.UTC(py, pm - 1, pd, 0, p.minutes)) as number;
    if (diff === 0) break;
    guess += diff;
  }
  return guess;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const OPEN = 9 * 60 + 30;
const CLOSE = 16 * 60;

function isTradingDay(date: string, weekday: number, cal: Calendar): boolean {
  return weekday !== 0 && weekday !== 6 && !cal.holidays.has(date);
}

export function tagSession(ts: number, cal: Calendar = NYSE_2026): Session {
  const { date, weekday, minutes } = etParts(ts);
  if (weekday === 6) return 'weekend';
  if (weekday === 5 && minutes >= 20 * 60) return 'weekend';
  if (weekday === 0) return minutes < 20 * 60 ? 'weekend' : 'overnight';
  if (cal.holidays.has(date)) return 'holiday';
  if (minutes < 4 * 60) return 'overnight';
  if (minutes < OPEN) return 'pre_market';
  const close = cal.earlyCloses.has(date) ? cal.earlyCloseMinutes : CLOSE;
  if (minutes < close) return 'regular';
  if (cal.earlyCloses.has(date) && minutes < CLOSE) return 'early_close';
  if (minutes < 20 * 60) return 'after_hours';
  return 'overnight';
}

export function intoFridayClose(ts: number, cal: Calendar = NYSE_2026): boolean {
  const { date, weekday, minutes } = etParts(ts);
  if (weekday !== 5 || !isTradingDay(date, weekday, cal)) return false;
  const close = cal.earlyCloses.has(date) ? cal.earlyCloseMinutes : CLOSE;
  return minutes >= close - 60 && minutes < close;
}

export function holdsAcrossOpen(openTs: number, closeTs: number, cal: Calendar = NYSE_2026): boolean {
  let date = etParts(openTs).date;
  const last = etParts(closeTs).date;
  for (let guard = 0; guard < 400 && date <= last; guard++) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (isTradingDay(date, weekday, cal)) {
      const t = etToUtc(date, OPEN);
      if (openTs < t && closeTs >= t) return true;
    }
    date = addDays(date, 1);
  }
  return false;
}

export function holdsAcrossWeekend(openTs: number, closeTs: number): boolean {
  let date = addDays(etParts(openTs).date, -3);
  const last = etParts(closeTs).date;
  for (let guard = 0; guard < 400 && date <= last; guard++) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (weekday === 5) {
      const start = etToUtc(date, 20 * 60);
      const end = etToUtc(addDays(date, 2), 20 * 60);
      if (openTs < end && closeTs > start) return true;
    }
    date = addDays(date, 1);
  }
  return false;
}

export function earningsWindowHours(ts: number, events: EarningsEvent[]): number | null {
  let best: number | null = null;
  for (const e of events) {
    if (e.knownAtTs > ts || e.eventTs <= ts) continue;
    const hours = (e.eventTs - ts) / 3_600_000;
    if (best === null || hours < best) best = hours;
  }
  return best;
}

export function tagTrip(
  trip: Pick<RoundTrip, 'openTs' | 'closeTs'>,
  earnings: EarningsEvent[] = [],
  cal: Calendar = NYSE_2026,
): TripTags {
  return {
    session: tagSession(trip.openTs, cal),
    holdsAcrossOpen: holdsAcrossOpen(trip.openTs, trip.closeTs, cal),
    holdsAcrossWeekend: holdsAcrossWeekend(trip.openTs, trip.closeTs),
    intoFridayClose: intoFridayClose(trip.openTs, cal),
    earningsWindowHours: earningsWindowHours(trip.openTs, earnings),
  };
}

export type { Direction };
