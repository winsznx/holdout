import { CompilerOutputSchema, type Rule } from '@holdout/engine';
import type { JsonSchema } from './provider.ts';

const PRODUCTS = ['perp', 'stock_perp', 'rtoken', 'stock_plus', 'spot'];
const SESSION_BLOCKS = ['overnight', 'weekend', 'holiday', 'friday_close', 'pre_market', 'after_hours'];

const nullable = (schema: JsonSchema): JsonSchema => ({ anyOf: [schema, { type: 'null' }] });
const strings = (values?: string[]): JsonSchema => ({
  type: 'array',
  items: values ? { type: 'string', enum: values } : { type: 'string' },
});

function obj(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

const scopeSchema = nullable(
  obj({
    symbols: nullable(strings()),
    products: nullable(strings(PRODUCTS)),
    sides: nullable(strings(['long', 'short'])),
  }),
);

function ruleVariant(t: string, params: Record<string, JsonSchema>): JsonSchema {
  return obj({ t: { type: 'string', enum: [t] }, ...params, scope: scopeSchema });
}

const ruleSchema: JsonSchema = {
  anyOf: [
    ruleVariant('cooldown_after_loss', { minutes: { type: 'number' } }),
    ruleVariant('max_leverage', { x: { type: 'number' } }),
    ruleVariant('no_add_to_loser', {}),
    ruleVariant('hard_stop', { pct: { type: 'number' } }),
    ruleVariant('daily_loss_limit', { usdt: { type: 'number' } }),
    ruleVariant('session_filter', {
      block: strings(SESSION_BLOCKS),
      products: strings(['stock_perp', 'rtoken']),
    }),
    ruleVariant('earnings_blackout', { hoursBefore: { type: 'number' } }),
    ruleVariant('product_switch_weekend', {
      from: { type: 'string', enum: ['stock_perp'] },
      to: { type: 'string', enum: ['rtoken'] },
    }),
  ],
};

export const COMPILER_JSON_SCHEMA: JsonSchema = obj({
  refuse: { type: 'boolean' },
  reason: nullable({ type: 'string' }),
  rule: nullable(ruleSchema),
});

function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null) continue;
      out[k] = stripNulls(v);
    }
    return out;
  }
  return value;
}

function dropEmptyScope(rule: unknown): unknown {
  if (rule === null || typeof rule !== 'object') return rule;
  const copy: Record<string, unknown> = { ...rule };
  const scope = copy.scope;
  if (scope !== null && typeof scope === 'object' && Object.keys(scope).length === 0) delete copy.scope;
  return copy;
}

export type ParsedCompilerOutput =
  | { ok: true; value: { refuse: false; rule: Rule } | { refuse: true; reason: string } }
  | { ok: false; error: string };

export function parseCompilerOutput(raw: unknown): ParsedCompilerOutput {
  if (raw === null || typeof raw !== 'object') return { ok: false, error: 'output is not an object' };
  const stripped = stripNulls(raw);
  const shaped = stripped as { refuse?: unknown; reason?: unknown; rule?: unknown };
  const candidate =
    shaped.refuse === true
      ? { refuse: true, reason: shaped.reason }
      : { refuse: false, rule: dropEmptyScope(shaped.rule) };
  const parsed = CompilerOutputSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  return { ok: true, value: parsed.data };
}
