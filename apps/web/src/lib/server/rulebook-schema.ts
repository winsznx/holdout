import { z } from 'zod';
import { LEVERAGE_BUCKETS, RuleSchema } from '@holdout/engine';

const Product = z.enum(['perp', 'stock_perp', 'rtoken', 'stock_plus', 'spot']);
const Session = z.enum(['pre_market', 'regular', 'after_hours', 'overnight', 'weekend', 'holiday', 'early_close']);

const Bucket = z.looseObject({
  symbol: z.string(),
  product: Product,
  side: z.enum(['long', 'short']),
  session: Session,
  leverage: z.enum(LEVERAGE_BUCKETS),
  holdsAcrossOpen: z.boolean(),
  n: z.number(),
  winRate: z.number(),
  medianNet: z.number(),
  totalNet: z.number(),
});

const RulebookRuleSchema = z.looseObject({
  id: z.string(),
  rule: RuleSchema,
  rendered: z.string(),
  status: z.enum(['stated', 'adopted', 'rejected', 'proposed']),
  evidence: z.looseObject({}).optional(),
});

export const RulebookSchema = z.looseObject({
  schema: z.literal('holdout.rulebook.v1'),
  version: z.number(),
  traderId: z.string(),
  label: z.string(),
  createdAt: z.string(),
  rules: z.array(RulebookRuleSchema).max(100),
  buckets: z.array(Bucket).max(2000),
  ledger: z.looseObject({ roundTrips: z.number(), reconciled: z.boolean(), incomplete: z.boolean() }),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export const AggregateSchema = z.object({
  rule: RuleSchema,
  breaks: z.number().int().nonnegative(),
  costDelta: z.number().nullable(),
  intervalLo: z.number().nullable(),
  intervalHi: z.number().nullable(),
  historyLabel: z.string().trim().min(1).max(80),
});

export const AggregatesBody = z.object({ aggregates: z.array(AggregateSchema).min(1).max(50) });
