import { BitgetError } from './errors.ts';
import { buildQueryString, type QueryParams } from './sign.ts';

export const BITGET_BASE_URL = 'https://api.bitget.com';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface BitgetEnvelope<T> {
  code: string;
  msg: string;
  requestTime?: number;
  data: T;
}

export interface CursorPage<T> {
  list: T[];
  cursor: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function requestEnvelope<T>(params: {
  fetchImpl: FetchLike;
  baseUrl: string;
  endpoint: string;
  query: QueryParams;
  headers: Record<string, string>;
}): Promise<T> {
  const queryString = buildQueryString(params.query);
  const url = `${params.baseUrl}${params.endpoint}${queryString ? `?${queryString}` : ''}`;
  let response: Response;
  try {
    response = await params.fetchImpl(url, { method: 'GET', headers: params.headers });
  } catch (cause) {
    throw new BitgetError({
      code: 'NETWORK',
      msg: cause instanceof Error ? cause.message : 'network failure',
      endpoint: params.endpoint,
      cause,
    });
  }
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new BitgetError({
      code: 'BAD_RESPONSE',
      msg: `non-JSON body (HTTP ${response.status})`,
      endpoint: params.endpoint,
      httpStatus: response.status,
      cause,
    });
  }
  if (!isRecord(parsed) || typeof parsed.code !== 'string') {
    throw new BitgetError({
      code: 'BAD_RESPONSE',
      msg: `missing code field (HTTP ${response.status})`,
      endpoint: params.endpoint,
      httpStatus: response.status,
    });
  }
  if (parsed.code !== '00000') {
    throw new BitgetError({
      code: parsed.code,
      msg: typeof parsed.msg === 'string' ? parsed.msg : '',
      endpoint: params.endpoint,
      httpStatus: response.status,
    });
  }
  return parsed.data as T;
}

export function expectCursorPage<T>(data: unknown, endpoint: string): CursorPage<T> {
  if (!isRecord(data)) {
    throw new BitgetError({ code: 'BAD_RESPONSE', msg: 'expected data object', endpoint });
  }
  if (data.list !== null && !Array.isArray(data.list)) {
    throw new BitgetError({ code: 'BAD_RESPONSE', msg: 'expected data.list array or null', endpoint });
  }
  const cursor = typeof data.cursor === 'string' ? data.cursor : '';
  return { list: (data.list ?? []) as T[], cursor };
}

export function expectArray<T>(data: unknown, endpoint: string): T[] {
  if (!Array.isArray(data)) {
    throw new BitgetError({ code: 'BAD_RESPONSE', msg: 'expected data array', endpoint });
  }
  return data as T[];
}
