import { BITGET_BASE_URL, expectArray, requestEnvelope, type FetchLike } from './http.ts';
import { BitgetError } from './errors.ts';

export type Category = 'SPOT' | 'USDT-FUTURES' | 'COIN-FUTURES' | 'USDC-FUTURES';
export type FuturesCategory = Exclude<Category, 'SPOT'>;
export type CandleInterval = '1m' | '3m' | '5m' | '15m' | '30m' | '1H' | '4H' | '6H' | '12H' | '1D';
export type CandleType = 'market' | 'mark' | 'index' | 'premium';

export const CANDLE_PAGE_LIMIT = 100;
export const FUNDING_PAGE_LIMIT = 100;
export const CANDLE_PAGE_LIMIT_HARD_MAX = 1000;

export const INTERVAL_MS: Record<CandleInterval, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1H': 3_600_000,
  '4H': 14_400_000,
  '6H': 21_600_000,
  '12H': 43_200_000,
  '1D': 86_400_000,
};

export interface Candle {
  ts: number;
  open: string;
  high: string;
  low: string;
  close: string;
  baseVolume: string;
  quoteVolume: string;
}

export interface CandleQuery {
  category: Category;
  symbol: string;
  interval: CandleInterval;
  type?: CandleType;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export interface FundingRatePoint {
  symbol: string;
  fundingRate: string;
  fundingRateTimestamp: string;
}

export interface CurrentFundingRate {
  symbol: string;
  fundingRate: string;
  fundingRateInterval: string;
  nextUpdate: string;
  minFundingRate: string;
  maxFundingRate: string;
  cashDividend: string;
  cashDividendNextUpdate: string;
}

export interface Instrument {
  symbol: string;
  category: string;
  baseCoin: string;
  quoteCoin: string;
  symbolType: string;
  isRwa: string;
  makerFeeRate: string;
  takerFeeRate: string;
  minOrderQty: string;
  maxOrderQty: string;
  pricePrecision: string;
  quantityPrecision: string;
  type: string;
  status: string;
  launchTime: string;
  fundInterval: string;
  minLeverage: string;
  maxLeverage: string;
}

export interface Ticker {
  category: string;
  symbol: string;
  ts: string;
  lastPrice: string;
  openPrice24h: string;
  highPrice24h: string;
  lowPrice24h: string;
  ask1Price: string;
  bid1Price: string;
  ask1Size: string;
  bid1Size: string;
  price24hPcnt: string;
  volume24h: string;
  turnover24h: string;
  indexPrice: string;
  markPrice: string;
  fundingRate: string;
}

export interface PublicClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export function parseCandleRow(row: unknown, endpoint: string): Candle {
  if (!Array.isArray(row) || row.length < 7 || row.some((cell) => typeof cell !== 'string')) {
    throw new BitgetError({ code: 'BAD_RESPONSE', msg: 'candle row must be 7 strings', endpoint });
  }
  const [ts, open, high, low, close, baseVolume, quoteVolume] = row as string[];
  const tsNumber = Number(ts);
  if (!Number.isFinite(tsNumber)) {
    throw new BitgetError({ code: 'BAD_RESPONSE', msg: `bad candle ts ${ts}`, endpoint });
  }
  return {
    ts: tsNumber,
    open: open as string,
    high: high as string,
    low: low as string,
    close: close as string,
    baseVolume: baseVolume as string,
    quoteVolume: quoteVolume as string,
  };
}

export class PublicClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: PublicClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? BITGET_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  private get<T>(endpoint: string, query: Record<string, string | number | undefined>): Promise<T> {
    return requestEnvelope<T>({
      fetchImpl: this.fetchImpl,
      baseUrl: this.baseUrl,
      endpoint,
      query,
      headers: { locale: 'en-US' },
    });
  }

  private async candleRows(endpoint: string, q: CandleQuery): Promise<Candle[]> {
    const data = await this.get<unknown>(endpoint, {
      category: q.category,
      symbol: q.symbol,
      interval: q.interval,
      type: q.type,
      startTime: q.startTime,
      endTime: q.endTime,
      limit: q.limit ?? CANDLE_PAGE_LIMIT,
    });
    return expectArray<unknown>(data, endpoint).map((row) => parseCandleRow(row, endpoint));
  }

  getCandles(q: CandleQuery): Promise<Candle[]> {
    return this.candleRows('/api/v3/market/candles', q);
  }

