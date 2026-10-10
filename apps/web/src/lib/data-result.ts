export type DataResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'absent' }
  | { status: 'error'; message: string };

export async function loadPublicJson<T>(path: string, parse: (raw: unknown) => T, init?: RequestInit): Promise<DataResult<T>> {
  try {
    const res = await fetch(path, init);
    if (res.status === 404) return { status: 'absent' };
    if (!res.ok) return { status: 'error', message: `HTTP ${res.status} for ${path}` };
    return { status: 'ok', data: parse(await res.json()) };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : `Could not read ${path}` };
  }
}
