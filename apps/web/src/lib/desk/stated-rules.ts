import { ruleId, type Rule } from '@holdout/engine';
import type { DeskRule, UnmappedStatedRule } from './types';

type SessionWord = 'overnight' | 'weekend' | 'holiday' | 'pre_market' | 'after_hours';

function toMinutes(amount: number, unit: string): number {
  return /^h/i.test(unit) ? amount * 60 : amount;
}

export function mapStatedRule(text: string): Rule | null {
  const t = text.toLowerCase();

  const cooldown = /cool\s?down\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|h)\b/.exec(t);
  if (cooldown?.[1] && cooldown[2]) return { t: 'cooldown_after_loss', minutes: toMinutes(Number(cooldown[1]), cooldown[2]) };

  if (/\b(never|don'?t|do not|no)\b.*\badd(?:ing)?\s+to\s+(?:a\s+)?(?:loser|losers|losing)/.test(t)) return { t: 'no_add_to_loser' };

  const leverage = /\bmax(?:imum)?\s+(?:leverage\s+(?:of\s+)?)?(\d+(?:\.\d+)?)\s*x\b/.exec(t) ?? /\bmax(?:imum)?\s+leverage\s+(?:of\s+)?(\d+(?:\.\d+)?)/.exec(t);
  if (leverage?.[1]) return { t: 'max_leverage', x: Number(leverage[1]) };

  const stop = /\bhard\s+stop\s+(?:at\s+|of\s+)?(\d+(?:\.\d+)?)\s*%/.exec(t);
  if (stop?.[1]) return { t: 'hard_stop', pct: Number(stop[1]) };

  const daily = /\bdaily\s+loss\s+(?:limit\s+)?(?:of\s+)?\$?(\d+(?:\.\d+)?)/.exec(t);
  if (daily?.[1]) return { t: 'daily_loss_limit', usdt: Number(daily[1]) };

  if (/\bstock/.test(t) && /\b(overnight|weekend|holiday|pre-?market|after[- ]hours)\b/.test(t) && /\b(no|never|avoid|don'?t|do not)\b/.test(t)) {
    const block: SessionWord[] = [];
    if (/overnight/.test(t)) block.push('overnight');
    if (/weekend/.test(t)) block.push('weekend');
    if (/holiday/.test(t)) block.push('holiday');
    if (/pre-?market/.test(t)) block.push('pre_market');
    if (/after[- ]hours/.test(t)) block.push('after_hours');
    if (block.length > 0) return { t: 'session_filter', block, products: /rtoken/.test(t) ? ['stock_perp', 'rtoken'] : ['stock_perp'] };
  }
  return null;
}

export function toDeskRule(rule: Rule, origin: DeskRule['origin'], sourceText?: string): DeskRule {
  return { id: ruleId(rule), rule, origin, sourceText };
}

export function mapStatedRules(texts: string[]): { mapped: DeskRule[]; unmapped: UnmappedStatedRule[] } {
  const mapped: DeskRule[] = [];
  const unmapped: UnmappedStatedRule[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    const rule = mapStatedRule(text);
    if (!rule) {
      unmapped.push({ text, reason: 'No template matches this sentence. Add it with the intake box.' });
      continue;
    }
    const desk = toDeskRule(rule, 'sample', text);
    if (seen.has(desk.id)) continue;
    seen.add(desk.id);
    mapped.push(desk);
  }
  return { mapped, unmapped };
}
