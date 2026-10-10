import { z } from 'zod';

const Scope = z
  .object({
    symbols: z.array(z.string()).optional(),
    products: z.array(z.enum(['perp', 'stock_perp', 'rtoken', 'stock_plus', 'spot'])).optional(),
    sides: z.array(z.enum(['long', 'short'])).optional(),
  })
  .optional();

const SessionBlock = z.enum(['overnight', 'weekend', 'holiday', 'friday_close', 'pre_market', 'after_hours']);

export const RuleSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('cooldown_after_loss'), minutes: z.number().positive(), scope: Scope }),
  z.object({ t: z.literal('max_leverage'), x: z.number().positive(), scope: Scope }),
  z.object({ t: z.literal('no_add_to_loser'), scope: Scope }),
  z.object({ t: z.literal('hard_stop'), pct: z.number().positive().max(100), scope: Scope }),
  z.object({ t: z.literal('daily_loss_limit'), usdt: z.number().positive(), scope: Scope }),
  z.object({
    t: z.literal('session_filter'),
    block: z.array(SessionBlock).min(1),
    products: z.array(z.enum(['stock_perp', 'rtoken'])).min(1),
    scope: Scope,
  }),
  z.object({ t: z.literal('earnings_blackout'), hoursBefore: z.number().positive(), scope: Scope }),
  z.object({ t: z.literal('product_switch_weekend'), from: z.literal('stock_perp'), to: z.literal('rtoken'), scope: Scope }),
]);

export type Rule = z.infer<typeof RuleSchema>;
export type RuleType = Rule['t'];
export type RuleScope = z.infer<typeof Scope>;

export const RULE_TYPES: RuleType[] = [
  'cooldown_after_loss',
  'max_leverage',
  'no_add_to_loser',
  'hard_stop',
  'daily_loss_limit',
  'session_filter',
  'earnings_blackout',
  'product_switch_weekend',
];

export const CompilerOutputSchema = z.union([
  z.object({ refuse: z.literal(false), rule: RuleSchema }),
  z.object({ refuse: z.literal(true), reason: z.string() }),
]);
