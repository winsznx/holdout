import { describe, expect, it } from 'vitest';
import { binDraws, positionOf } from './histogram';

describe('binDraws', () => {
  it('counts every draw exactly once and puts the maximum in the last bin', () => {
    const h = binDraws([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(h).not.toBeNull();
    expect(h?.bins.map((b) => b.count)).toEqual([2, 2, 2, 2, 3]);
    expect(h?.total).toBe(11);
  });

  it('widens the range to include the observed value', () => {
    const h = binDraws([1, 2, 3], 4, [10]);
    expect(h?.max).toBe(10);
    expect(h?.bins.reduce((s, b) => s + b.count, 0)).toBe(3);
  });

  it('handles identical draws without dividing by zero', () => {
    const h = binDraws([2, 2, 2], 4);
    expect(h?.bins.reduce((s, b) => s + b.count, 0)).toBe(3);
    expect(h && h.max > h.min).toBe(true);
  });

  it('returns null when there are no draws and rejects a bad bin count', () => {
    expect(binDraws([], 5)).toBeNull();
    expect(() => binDraws([1], 0)).toThrow(RangeError);
  });

  it('locates a value as a fraction of the range', () => {
    const h = binDraws([0, 10], 2);
    expect(h && positionOf(5, h)).toBe(0.5);
  });
});
