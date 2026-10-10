import { serverEnv, type ServerEnv } from './env';

export const SUPABASE_SURFACE = 'Supabase (saved rulebooks)';

const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;

export function validDeviceId(value: string | null): value is string {
  return value !== null && DEVICE_ID.test(value);
}

export const isUuid = (v: string): boolean => UUID.test(v);
export const isSha256 = (v: string): boolean => HEX64.test(v);

export interface SupabaseRest {
  request(path: string, init: { method: 'GET' | 'POST' | 'DELETE'; deviceId: string; body?: unknown; prefer?: string }): Promise<Response>;
}

export function supabaseRest(env: ServerEnv = serverEnv()): SupabaseRest | null {
  const url = env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return {
    request(path, init) {
      const headers: Record<string, string> = {
        apikey: key,
        authorization: `Bearer ${key}`,
        'x-device-id': init.deviceId,
      };
      if (init.body !== undefined) headers['content-type'] = 'application/json';
      if (init.prefer) headers.prefer = init.prefer;
      return fetch(`${url}/rest/v1/${path}`, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    },
  };
}
