import { BitgetError } from './errors.ts';
import { BITGET_BASE_URL, expectCursorPage, requestEnvelope, type CursorPage, type FetchLike } from './http.ts';
import {
  buildQueryString,
  buildSignedHeaders,
  type Credentials,
  type HttpMethod,
  type QueryParams,
  type SignedHeaders,
} from './sign.ts';

export const DAY_MS = 86_400_000;
export const FILLS_WINDOW_MS = 29 * DAY_MS;
export const FILLS_HORIZON_MS = 90 * DAY_MS;
export const TAX_WINDOW_MS = 7 * DAY_MS;
export const TAX_HORIZON_MS = 366 * DAY_MS;
export const PAGE_LIMIT = 100;

export type FuturesBizCategory = 'USDT-FUTURES' | 'COIN-FUTURES' | 'USDC-FUTURES';

export interface SignRequestContext {
  method: 'GET';
  path: string;
  query: string;
}

export type Authorizer = (request: SignRequestContext) => Promise<Record<string, string>>;

export function credentialsAuthorizer(credentials: Credentials, options: { paper?: boolean } = {}): Authorizer {
  return async (request) => {
    const headers: SignedHeaders = await buildSignedHeaders({
      credentials,
      method: request.method,
      path: request.path,
      query: request.query,
      paper: options.paper,
    });
    return { ...headers };
  };
}

export function credentialsFromEnv(
  env: Record<string, string | undefined>,
  prefix: string,
): Credentials {
  const apiKey = env[`${prefix}_KEY`];
  const secret = env[`${prefix}_SECRET`];
  const passphrase = env[`${prefix}_PASSPHRASE`];
  if (!apiKey || !secret || !passphrase) {
    throw new Error(`${prefix}_KEY, ${prefix}_SECRET and ${prefix}_PASSPHRASE are required`);
  }
  return { apiKey, secret, passphrase };
}

export interface RawFill {
  execId: string;
  orderId: string;
  clientOid: string;
  category: string;
  symbol: string;
  orderType: string;
  side: 'buy' | 'sell';
  tradeSide: string;
  posSide: 'long' | 'short';
  execPrice: string;
  execQty: string;
  execValue: string;
  tradeScope: 'taker' | 'maker';
  feeDetail: { feeCoin: string; fee: string }[];
  createdTime: string;
  updatedTime: string;
  execPnl: string;
  execLinkId?: string;
  isRPI?: string;
}

export interface RawHistoryPosition {
  positionId: string;
  category: string;
  symbol: string;
  marginCoin: string;
  holdMode: string;
  posSide: 'long' | 'short';
  marginMode: string;
  openPriceAvg: string;
  closePriceAvg: string;
  openTotalPos: string;
  closeTotalPos: string;
  cumRealisedPnl: string;
  netProfit: string;
  totalFunding: string;
  openFeeTotal: string;
  closeFeeTotal: string;
  createdTime: string;
  updatedTime: string;
  cashDividend?: string;
}

export interface RawFinancialRecord {
  category: string;
  id: string;
  symbol: string;
  coin: string;
  type: string;
  positionType: string;
  amount: string;
  fee: string;
  positionAmount: string;
  positionBalance: string;
  balance: string;
  ts: string;
}

export type RawTaxRecord = Record<string, string>;

export interface TimeRange {
  startTime: number;
  endTime: number;
}

