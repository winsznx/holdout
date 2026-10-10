import { describe, expect, it } from 'vitest';
import { histogram, xPosition } from './histogram';

describe('histogram', () => {
  it('returns null for no draws', () => {
    expect(histogram([])).toBeNull();
  });

  it('keeps every draw and puts the maximum in the last bin', () => {
    const h = histogram([0, 1, 2, 3, 4, 10], [], 5);
    expect(h?.bins.reduce((s, b) => s + b.count, 0)).toBe(6);
    expect(h?.bins[4]?.count).toBe(1);
  });

  it('widens the range to include the observed value', () => {
    const h = histogram([0, 1, 2], [50], 10);
    expect(h?.max).toBe(50);
    expect(xPosition(50, h!)).toBe(100);
  });

  it('handles identical values', () => {
    const h = histogram([3, 3, 3], [], 4);
    expect(h?.bins.reduce((s, b) => s + b.count, 0)).toBe(3);
  });
});
