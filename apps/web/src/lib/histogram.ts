export interface HistogramBin {
  lo: number;
  hi: number;
  count: number;
}

export interface Histogram {
  bins: HistogramBin[];
  min: number;
  max: number;
  total: number;
}

export function binDraws(draws: readonly number[], binCount: number, include: readonly number[] = []): Histogram | null {
  if (!Number.isInteger(binCount) || binCount < 1) throw new RangeError('binCount must be a positive integer');
  const finite = draws.filter(Number.isFinite);
  if (finite.length === 0) return null;
  const extent = [...finite, ...include.filter(Number.isFinite)];
  let min = Math.min(...extent);
  let max = Math.max(...extent);
  if (min === max) {
    min -= 0.5;
    max += 0.5;
  }
  const width = (max - min) / binCount;
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({ lo: min + i * width, hi: min + (i + 1) * width, count: 0 }));
  for (const v of finite) {
    const index = Math.min(binCount - 1, Math.floor((v - min) / width));
    (bins[index] as HistogramBin).count += 1;
  }
  return { bins, min, max, total: finite.length };
}

export function positionOf(value: number, histogram: Histogram): number {
  return (value - histogram.min) / (histogram.max - histogram.min);
}
