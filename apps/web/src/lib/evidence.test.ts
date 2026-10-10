import { describe, expect, it } from 'vitest';
import { humanizeKey, parseEvidenceSummary, scalarEntries, structuredEntries } from './evidence';

describe('evidence summary helpers', () => {
  it('humanizes snake and camel case keys', () => {
    expect(humanizeKey('median_delta_test')).toBe('median delta test');
    expect(humanizeKey('shamValue')).toBe('sham value');
  });

  it('splits scalars from structured values without inventing fields', () => {
    const summary = parseEvidenceSummary({ traders: 5, verdict: 'x', byTrader: [{ id: 'a' }], nothing: null });
    expect(scalarEntries(summary).map((e) => e.key)).toEqual(['traders', 'verdict']);
    expect(structuredEntries(summary).map((e) => e.key)).toEqual(['byTrader']);
  });

  it('rejects non-object payloads', () => {
    expect(() => parseEvidenceSummary([1, 2])).toThrow();
  });
});
