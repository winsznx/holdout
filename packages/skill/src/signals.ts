import {
  createS5Session,
  createS6Session,
  getEarningsCalendar,
  getTechnicalSignal,
  type EarningsCalendarRow,
  type JsonObject,
  type McpSession,
  type SurfaceResult,
} from '@holdout/bitget';

export interface SignalTag {
  label: string;
  value: string;
}

export interface SignalReading {
  source: 'technical_analysis' | 'crypto_derivatives';
  result: SurfaceResult<SignalTag[]>;
}

export interface MarketData {
  getEarnings(underlying: string): Promise<SurfaceResult<EarningsCalendarRow[]>>;
  getSignals(underlying: string): Promise<SignalReading[]>;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scalar(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function pick(source: unknown, path: string[]): string | undefined {
  let cursor: unknown = source;
  for (const key of path) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[key];
  }
  return scalar(cursor);
}

const TECHNICAL_TAGS: Array<{ label: string; path: string[] }> = [
  { label: 'RSI', path: ['rsi', 'rsi'] },
  { label: 'RSI signal', path: ['rsi', 'signal'] },
  { label: 'MACD cross', path: ['macd', 'cross'] },
  { label: 'MA trend', path: ['ma', 'trend'] },
  { label: 'ATR %', path: ['atr', 'atr_pct'] },
  { label: 'Verdict', path: ['verdict'] },
];

const DERIVATIVES_TAGS: Array<{ label: string; path: string[] }> = [
  { label: 'Last', path: ['last'] },
  { label: '24h change %', path: ['change_pct'] },
  { label: '24h quote volume', path: ['quote_volume'] },
];

function tagsFrom(source: unknown, spec: Array<{ label: string; path: string[] }>): SignalTag[] {
  const tags: SignalTag[] = [];
  for (const { label, path } of spec) {
    const value = pick(source, path);
    if (value !== undefined) tags.push({ label, value });
  }
  return tags;
}

async function readDerivatives(session: McpSession, pair: string): Promise<SurfaceResult<SignalTag[]>> {
  const called = await session.callJson('crypto_derivatives', { action: 'ticker_24h', exchange: 'bitget', symbol: pair });
  if (!called.available) return called;
  const tags = tagsFrom(called.data, DERIVATIVES_TAGS);
  if (tags.length === 0) return { available: false, surface: 'S6', reason: 'crypto_derivatives: no ticker fields in response' };
  return { available: true, surface: 'S6', data: tags };
}

export function createLiveMarketData(fetchImpl?: typeof fetch): MarketData {
  return {
    async getEarnings(underlying) {
      const session = createS5Session({ fetchImpl });
      try {
        return await getEarningsCalendar(session, { symbol: underlying });
      } finally {
        await session.close().catch(() => undefined);
      }
    },
    async getSignals(underlying) {
      const session = createS6Session({ fetchImpl });
      const pair = `${underlying}/USDT`;
      try {
        const [technical, derivatives] = await Promise.all([
          getTechnicalSignal(session, { symbol: pair }),
          readDerivatives(session, pair),
        ]);
        const technicalResult: SurfaceResult<SignalTag[]> = technical.available
          ? { available: true, surface: 'S6', data: tagsFrom(technical.data, TECHNICAL_TAGS) }
          : technical;
        return [
          { source: 'technical_analysis', result: technicalResult },
          { source: 'crypto_derivatives', result: derivatives },
        ];
      } finally {
        await session.close().catch(() => undefined);
      }
    },
  };
}
