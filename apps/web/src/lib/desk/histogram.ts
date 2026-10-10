export interface HistogramBin {
  from: number;
  to: number;
  count: number;
}

export interface Histogram {
  bins: HistogramBin[];
  min: number;
  max: number;
  maxCount: number;
}

export function histogram(values: number[], extra: number[] = [], binCount = 24): Histogram | null {
  if (values.length === 0) return null;
  const all = [...values, ...extra];
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) {
    min -= 0.5;
    max += 0.5;
  }
  const width = (max - min) / binCount;
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({ from: min + i * width, to: min + (i + 1) * width, count: 0 }));
  for (const v of values) {
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor((v - min) / width)));
    const bin = bins[idx];
    if (bin) bin.count += 1;
  }
  return { bins, min, max, maxCount: Math.max(...bins.map((b) => b.count), 1) };
}

export function xPosition(value: number, h: Histogram): number {
  return ((value - h.min) / (h.max - h.min)) * 100;
}
