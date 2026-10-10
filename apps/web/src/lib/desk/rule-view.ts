import { RuleSchema, num, renderRule, type Rule, type RuleAudit } from '@holdout/engine';
import { z } from 'zod';

export interface Effect {
  value: number;
  lo: number;
  hi: number;
}

export function costOfBreaking(audit: RuleAudit): Effect | null {
  if (!audit.interval) return null;
  return { value: -num(audit.costDelta), lo: -audit.interval.hi, hi: -audit.interval.lo };
}

const CompileResponseSchema = z.union([
  z.object({ refuse: z.literal(false), rule: RuleSchema, rendered: z.string().optional() }),
  z.object({ refuse: z.literal(true), reason: z.string() }),
]);

export type CompileOutcome = { kind: 'rule'; rule: Rule; canonical: string; rendered: string | null } | { kind: 'refused'; reason: string } | { kind: 'error'; message: string };

export function parseCompileResponse(raw: unknown): CompileOutcome {
  const parsed = CompileResponseSchema.safeParse(raw);
  if (!parsed.success) return { kind: 'error', message: 'The compiler answered with a shape Holdout does not recognize.' };
  if (parsed.data.refuse) return { kind: 'refused', reason: parsed.data.reason };
  return { kind: 'rule', rule: parsed.data.rule, canonical: renderRule(parsed.data.rule), rendered: parsed.data.rendered ?? null };
}

export const RULE_EXAMPLES = [
  'Wait 30 minutes after a losing trade before opening another',
  'Never use more than 5x leverage',
  'Never add to a position that is losing',
  'Stop opening trades for the day after losing 50 USDT',
] as const;

export const STATUS_LABEL: Record<RuleAudit['status'], string> = {
  priced: 'Priced',
  not_enough_breaks: 'Not enough breaks to price',
  no_breaks: 'Never broken',
  untestable: 'Untestable',
};
