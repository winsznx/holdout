import type { Direction, Product, RoundTrip, Session } from './types.ts';
import { num } from './decimal.ts';
import { sha256Hex, stableStringify } from './hash.ts';
import { median } from './stats.ts';
import { NYSE_2026, earningsWindowHours, tagSession, type Calendar, type EarningsEvent } from './sessions.ts';
import { tagTrip } from './sessions.ts';
import { renderRule } from './rules/render.ts';
import type { Rule } from './rules/schema.ts';

export const LEVERAGE_BUCKETS = ['1-3', '3-5', '5-10', '10-20', '20+', 'unknown'] as const;
export type LeverageBucket = (typeof LEVERAGE_BUCKETS)[number];

export function leverageBucket(x: number | undefined): LeverageBucket {
  if (x === undefined) return 'unknown';
  if (x <= 3) return '1-3';
  if (x <= 5) return '3-5';
  if (x <= 10) return '5-10';
  if (x <= 20) return '10-20';
  return '20+';
}

export interface BucketKey {
  symbol: string;
  product: Product;
  side: Direction;
  session: Session;
  leverage: LeverageBucket;
  holdsAcrossOpen: boolean;
}

export interface BucketStats extends BucketKey {
  n: number;
  winRate: number;
  medianNet: number;
  totalNet: number;
}

export function bucketId(k: BucketKey): string {
  return [k.symbol, k.product, k.side, k.session, k.leverage, k.holdsAcrossOpen ? 'across_open' : 'intraday'].join('|');
}

