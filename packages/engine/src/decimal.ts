import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN, toExpNeg: -40, toExpPos: 40 });

export { Decimal };
export const D = (v: Decimal.Value): Decimal => new Decimal(v);
export const ZERO = new Decimal(0);
export const str = (d: Decimal): string => d.toFixed();
export const sum = (values: Decimal.Value[]): Decimal => values.reduce<Decimal>((a, v) => a.plus(v), ZERO);
export const num = (v: Decimal.Value): number => new Decimal(v).toNumber();
