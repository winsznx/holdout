import { z } from 'zod';
import { RuleSchema } from '@holdout/engine';

export const TextBody = z.object({ text: z.string().trim().min(1).max(1500) });

export const NARRATED_CARD_TYPES = ['audit_rule_card', 'proposal_card', 'check_trade_card', 'null_result_card'] as const;

export const NarrateBody = z.object({
  card: z.enum(NARRATED_CARD_TYPES),
  slots: z.record(z.string().max(60), z.string().max(240)).refine((s) => Object.keys(s).length <= 24, 'too many slots'),
});

export const CARD_KINDS = [
  'audit_rule_card',
  'proposal_card',
  'check_trade_card',
  'null_result_card',
  'explain_rule_card',
  'compare_sessions_card',
  'evidence_card',
] as const;

export const CardSchema = z.object({
  kind: z.enum(CARD_KINDS),
  title: z.string().max(200),
  slots: z.record(z.string().max(60), z.string().max(240)),
});

export const ChatContextRule = z.object({
  id: z.string().max(64),
  rendered: z.string().max(300),
  status: z.enum(['stated', 'adopted', 'rejected', 'proposed']),
  rule: RuleSchema,
});

export const ChatContext = z.object({
  audit: z.array(CardSchema).max(12).default([]),
  proposals: z.array(CardSchema).max(12).default([]),
  explain: z.record(z.string().max(64), z.array(CardSchema).max(4)).default({}),
  sessions: z.array(CardSchema).max(8).default([]),
  evidence: z.array(CardSchema).max(8).default([]),
  rules: z.array(ChatContextRule).max(20).default([]),
});

export const ChatBody = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }))
    .min(1)
    .max(12),
  context: ChatContext,
});

export type ChatContextValue = z.infer<typeof ChatContext>;
