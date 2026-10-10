import { describe, expect, it } from 'vitest';
import { runCompilerEval } from './eval.ts';

describe('runCompilerEval', () => {
  it('scores rules by deep equality and refusals by refusal', () => {
    const summary = runCompilerEval(
      [
        { id: 'a', text: 'x', output: { refuse: false, rule: { t: 'max_leverage', x: 5 } } },
        { id: 'b', text: 'x', output: { refuse: false, rule: { t: 'max_leverage', x: 10 } } },
        { id: 'c', text: 'x', output: { refuse: true } },
        { id: 'd', text: 'x', output: { refuse: false, rule: { t: 'max_leverage', x: 5 } } },
        { id: 'e', text: 'x', output: { refuse: false, rule: { t: 'session_filter', block: ['weekend', 'overnight'], products: ['rtoken'], scope: {} } } },
      ],
      {
        a: { refuse: false, rule: { t: 'max_leverage', x: 5 } },
        b: { refuse: false, rule: { t: 'max_leverage', x: 5 } },
        c: { refuse: true },
        d: { refuse: true },
        e: { refuse: false, rule: { t: 'session_filter', block: ['overnight', 'weekend'], products: ['rtoken'] } },
      },
    );
    expect(summary.results.map((r) => r.correct)).toEqual([true, false, true, false, true]);
    expect(summary.correct).toBe(3);
    expect(summary.refusalsExpected).toBe(2);
    expect(summary.refusalsCorrect).toBe(1);
  });

  it('throws when a label is missing', () => {
    expect(() => runCompilerEval([{ id: 'z', text: 'x', output: { refuse: true } }], {})).toThrow();
  });
});
