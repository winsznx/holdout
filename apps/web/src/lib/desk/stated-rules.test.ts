import { describe, expect, it } from 'vitest';
import { mapStatedRule, mapStatedRules } from './stated-rules';

describe('mapStatedRule', () => {
  it('maps the four stated rules the bot histories carry', () => {
    expect(mapStatedRule('cooldown 5 minutes after a loss')).toEqual({ t: 'cooldown_after_loss', minutes: 5 });
    expect(mapStatedRule('never add to a loser')).toEqual({ t: 'no_add_to_loser' });
    expect(mapStatedRule('max 10x leverage')).toEqual({ t: 'max_leverage', x: 10 });
    expect(mapStatedRule('no new stock-perp risk overnight or weekend')).toEqual({
      t: 'session_filter',
      block: ['overnight', 'weekend'],
      products: ['stock_perp'],
    });
  });

  it('converts hours to minutes', () => {
    expect(mapStatedRule('cooldown 2 hours after a loss')).toEqual({ t: 'cooldown_after_loss', minutes: 120 });
  });

  it('maps hard stops and daily loss limits', () => {
    expect(mapStatedRule('hard stop at 3%')).toEqual({ t: 'hard_stop', pct: 3 });
    expect(mapStatedRule('daily loss limit of 50 USDT')).toEqual({ t: 'daily_loss_limit', usdt: 50 });
  });

  it('returns null for sentences with no template', () => {
    expect(mapStatedRule('only trade when confident')).toBeNull();
  });
});

describe('mapStatedRules', () => {
  it('separates mapped and unmapped and drops duplicates', () => {
    const out = mapStatedRules(['max 10x leverage', 'max 10x leverage', 'be patient']);
    expect(out.mapped).toHaveLength(1);
    expect(out.unmapped).toEqual([{ text: 'be patient', reason: expect.any(String) }]);
    expect(out.mapped[0]?.origin).toBe('sample');
  });
});
