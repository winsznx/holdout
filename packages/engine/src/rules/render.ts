import type { Rule } from './schema.ts';

function scopeText(rule: Rule): string {
  const s = rule.scope;
  if (!s) return '';
  const parts: string[] = [];
  if (s.symbols?.length) parts.push(`on ${s.symbols.join(', ')}`);
  if (s.products?.length) parts.push(`for ${s.products.join(', ')}`);
  if (s.sides?.length) parts.push(`${s.sides.join(' and ')} trades only`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

export function renderRule(rule: Rule): string {
  const base = (() => {
    switch (rule.t) {
      case 'cooldown_after_loss':
        return `After a losing trade, wait ${rule.minutes} minutes before opening another`;
      case 'max_leverage':
        return `Never use more than ${rule.x}x leverage`;
      case 'no_add_to_loser':
        return 'Never add to a position that is losing';
      case 'hard_stop':
        return `Exit when the price moves ${rule.pct}% against the entry`;
      case 'daily_loss_limit':
        return `Stop opening trades for the day after losing ${rule.usdt} USDT`;
      case 'session_filter':
        return `Do not open ${rule.products.join(' or ')} positions during: ${rule.block.join(', ')}`;
      case 'earnings_blackout':
        return `Do not open positions within ${rule.hoursBefore} hours before the underlying's earnings`;
      case 'product_switch_weekend':
        return 'Hold weekend and overnight stock exposure as the rToken spot instead of the stock perp';
    }
  })();
  return `${base}${scopeText(rule)}.`;
}
