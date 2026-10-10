import { num, type Product } from '@holdout/engine';
import { formatSignedUsdt, formatUsdt, pnlTone } from '@/lib/format';

export function money(value: string): string {
  return formatUsdt(num(value));
}

export function signedMoney(value: string): string {
  return formatSignedUsdt(num(value));
}

export function tone(value: string): 'gain' | 'loss' | 'neutral' {
  return pnlTone(num(value));
}

export function toneClass(value: string): string {
  const t = tone(value);
  return t === 'gain' ? 'text-gain' : t === 'loss' ? 'text-loss' : '';
}

export function formatTs(ts: number, dayLevel: boolean): string {
  const iso = new Date(ts).toISOString();
  return dayLevel ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export function formatHold(openTs: number, closeTs: number, dayLevel: boolean): string {
  const ms = Math.max(closeTs - openTs, 0);
  if (dayLevel) return `${Math.round(ms / 86_400_000)} d`;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 90) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

const PRODUCT_LABELS: Record<Product, string> = {
  perp: 'Perp',
  stock_perp: 'Stock perp',
  rtoken: 'rToken',
  stock_plus: 'Stock+',
  spot: 'Spot',
};

export function productLabel(product: Product): string {
  return PRODUCT_LABELS[product];
}

export function formatRate(fraction: number | null): string {
  return fraction === null ? 'n/a' : `${(fraction * 100).toFixed(0)}%`;
}
