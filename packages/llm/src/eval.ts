import type { Rule } from '@holdout/engine';
import type { CompileResult } from './compiler.ts';

export type CompilerLabel = { refuse: true } | { refuse: false; rule: Rule };

export interface EvalCase {
  id: string;
  text: string;
  author?: string;
  output: Pick<CompileResult, 'refuse'> & { rule?: Rule };
}

export interface EvalCaseResult {
  id: string;
  text: string;
  author?: string;
  expected: 'refuse' | Rule;
  actual: 'refuse' | Rule | 'error';
  correct: boolean;
}

export interface EvalSummary {
  total: number;
  correct: number;
  accuracy: number;
  refusalsExpected: number;
  refusalsCorrect: number;
  rulesExpected: number;
  rulesCorrect: number;
  results: EvalCaseResult[];
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(canonical);
    return items.every((i) => typeof i === 'string') ? [...items].sort() : items;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]): [string, unknown] => [k, canonical(v)])
      .filter(([k, v]) => !(k === 'scope' && (v === null || Object.keys(v as object).length === 0)))
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries);
  }
  return value;
}

/** Deep equality on type and parameters. Scope-less equals empty scope, and string-set arrays ignore order. */
export function rulesEqual(a: Rule, b: Rule): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

export function runCompilerEval(cases: EvalCase[], labels: Readonly<Record<string, CompilerLabel>>): EvalSummary {
  const results: EvalCaseResult[] = cases.map((c) => {
    const label = labels[c.id];
    if (!label) throw new Error(`no hand label for case ${c.id}`);
    const expected = label.refuse ? 'refuse' : label.rule;
    const actual = c.output.refuse ? 'refuse' : (c.output.rule ?? 'error');
    const correct =
      expected === 'refuse'
        ? actual === 'refuse'
        : actual !== 'refuse' && actual !== 'error' && rulesEqual(expected, actual);
    return { id: c.id, text: c.text, author: c.author, expected, actual, correct };
  });
  const refusals = results.filter((r) => r.expected === 'refuse');
  const rules = results.filter((r) => r.expected !== 'refuse');
  const correct = results.filter((r) => r.correct).length;
  return {
    total: results.length,
    correct,
    accuracy: results.length === 0 ? 0 : correct / results.length,
    refusalsExpected: refusals.length,
    refusalsCorrect: refusals.filter((r) => r.correct).length,
    rulesExpected: rules.length,
    rulesCorrect: rules.filter((r) => r.correct).length,
    results,
  };
}
