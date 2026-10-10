import { hexToBytes } from '@noble/hashes/utils.js';

export type Rng = () => number;

export function rngFromHex(hex: string): Rng {
  const bytes = hexToBytes(hex.slice(0, 16));
  const view = new DataView(bytes.buffer, bytes.byteOffset, 8);
  let a = view.getUint32(0, false);
  let b = view.getUint32(4, false);
  let c = 0x9e3779b9;
  let d = 1;
  return () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = ((c << 21) | (c >>> 11)) + t | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function rngFromSeed(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (b - a) * (pos - lo);
}

export function median(values: number[]): number {
  return quantile([...values].sort((x, y) => x - y), 0.5);
}

export function totalOf(values: number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

export interface Interval {
  lo: number;
  hi: number;
  resamples: number;
  seed: string;
}

export function bootstrapSum(values: number[], rng: Rng, resamples: number, level = 0.9, seedLabel = ''): Interval {
  const n = values.length;
  const sums: number[] = new Array<number>(resamples);
  for (let r = 0; r < resamples; r++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += values[Math.floor(rng() * n)] as number;
    sums[r] = s;
  }
  sums.sort((x, y) => x - y);
  const tail = (1 - level) / 2;
  return { lo: quantile(sums, tail), hi: quantile(sums, 1 - tail), resamples, seed: seedLabel };
}

export function sampleWithoutReplacement(n: number, k: number, rng: Rng): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (n - i));
    const tmp = idx[i] as number;
    idx[i] = idx[j] as number;
    idx[j] = tmp;
  }
  return idx.slice(0, k);
}

export function monteCarloP(observed: number, draws: number[]): number {
  const ge = draws.filter((d) => d >= observed).length;
  return (1 + ge) / (draws.length + 1);
}