export function similarTradeIndex(trips: RoundTrip[], cal: Calendar = NYSE_2026): BucketStats[] {
  const groups = new Map<string, { key: BucketKey; nets: number[] }>();
  for (const t of trips) {
    const tags = tagTrip(t, [], cal);
    const key: BucketKey = {
      symbol: t.symbol,
      product: t.product,
      side: t.side,
      session: tags.session,
      leverage: leverageBucket(t.maxLeverage),
      holdsAcrossOpen: tags.holdsAcrossOpen,
    };
    const id = bucketId(key);
    const g = groups.get(id);
    if (g) g.nets.push(num(t.netPnl));
    else groups.set(id, { key, nets: [num(t.netPnl)] });
  }
  return [...groups.values()]
    .map(({ key, nets }) => ({
      ...key,
      n: nets.length,
      winRate: nets.filter((x) => x > 0).length / nets.length,
      medianNet: median(nets),
      totalNet: nets.reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => (bucketId(a) < bucketId(b) ? -1 : 1));
}

export type RulebookStatus = 'stated' | 'adopted' | 'rejected' | 'proposed';

export interface RulebookRule {
  id: string;
  rule: Rule;
  rendered: string;
  status: RulebookStatus;
  evidence?: {
    breaks?: number;
    costDelta?: string;
    intervalLo?: number | null;
    intervalHi?: number | null;
    deltaTest?: number;
    p?: number;
    shamMedian?: number;
    baselineDelta?: number;
    nTrain?: number;
    nTest?: number;
    freezeSha256?: string;
  };
}

export interface Rulebook {
  schema: 'holdout.rulebook.v1';
  version: number;
  traderId: string;
  label: string;
  createdAt: string;
  rules: RulebookRule[];
  buckets: BucketStats[];
  ledger: { roundTrips: number; reconciled: boolean; incomplete: boolean };
  sha256: string;
}

export function ruleId(rule: Rule): string {
  return `r_${sha256Hex(stableStringify(rule)).slice(0, 10)}`;
}

export function makeRulebook(input: Omit<Rulebook, 'schema' | 'sha256' | 'rules'> & { rules: Omit<RulebookRule, 'id' | 'rendered'>[] }): Rulebook {
  const rules: RulebookRule[] = input.rules.map((r) => ({ ...r, id: ruleId(r.rule), rendered: renderRule(r.rule) }));
  const body = { ...input, schema: 'holdout.rulebook.v1' as const, rules };
  return { ...body, sha256: sha256Hex(stableStringify(body)) };
}

export function verifyRulebook(book: Rulebook): boolean {
  const { sha256, ...body } = book;
  return sha256Hex(stableStringify(body)) === sha256;
}

export interface TradeIdea {
  symbol: string;
  side: Direction;
  leverage: number;
  product: Product;
  time: number;
}

export interface CheckContext {
  calendar?: Calendar;
  earnings?: EarningsEvent[];
  lastLossClosedTs?: number;
  dayRealizedUsdt?: number;
  openPositionAdverse?: boolean;
}

export type RuleCheck =
  | { ruleId: string; rendered: string; state: 'broken'; reason: string }
  | { ruleId: string; rendered: string; state: 'ok'; reason: string }
  | { ruleId: string; rendered: string; state: 'not_checkable'; reason: string };

export interface TradeCheck {
  idea: TradeIdea;
  sessionNow: Session;
  earningsHours: number | null;
  rules: RuleCheck[];
  broken: number;
  similar: { bucketId: string; found: boolean; n: number; winRate: number | null; medianNet: number | null; totalNet: number | null };
}

export function checkTrade(book: Rulebook, idea: TradeIdea, ctx: CheckContext = {}): TradeCheck {
  const cal = ctx.calendar ?? NYSE_2026;
  const session = tagSession(idea.time, cal);
  const hours = earningsWindowHours(idea.time, ctx.earnings ?? []);
  const active = book.rules.filter((r) => r.status === 'stated' || r.status === 'adopted');
  const checks: RuleCheck[] = active.map((r): RuleCheck => {
    const base = { ruleId: r.id, rendered: r.rendered };
    const rule = r.rule;
    switch (rule.t) {
      case 'max_leverage':
        return idea.leverage > rule.x
          ? { ...base, state: 'broken', reason: `${idea.leverage}x is above the ${rule.x}x cap` }
          : { ...base, state: 'ok', reason: `${idea.leverage}x is within the ${rule.x}x cap` };
      case 'session_filter': {
        if (!(rule.products as string[]).includes(idea.product)) return { ...base, state: 'ok', reason: `rule covers ${rule.products.join(' and ')} only` };
        const blocked = rule.block.some((b) => (b === 'friday_close' ? false : b === 'weekend' ? session === 'weekend' : b === session));
        return blocked
          ? { ...base, state: 'broken', reason: `current session is ${session}` }
          : { ...base, state: 'ok', reason: `current session is ${session}` };
      }
      case 'earnings_blackout':
        if (hours === null) return { ...base, state: 'not_checkable', reason: 'no upcoming earnings date known for this symbol' };
        return hours <= rule.hoursBefore
          ? { ...base, state: 'broken', reason: `earnings in ${hours.toFixed(1)} hours` }
          : { ...base, state: 'ok', reason: `earnings in ${hours.toFixed(1)} hours` };
      case 'cooldown_after_loss':
        if (ctx.lastLossClosedTs === undefined) return { ...base, state: 'not_checkable', reason: 'needs the time your last losing trade closed' };
        return idea.time < ctx.lastLossClosedTs + rule.minutes * 60_000
          ? { ...base, state: 'broken', reason: `last loss closed ${Math.round((idea.time - ctx.lastLossClosedTs) / 60_000)} minutes ago` }
          : { ...base, state: 'ok', reason: 'cooldown has passed' };
      case 'daily_loss_limit':
        if (ctx.dayRealizedUsdt === undefined) return { ...base, state: 'not_checkable', reason: "needs today's realized P&L" };
        return ctx.dayRealizedUsdt <= -rule.usdt
          ? { ...base, state: 'broken', reason: `today's realized P&L is ${ctx.dayRealizedUsdt}` }
          : { ...base, state: 'ok', reason: `today's realized P&L is ${ctx.dayRealizedUsdt}` };
      case 'no_add_to_loser':
        if (ctx.openPositionAdverse === undefined) return { ...base, state: 'not_checkable', reason: 'needs to know whether you hold a losing position in this symbol' };
        return ctx.openPositionAdverse
          ? { ...base, state: 'broken', reason: 'you hold a losing position in this symbol' }
          : { ...base, state: 'ok', reason: 'no losing position in this symbol' };
      case 'hard_stop':
        return { ...base, state: 'not_checkable', reason: `set your exit ${rule.pct}% from entry` };
      case 'product_switch_weekend':
        return idea.product === 'stock_perp' && (session === 'weekend' || session === 'overnight')
          ? { ...base, state: 'broken', reason: `stock perp held during ${session}` }
          : { ...base, state: 'ok', reason: `session is ${session}` };
    }
  });
  const tmp: RoundTrip = { openTs: idea.time, closeTs: idea.time } as RoundTrip;
  const tags = tagTrip(tmp, [], cal);
  const key: BucketKey = { symbol: idea.symbol, product: idea.product, side: idea.side, session, leverage: leverageBucket(idea.leverage), holdsAcrossOpen: tags.holdsAcrossOpen };
  const id = bucketId(key);
  const hit = book.buckets.find((b) => bucketId(b) === id);
  return {
    idea,
    sessionNow: session,
    earningsHours: hours,
    rules: checks,
    broken: checks.filter((c) => c.state === 'broken').length,
    similar: hit
      ? { bucketId: id, found: true, n: hit.n, winRate: hit.winRate, medianNet: hit.medianNet, totalNet: hit.totalNet }
      : { bucketId: id, found: false, n: 0, winRate: null, medianNet: null, totalNet: null },
  };
}