  getHistoryCandles(q: CandleQuery): Promise<Candle[]> {
    return this.candleRows('/api/v3/market/history-candles', q);
  }

  async getHistoryFundingRate(q: {
    category: FuturesCategory;
    symbol: string;
    cursor?: number;
    limit?: number;
  }): Promise<FundingRatePoint[]> {
    const endpoint = '/api/v3/market/history-fund-rate';
    const data = await this.get<unknown>(endpoint, {
      category: q.category,
      symbol: q.symbol,
      cursor: q.cursor,
      limit: q.limit,
    });
    if (typeof data !== 'object' || data === null || !Array.isArray((data as { resultList?: unknown }).resultList)) {
      throw new BitgetError({ code: 'BAD_RESPONSE', msg: 'expected data.resultList array', endpoint });
    }
    return (data as { resultList: FundingRatePoint[] }).resultList;
  }

  async getCurrentFundingRate(symbol: string): Promise<CurrentFundingRate[]> {
    const endpoint = '/api/v3/market/current-fund-rate';
    return expectArray<CurrentFundingRate>(await this.get<unknown>(endpoint, { symbol }), endpoint);
  }

  async getInstruments(category: Category, symbol?: string): Promise<Instrument[]> {
    const endpoint = '/api/v3/market/instruments';
    return expectArray<Instrument>(await this.get<unknown>(endpoint, { category, symbol }), endpoint);
  }

  async getTickers(category: Category, symbol?: string): Promise<Ticker[]> {
    const endpoint = '/api/v3/market/tickers';
    return expectArray<Ticker>(await this.get<unknown>(endpoint, { category, symbol }), endpoint);
  }
}

export interface CandleRangeQuery extends Omit<CandleQuery, 'startTime' | 'endTime' | 'limit'> {
  startTime: number;
  endTime: number;
  pageSize?: number;
  source?: 'candles' | 'history-candles';
  maxPages?: number;
}

export async function fetchCandlesRange(client: PublicClient, q: CandleRangeQuery): Promise<Candle[]> {
  if (q.endTime < q.startTime) {
    throw new RangeError('endTime must not be before startTime');
  }
  const pageSize = q.pageSize ?? CANDLE_PAGE_LIMIT;
  if (pageSize < 1 || pageSize > CANDLE_PAGE_LIMIT_HARD_MAX) {
    throw new RangeError(`pageSize must be 1..${CANDLE_PAGE_LIMIT_HARD_MAX}`);
  }
  const maxPages = q.maxPages ?? 500;
  const fetchPage = (cursorEnd: number) => {
    const query: CandleQuery = {
      category: q.category,
      symbol: q.symbol,
      interval: q.interval,
      type: q.type,
      startTime: q.startTime,
      endTime: cursorEnd,
      limit: pageSize,
    };
    return q.source === 'history-candles' ? client.getHistoryCandles(query) : client.getCandles(query);
  };

  const byTs = new Map<number, Candle>();
  let cursorEnd = q.endTime;
  for (let page = 0; page < maxPages; page += 1) {
    const rows = await fetchPage(cursorEnd);
    if (rows.length === 0) break;
    let oldest = Number.POSITIVE_INFINITY;
    for (const row of rows) {
      oldest = Math.min(oldest, row.ts);
      if (row.ts >= q.startTime && row.ts <= q.endTime) byTs.set(row.ts, row);
    }
    if (oldest <= q.startTime || rows.length < pageSize) break;
    cursorEnd = oldest - 1;
  }
  return [...byTs.values()].sort((a, b) => a.ts - b.ts);
}

export async function fetchFundingRateHistory(
  client: PublicClient,
  q: { category: FuturesCategory; symbol: string; sinceTs: number; maxPages?: number },
): Promise<FundingRatePoint[]> {
  const limit = 100;
  const maxPages = q.maxPages ?? 100;
  const out: FundingRatePoint[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const rows = await client.getHistoryFundingRate({ category: q.category, symbol: q.symbol, cursor: page, limit });
    for (const row of rows) {
      if (Number(row.fundingRateTimestamp) >= q.sinceTs) out.push(row);
    }
    const oldest = rows.reduce((min, row) => Math.min(min, Number(row.fundingRateTimestamp)), Number.POSITIVE_INFINITY);
    if (rows.length < limit || oldest < q.sinceTs) break;
  }
  return out.sort((a, b) => Number(a.fundingRateTimestamp) - Number(b.fundingRateTimestamp));
}