export interface PrivateClientOptions {
  authorize: Authorizer;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export class PrivateClient {
  private readonly authorize: Authorizer;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: PrivateClientOptions) {
    this.authorize = options.authorize;
    this.baseUrl = options.baseUrl ?? BITGET_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  private async get(endpoint: string, query: QueryParams): Promise<unknown> {
    const headers = await this.authorize({ method: 'GET', path: endpoint, query: buildQueryString(query) });
    return requestEnvelope<unknown>({ fetchImpl: this.fetchImpl, baseUrl: this.baseUrl, endpoint, query, headers });
  }

  async getFillsPage(q: {
    category: string;
    startTime: number;
    endTime: number;
    cursor?: string;
    limit?: number;
  }): Promise<CursorPage<RawFill>> {
    const endpoint = '/api/v3/trade/fills';
    const data = await this.get(endpoint, { ...q, limit: q.limit ?? PAGE_LIMIT });
    return expectCursorPage<RawFill>(data, endpoint);
  }

  async getHistoryPositionPage(q: {
    category: FuturesBizCategory;
    symbol?: string;
    startTime: number;
    endTime: number;
    cursor?: string;
    limit?: number;
  }): Promise<CursorPage<RawHistoryPosition>> {
    const endpoint = '/api/v3/position/history-position';
    const data = await this.get(endpoint, { ...q, limit: q.limit ?? PAGE_LIMIT });
    return expectCursorPage<RawHistoryPosition>(data, endpoint);
  }

  async getFinancialRecordsPage(q: {
    category: string;
    type?: string;
    startTime: number;
    endTime: number;
    cursor?: string;
    limit?: number;
  }): Promise<CursorPage<RawFinancialRecord>> {
    const endpoint = '/api/v3/account/financial-records';
    const data = await this.get(endpoint, { ...q, limit: q.limit ?? PAGE_LIMIT });
    return expectCursorPage<RawFinancialRecord>(data, endpoint);
  }

  async getTaxRecordsPage(q: {
    bizType: string;
    startTime: number;
    endTime: number;
    cursor?: string;
    limit?: number;
  }): Promise<CursorPage<RawTaxRecord>> {
    const endpoint = '/api/v3/tax/records';
    const data = await this.get(endpoint, { ...q, limit: q.limit ?? 500 });
    return expectCursorPage<RawTaxRecord>(data, endpoint);
  }

  async getKeyAuthorities(): Promise<KeyPermissionReport> {
    const endpoint = '/api/v2/spot/account/info';
    const data = await this.get(endpoint, {});
    if (typeof data !== 'object' || data === null || !Array.isArray((data as { authorities?: unknown }).authorities)) {
      throw new BitgetError({ code: 'BAD_RESPONSE', msg: 'expected data.authorities array', endpoint });
    }
    const authorities = (data as { authorities: unknown[] }).authorities.filter(
      (entry): entry is string => typeof entry === 'string',
    );
    return classifyAuthorities(authorities);
  }
}

export type PermissionVerdict = 'read_only' | 'has_write' | 'unknown';

export interface KeyPermissionReport {
  authorities: string[];
  verdict: PermissionVerdict;
}

const WRITE_AUTHORITY = /(^|_)(trade|withdraw|transfer|write)|w$/i;
const READ_AUTHORITY = /^(readonly|read_only)$/i;

export function classifyAuthorities(authorities: string[]): KeyPermissionReport {
  if (authorities.some((entry) => WRITE_AUTHORITY.test(entry))) {
    return { authorities, verdict: 'has_write' };
  }
  if (authorities.length > 0 && authorities.every((entry) => READ_AUTHORITY.test(entry))) {
    return { authorities, verdict: 'read_only' };
  }
  return { authorities, verdict: 'unknown' };
}

export function splitWindows(range: TimeRange, windowMs: number): TimeRange[] {
  if (range.endTime < range.startTime) throw new RangeError('endTime must not be before startTime');
  const windows: TimeRange[] = [];
  let cursorEnd = range.endTime;
  while (cursorEnd > range.startTime) {
    const start = Math.max(range.startTime, cursorEnd - windowMs);
    windows.push({ startTime: start, endTime: cursorEnd });
    cursorEnd = start;
  }
  return windows.reverse();
}

export async function drainCursor<T>(
  fetchPage: (cursor: string | undefined) => Promise<CursorPage<T>>,
  options: { pageSize?: number; maxPages?: number } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? PAGE_LIMIT;
  const maxPages = options.maxPages ?? 200;
  const rows: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await fetchPage(cursor);
    rows.push(...result.list);
    const exhausted = result.list.length < pageSize || result.cursor === '' || seenCursors.has(result.cursor);
    if (exhausted) return rows;
    seenCursors.add(result.cursor);
    cursor = result.cursor;
  }
  throw new BitgetError({ code: 'PAGE_LIMIT', msg: `exceeded ${maxPages} pages`, endpoint: 'cursor-paging' });
}

