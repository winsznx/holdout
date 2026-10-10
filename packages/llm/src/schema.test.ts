import { describe, expect, it } from 'vitest';
import { RULE_TYPES } from '@holdout/engine';
import { COMPILER_JSON_SCHEMA, parseCompilerOutput } from './schema.ts';
import type { JsonValue } from './provider.ts';

function assertStrict(node: JsonValue, path: string): void {
  if (Array.isArray(node)) {
    node.forEach((n, i) => assertStrict(n, `${path}[${i}]`));
    return;
  }
  if (node === null || typeof node !== 'object') return;
  if (node.type === 'object') {
    const props = node.properties as Record<string, JsonValue>;
    expect(node.additionalProperties, `${path} additionalProperties`).toBe(false);
    expect([...(node.required as string[])].sort(), `${path} required`).toEqual(Object.keys(props).sort());
  }
  for (const [k, v] of Object.entries(node)) assertStrict(v, `${path}.${k}`);
}

describe('compiler JSON schema', () => {
  it('satisfies strict-mode structure', () => {
    expect(COMPILER_JSON_SCHEMA.type).toBe('object');
    assertStrict(COMPILER_JSON_SCHEMA, '$');
  });

  it('has one variant per engine rule type', () => {
    const variants = JSON.stringify(COMPILER_JSON_SCHEMA);
    for (const t of RULE_TYPES) expect(variants).toContain(`"enum":["${t}"]`);
    expect(variants.match(/"t":\{/g)).toHaveLength(RULE_TYPES.length);
  });
});

describe('parseCompilerOutput', () => {
  it('strips nulls and empty scope, then validates', () => {
    const out = parseCompilerOutput({
      refuse: false,
      reason: null,
      rule: { t: 'max_leverage', x: 5, scope: { symbols: null, products: null, sides: null } },
    });
    expect(out).toEqual({ ok: true, value: { refuse: false, rule: { t: 'max_leverage', x: 5 } } });
  });

  it('keeps a real scope', () => {
    const out = parseCompilerOutput({
      refuse: false,
      reason: null,
      rule: { t: 'cooldown_after_loss', minutes: 120, scope: { symbols: ['NVDA'], products: null, sides: ['long'] } },
    });
    expect(out).toEqual({
      ok: true,
      value: { refuse: false, rule: { t: 'cooldown_after_loss', minutes: 120, scope: { symbols: ['NVDA'], sides: ['long'] } } },
    });
  });

  it('passes a refusal through', () => {
    const out = parseCompilerOutput({ refuse: true, reason: 'Not testable.', rule: null });
    expect(out).toEqual({ ok: true, value: { refuse: true, reason: 'Not testable.' } });
  });

  it('rejects values the engine schema rejects', () => {
    const out = parseCompilerOutput({ refuse: false, reason: null, rule: { t: 'hard_stop', pct: 250, scope: null } });
    expect(out.ok).toBe(false);
  });
});
