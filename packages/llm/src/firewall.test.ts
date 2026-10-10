import { describe, expect, it } from 'vitest';
import { Firewall, narrate, validateNarration } from './firewall.ts';

const slots = { cost: '$1,240', breaks: '14', interval_lo: '-$80', interval_hi: '$310' };

describe('numbers firewall', () => {
  it('fills slot tokens', () => {
    expect(narrate('Cost {cost} over {breaks} breaks.', slots)).toBe('Cost $1,240 over 14 breaks.');
  });

  it('accepts text whose only digits come from slots', () => {
    const check = validateNarration('You broke it {breaks} times and lost {cost}.', slots);
    expect(check).toEqual({ ok: true, text: 'You broke it 14 times and lost $1,240.' });
  });

  it('rejects an injected digit', () => {
    const check = validateNarration('You broke it {breaks} times and lost about 900 dollars.', slots);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.violations).toContainEqual({ kind: 'digit', value: '900' });
  });

  it('rejects a literal digit even when it equals a slot value', () => {
    expect(validateNarration('You broke it 14 times.', slots).ok).toBe(false);
  });

  it('rejects digits echoed from rule JSON', () => {
    expect(validateNarration('Rule {"t":"max_leverage","x":5} was broken.', slots).ok).toBe(false);
  });

  it('rejects non-ASCII digits', () => {
    expect(validateNarration('It cost ١٢٣ dollars.', slots).ok).toBe(false);
    expect(validateNarration('It cost １２ dollars.', slots).ok).toBe(false);
  });

  it('rejects unknown slot tokens', () => {
    const check = validateNarration('You lost {profit}.', slots);
    expect(check.ok).toBe(false);
  });

  it('falls back to the deterministic template and counts it', () => {
    const fw = new Firewall();
    const bad = fw.guard('Lost 900 dollars.', slots, 'Lost {cost} in {breaks} breaks.');
    expect(bad).toEqual({ text: 'Lost $1,240 in 14 breaks.', usedFallback: true });
    const good = fw.guard('Lost {cost}.', slots, 'unused');
    expect(good).toEqual({ text: 'Lost $1,240.', usedFallback: false });
    expect(fw.stats()).toEqual({ passes: 1, failures: 1 });
    expect(JSON.parse(JSON.stringify(fw.stats()))).toEqual(fw.stats());
  });

  it('uses the fallback when the LLM gave nothing', () => {
    const fw = new Firewall();
    expect(fw.guard(null, slots, 'Lost {cost}.').usedFallback).toBe(true);
    expect(fw.stats().failures).toBe(1);
  });
});
