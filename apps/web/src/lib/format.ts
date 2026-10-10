const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatUsdt(value: number): string {
  const body = usd.format(Math.abs(value));
  return `${value < 0 ? '-' : ''}${body}`;
}

export function formatSignedUsdt(value: number): string {
  if (value === 0) return '0.00';
  return `${value > 0 ? '+' : '-'}${usd.format(Math.abs(value))}`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatPercent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function pnlTone(value: number): 'gain' | 'loss' | 'neutral' {
  if (value > 0) return 'gain';
  if (value < 0) return 'loss';
  return 'neutral';
}

export function shortHash(hash: string, length = 10): string {
  return hash.length <= length ? hash : `${hash.slice(0, length)}`;
}
