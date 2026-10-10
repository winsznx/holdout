import { BitgetError } from '@holdout/bitget/src/errors.ts';
import {
  FILLS_HORIZON_MS,
  PrivateClient,
  credentialsAuthorizer,
  fetchFillsRange,
  fetchFinancialRecordsRange,
  fetchHistoryPositionsRange,
  type KeyPermissionReport,
} from '@holdout/bitget/src/private.ts';
import type { Surface } from '@/components/ui';
import { fetchStockSymbols } from './market';
import type { RawSyncPayload } from './sync-normalize';

export const SYNC_ROUTE = '/api/sync';
const FORWARDED_HEADERS = ['ACCESS-KEY', 'ACCESS-SIGN', 'ACCESS-TIMESTAMP', 'ACCESS-PASSPHRASE', 'paptrading'];

export class SyncError extends Error {
  constructor(
    message: string,
    readonly surface: Surface,
    readonly refusedKey = false,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

export interface SyncCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

export type SyncStep = 'permissions' | 'stock-list' | 'fills' | 'positions' | 'funding';

export function pickForwardHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of FORWARDED_HEADERS) {
    const value = headers[name];
    if (value !== undefined) out[name] = value;
  }
  return out;
}

export function buildSyncBody(bitgetUrl: string, headers: Record<string, string>) {
  const url = new URL(bitgetUrl);
  const forwarded = pickForwardHeaders(headers);
  return {
    method: 'GET' as const,
    path: url.pathname,
    query: url.search.replace(/^\?/, ''),
    timestamp: forwarded['ACCESS-TIMESTAMP'] ?? '',
    headers: forwarded,
  };
}

function headersRecord(init: RequestInit | undefined): Record<string, string> {
  const raw = init?.headers;
  if (!raw) return {};
  if (raw instanceof Headers) return Object.fromEntries(raw.entries());
  if (Array.isArray(raw)) return Object.fromEntries(raw);
  return { ...raw };
}

function surfaceFor(endpoint: string): Surface {
  if (endpoint.includes('position/history-position') || endpoint.includes('financial-records')) return 'Bitget positions history and financial records (S2)';
  return 'Bitget fills (S1)';
}

export function describeSyncFailure(e: unknown): SyncError {
  if (e instanceof SyncError) return e;
  if (e instanceof BitgetError) {
    const surface = surfaceFor(e.endpoint);
    if (e.code === 'BAD_RESPONSE' && e.httpStatus === 404) {
      return new SyncError(`The sync route ${SYNC_ROUTE} did not answer (HTTP 404). Nothing was sent to Bitget.`, surface);
    }
    if (e.code === 'NETWORK') return new SyncError(`The request to ${SYNC_ROUTE} failed: ${e.msg}.`, surface);
    return new SyncError(`${e.endpoint} returned ${e.code}${e.msg ? `: ${e.msg}` : ''}.`, surface);
  }
  return new SyncError(e instanceof Error ? e.message : 'Sync failed', 'Bitget fills (S1)');
}

export async function syncFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(SYNC_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildSyncBody(input, headersRecord(init))),
    cache: 'no-store',
  });
}

export function makeClient(credentials: SyncCredentials, paper: boolean): PrivateClient {
  return new PrivateClient({ authorize: credentialsAuthorizer(credentials, { paper }), fetchImpl: syncFetch });
}

export interface PermissionCheck {
  report: KeyPermissionReport | null;
  warning: string | null;
}

export async function checkKey(client: PrivateClient): Promise<PermissionCheck> {
  try {
    const report = await client.getKeyAuthorities();
    if (report.verdict === 'has_write') {
      throw new SyncError(
        `This key can do more than read: its permissions are ${report.authorities.join(', ')}. Holdout refuses it. Create a key with read-only permission and try again.`,
        'Bitget fills (S1)',
        true,
      );
    }
    return { report, warning: report.verdict === 'unknown' ? `Bitget listed permissions Holdout does not recognize: ${report.authorities.join(', ') || 'none'}. No write-looking permission was found.` : null };
  } catch (e) {
    if (e instanceof SyncError) throw e;
    if (e instanceof BitgetError && e.code === 'BAD_RESPONSE' && e.httpStatus !== 404) {
      return { report: null, warning: 'Bitget did not return the key permission list, so read-only could not be confirmed. Holdout only sends GET requests.' };
    }
    throw describeSyncFailure(e);
  }
}

export interface SyncRun {
  payload: RawSyncPayload;
  permission: PermissionCheck;
}

export async function runSync(credentials: SyncCredentials, options: { paper: boolean; onStep: (step: SyncStep) => void; now?: number }): Promise<SyncRun> {
  const client = makeClient(credentials, options.paper);
  const now = options.now ?? Date.now();
  const range = { startTime: now - FILLS_HORIZON_MS, endTime: now };
  try {
    options.onStep('permissions');
    const permission = await checkKey(client);
    options.onStep('stock-list');
    const stockSymbols = await fetchStockSymbols();
    options.onStep('fills');
    const fills = await fetchFillsRange(client, { category: 'USDT-FUTURES', range, now });
    options.onStep('positions');
    const positions = await fetchHistoryPositionsRange(client, { category: 'USDT-FUTURES', range, now });
    options.onStep('funding');
    const financial = await fetchFinancialRecordsRange(client, { category: 'USDT-FUTURES', range, now });
    return { payload: { fills, positions, financial, stockSymbols }, permission };
  } catch (e) {
    throw describeSyncFailure(e);
  }
}
