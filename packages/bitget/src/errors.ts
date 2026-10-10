export type SurfaceId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8';

export class BitgetError extends Error {
  readonly code: string;
  readonly msg: string;
  readonly endpoint: string;
  readonly httpStatus?: number;

  constructor(params: { code: string; msg: string; endpoint: string; httpStatus?: number; cause?: unknown }) {
    super(`Bitget ${params.endpoint} failed: ${params.code} ${params.msg}`, { cause: params.cause });
    this.name = 'BitgetError';
    this.code = params.code;
    this.msg = params.msg;
    this.endpoint = params.endpoint;
    this.httpStatus = params.httpStatus;
  }
}

export class NormalizeError extends Error {
  readonly field: string;
  readonly value: string;

  constructor(field: string, value: string, detail: string) {
    super(`Cannot normalize ${field}=${JSON.stringify(value)}: ${detail}`);
    this.name = 'NormalizeError';
    this.field = field;
    this.value = value;
  }
}

export interface Unavailable {
  available: false;
  surface: SurfaceId;
  reason: string;
}

export interface Available<T> {
  available: true;
  surface: SurfaceId;
  data: T;
}

export type SurfaceResult<T> = Available<T> | Unavailable;

export function available<T>(surface: SurfaceId, data: T): Available<T> {
  return { available: true, surface, data };
}

export function unavailable(surface: SurfaceId, reason: string): Unavailable {
  return { available: false, surface, reason };
}
