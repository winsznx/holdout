import { existsSync, readdirSync, readFileSync } from 'node:fs';
import {
  applyRule,
  auditRule,
  num,
  reconcile,
  type Candle,
  type Context,
  type Ledger,
  type Reconciliation,
  type Rule,
  type RuleAudit,
} from '../../packages/engine/src/index.ts';
import { ledgerOf, type History } from './history.ts';

export const HISTORY_DIR = 'evidence/raw/histories';
export const MARKET_DIR = 'evidence/raw/market';

export const STATED_RULES: Rule[] = [
  { t: 'cooldown_after_loss', minutes: 3 },
  { t: 'no_add_to_loser' },
  { t: 'max_leverage', x: 10 },
  { t: 'session_filter', block: ['overnight', 'weekend'], products: ['stock_perp'] },
];

export const LEAK_RULE: Record<string, Rule['t'] | null> = {
  'bot-R': 'cooldown_after_loss',
  'bot-A': 'no_add_to_loser',
  'bot-V': 'max_leverage',
  'bot-S': 'session_filter',
  'bot-C': null,
};

export function loadHistories(): History[] {
  if (!existsSync(HISTORY_DIR)) return [];
  return readdirSync(HISTORY_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(`${HISTORY_DIR}/${f}`, 'utf8')) as History);
}

export function loadMarket(): Record<string, Candle[]> {
  const out: Record<string, Candle[]> = {};
  if (!existsSync(MARKET_DIR)) return out;
  for (const f of readdirSync(MARKET_DIR).filter((n) => n.startsWith('mark-'))) {
    const json = JSON.parse(readFileSync(`${MARKET_DIR}/${f}`, 'utf8')) as { symbol: string; rows: number[][] };
    out[json.symbol] = json.rows.map((r) => ({ ts: r[0] as number, open: r[1] as number, high: r[2] as number, low: r[3] as number, close: r[4] as number }));
  }
  return out;
}

export function contextFor(history: History, market: Record<string, Candle[]>, disabled: Context['disabled'] = []): Context {
  return {
    dayLevel: history.dayLevel,
    disabled,
    market: {
      markCandles: (symbol, from, to) => {
        const rows = market[symbol];
        if (!rows || rows.length === 0) return undefined;
        const first = rows[0] as Candle;
        const last = rows[rows.length - 1] as Candle;
        if (from < first.ts || to > last.ts + 60_000) return undefined;
        return rows.filter((c) => c.ts + 60_000 > from && c.ts <= to);
      },
    },
  };
}

export interface TraderBase {
  history: History;
  ledger: Ledger;
  recon: Reconciliation;
  ctx: Context;
  blocked: string | null;
}

export function prepare(history: History, market: Record<string, Candle[]>): TraderBase {
  const ledger = ledgerOf(history);
  const recon = reconcile(ledger.roundTrips, history.reference);
  const ctx = contextFor(history, market);
  const blocked = !recon.pass
    ? `reconciliation failed: ${recon.reason}`
    : ledger.flags.incomplete
      ? `ledger incomplete: ${ledger.flags.incompleteReasons[0] ?? 'unknown'}`
      : null;
  return { history, ledger, recon, ctx, blocked };
}

export function statedAudits(base: TraderBase): RuleAudit[] {
  return STATED_RULES.map((rule) => auditRule(base.history.meta.id, base.ledger.roundTrips, rule, base.ctx));
}

export function flagged(audit: RuleAudit): boolean {
  return audit.status === 'priced' && num(audit.costDelta) > 0 && audit.interval !== null && audit.interval.lo > 0;
}

export function applyForReport(base: TraderBase, rule: Rule) {
  return applyRule(base.ledger.roundTrips, rule, base.ctx);
}
