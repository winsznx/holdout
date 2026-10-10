export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type QueryParams = Record<string, string | number | undefined>;

export interface SignInput {
  method: HttpMethod;
  path: string;
  query?: string;
  body?: string;
  secret: string;
  timestamp: string;
}

export interface Credentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

export interface SignedHeaders {
  'ACCESS-KEY': string;
  'ACCESS-SIGN': string;
  'ACCESS-TIMESTAMP': string;
  'ACCESS-PASSPHRASE': string;
  'Content-Type': 'application/json';
  locale: 'en-US';
  paptrading?: '1';
}

export interface BuildHeadersInput {
  credentials: Credentials;
  method: HttpMethod;
  path: string;
  query?: string;
  body?: string;
  timestamp?: string;
  paper?: boolean;
}

const encoder = new TextEncoder();

export function buildQueryString(params: QueryParams): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.join('&');
}

export function prehash(input: Omit<SignInput, 'secret'>): string {
  const target = input.query ? `${input.path}?${input.query}` : input.path;
  return `${input.timestamp}${input.method}${target}${input.body ?? ''}`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function signRequest(input: SignInput): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(input.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(prehash(input)));
  return toBase64(new Uint8Array(signature));
}

export async function buildSignedHeaders(input: BuildHeadersInput): Promise<SignedHeaders> {
  const timestamp = input.timestamp ?? Date.now().toString();
  const sign = await signRequest({
    method: input.method,
    path: input.path,
    query: input.query,
    body: input.body,
    secret: input.credentials.secret,
    timestamp,
  });
  const headers: SignedHeaders = {
    'ACCESS-KEY': input.credentials.apiKey,
    'ACCESS-SIGN': sign,
    'ACCESS-TIMESTAMP': timestamp,
    'ACCESS-PASSPHRASE': input.credentials.passphrase,
    'Content-Type': 'application/json',
    locale: 'en-US',
  };
  if (input.paper) headers.paptrading = '1';
  return headers;
}
