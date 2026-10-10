import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function fixture<T>(name: string): T {
  const path = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export interface Envelope<T> {
  code: string;
  msg: string;
  data: T;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
