import { describe, expect, it } from 'vitest';
import { formatSignedUsdt, formatUsdt, pnlTone, shortHash } from './format';

describe('format', () => {
  it('formats USDT with grouping and a hyphen minus', () => {
    expect(formatUsdt(1234.5)).toBe('1,234.50');
    expect(formatUsdt(-1234.5)).toBe('-1,234.50');
  });

  it('always signs non-zero values', () => {
    expect(formatSignedUsdt(3)).toBe('+3.00');
    expect(formatSignedUsdt(-3)).toBe('-3.00');
    expect(formatSignedUsdt(0)).toBe('0.00');
  });

  it('maps sign to tone', () => {
    expect(pnlTone(1)).toBe('gain');
    expect(pnlTone(-1)).toBe('loss');
    expect(pnlTone(0)).toBe('neutral');
  });

  it('truncates hashes', () => {
    expect(shortHash('abcdef0123456789', 6)).toBe('abcdef');
    expect(shortHash('abc', 6)).toBe('abc');
  });
});