function dedupe<T>(rows: T[], key: (row: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const row of rows) seen.set(key(row), row);
  return [...seen.values()];
}

export function clampToHorizon(range: TimeRange, horizonMs: number, now: number): TimeRange {
  return { startTime: Math.max(range.startTime, now - horizonMs), endTime: Math.min(range.endTime, now) };
}

export async function fetchFillsRange(
  client: PrivateClient,
  q: { category: string; range: TimeRange; now?: number },
): Promise<RawFill[]> {
  const range = clampToHorizon(q.range, FILLS_HORIZON_MS, q.now ?? Date.now());
  const collected: RawFill[] = [];
  for (const window of splitWindows(range, FILLS_WINDOW_MS)) {
    collected.push(
      ...(await drainCursor((cursor) => client.getFillsPage({ category: q.category, ...window, cursor }))),
    );
  }
  return dedupe(collected, (fill) => fill.execId).sort((a, b) => Number(a.createdTime) - Number(b.createdTime));
}

export async function fetchHistoryPositionsRange(
  client: PrivateClient,
  q: { category: FuturesBizCategory; symbol?: string; range: TimeRange; now?: number },
): Promise<RawHistoryPosition[]> {
  const range = clampToHorizon(q.range, FILLS_HORIZON_MS, q.now ?? Date.now());
  const collected: RawHistoryPosition[] = [];
  for (const window of splitWindows(range, FILLS_WINDOW_MS)) {
    collected.push(
      ...(await drainCursor((cursor) =>
        client.getHistoryPositionPage({ category: q.category, symbol: q.symbol, ...window, cursor }),
      )),
    );
  }
  return dedupe(collected, (position) => position.positionId).sort(
    (a, b) => Number(a.createdTime) - Number(b.createdTime),
  );
}

export async function fetchFinancialRecordsRange(
  client: PrivateClient,
  q: { category: string; type?: string; range: TimeRange; now?: number },
): Promise<RawFinancialRecord[]> {
  const range = clampToHorizon(q.range, FILLS_HORIZON_MS, q.now ?? Date.now());
  const collected: RawFinancialRecord[] = [];
  for (const window of splitWindows(range, FILLS_WINDOW_MS)) {
    collected.push(
      ...(await drainCursor((cursor) =>
        client.getFinancialRecordsPage({ category: q.category, type: q.type, ...window, cursor }),
      )),
    );
  }
  return dedupe(collected, (record) => record.id).sort((a, b) => Number(a.ts) - Number(b.ts));
}

export async function fetchTaxRecordsRange(
  client: PrivateClient,
  q: { bizType: string; range: TimeRange; now?: number },
): Promise<RawTaxRecord[]> {
  const range = clampToHorizon(q.range, TAX_HORIZON_MS, q.now ?? Date.now());
  const collected: RawTaxRecord[] = [];
  for (const window of splitWindows(range, TAX_WINDOW_MS)) {
    collected.push(
      ...(await drainCursor((cursor) => client.getTaxRecordsPage({ bizType: q.bizType, ...window, cursor }), {
        pageSize: 500,
      })),
    );
  }
  return collected;
}

export interface SignedGetRequest {
  method: HttpMethod;
  path: string;
  query: string;
  headers: Record<string, string>;
}

const ALLOWED_FORWARD_HEADERS = new Set([
  'access-key',
  'access-sign',
  'access-timestamp',
  'access-passphrase',
  'paptrading',
  'locale',
  'content-type',
]);

export async function forwardSignedGet(
  request: SignedGetRequest,
  options: { baseUrl?: string; fetchImpl?: FetchLike } = {},
): Promise<Response> {
  if (request.method !== 'GET') throw new RangeError('only GET requests can be forwarded');
  if (!request.path.startsWith('/api/v3/') && request.path !== '/api/v2/spot/account/info') {
    throw new RangeError(`path not allowed: ${request.path}`);
  }
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (ALLOWED_FORWARD_HEADERS.has(name.toLowerCase())) headers[name] = value;
  }
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const url = `${options.baseUrl ?? BITGET_BASE_URL}${request.path}${request.query ? `?${request.query}` : ''}`;
  return fetchImpl(url, { method: 'GET', headers });
}
