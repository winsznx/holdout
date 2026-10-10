import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { credsFromEnv, DemoClient, type Fill } from './client.ts';

type BotId = 'R' | 'A' | 'V' | 'S' | 'C';
type Dir = 'long' | 'short';

interface Lot {
  qty: number;
  openOrderId: string;
}

interface Position {
  dir: Dir;
  leverage: number;
  lots: Lot[];
  entryPrice: number;
  openedAt: number;
  closeAt: number;
  addDecided: boolean;
}

interface BotState {
  position: Position | null;
  lastSignalTs: number;
  cooldownUntil: number;
  winStreak: number;
  pendingRevenge: { dir: Dir; at: number } | null;
  roundTrips: number;
}

interface BotConfig {
  id: BotId;
  symbol: string;
  baseLeverage: number;
  notionalUsd: number;
}

const NOTIONAL_USD = Number(process.env.HARNESS_NOTIONAL_USD ?? 20);
const BOTS: BotConfig[] = [
  { id: 'R', symbol: 'BTCUSDT', baseLeverage: 5, notionalUsd: NOTIONAL_USD },
  { id: 'A', symbol: 'ETHUSDT', baseLeverage: 5, notionalUsd: NOTIONAL_USD },
  { id: 'V', symbol: 'SOLUSDT', baseLeverage: 5, notionalUsd: NOTIONAL_USD },
  { id: 'S', symbol: 'NVDAUSDT', baseLeverage: 5, notionalUsd: NOTIONAL_USD },
  { id: 'C', symbol: 'DOGEUSDT', baseLeverage: 5, notionalUsd: NOTIONAL_USD },
];

const FAST = 3;
const SLOW = 8;
const HOLD_MIN_MS = 60_000;
const HOLD_MAX_MS = 180_000;
const COOLDOWN_MS = 5 * 60_000;
const ADD_ADVERSE = 0.001;
const TICK_MS = 5_000;
const STOP_AT = process.env.HARNESS_STOP_AT ? Date.parse(process.env.HARNESS_STOP_AT) : Number.POSITIVE_INFINITY;

const LOG_DIR = new URL('../../evidence/raw/harness/', import.meta.url).pathname;
const STATE_DIR = new URL('../state/', import.meta.url).pathname;
mkdirSync(LOG_DIR, { recursive: true });
mkdirSync(STATE_DIR, { recursive: true });

function log(bot: BotId, event: string, detail: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: Date.now(), iso: new Date().toISOString(), bot, event, ...detail });
  appendFileSync(`${LOG_DIR}${bot}.jsonl`, line + '\n');
  console.log(line);
}

function loadState(id: BotId): BotState {
  const path = `${STATE_DIR}${id}.json`;
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as BotState;
  return { position: null, lastSignalTs: 0, cooldownUntil: 0, winStreak: 0, pendingRevenge: null, roundTrips: 0 };
}

function saveState(id: BotId, state: BotState): void {
  writeFileSync(`${STATE_DIR}${id}.json`, JSON.stringify(state));
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  values.forEach((v, i) => out.push(i === 0 ? v : v * k + (out[i - 1] as number) * (1 - k)));
  return out;
}

function trendSignal(closes: number[]): Dir | null {
  const fast = ema(closes, FAST);
  const slow = ema(closes, SLOW);
  const n = closes.length - 1;
  const diff = (fast[n] as number) - (slow[n] as number);
  if (diff > 0) return 'long';
  if (diff < 0) return 'short';
  return null;
}

function etSession(now: Date): 'weekend' | 'overnight' | 'pre_market' | 'regular' | 'after_hours' {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = get('weekday');
  const minutes = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
  if (weekday === 'Sat' || weekday === 'Sun') return 'weekend';
  if (minutes >= 20 * 60 || minutes < 4 * 60) return 'overnight';
  if (minutes < 9 * 60 + 30) return 'pre_market';
  if (minutes < 16 * 60) return 'regular';
  return 'after_hours';
}

function roundQty(qty: number, multiplier: number, min: number): string {
  const steps = Math.max(Math.round(qty / multiplier), Math.round(min / multiplier));
  const decimals = (String(multiplier).split('.')[1] ?? '').length;
  return (steps * multiplier).toFixed(decimals);
}

function netOfFills(fills: Fill[]): { pnl: number; fees: number } {
  let pnl = 0;
  let fees = 0;
  for (const f of fills) {
    pnl += Number(f.execPnl);
    for (const d of f.feeDetail) fees += Number(d.fee);
  }
  return { pnl, fees };
}

const client = new DemoClient(credsFromEnv());
const specs = new Map<string, { multiplier: number; min: number; maxLeverage: number }>();
const states = new Map<BotId, BotState>();
let oidCounter = 0;
const oid = (bot: BotId, tag: string, leverage: number) => `h${bot}${tag}L${leverage}x${Date.now().toString(36)}${(oidCounter++).toString(36)}`;

async function openLot(bot: BotConfig, state: BotState, dir: Dir, leverage: number, notional: number, reason: string): Promise<void> {
  const spec = specs.get(bot.symbol);
  if (!spec) throw new Error(`no spec for ${bot.symbol}`);
  const price = await client.lastPrice(bot.symbol);
  const qty = roundQty(notional / price, spec.multiplier, spec.min);
  await client.setLeverage(bot.symbol, leverage);
  const side = dir === 'long' ? 'buy' : 'sell';
  const orderId = await client.placeMarket(bot.symbol, side, dir, qty, oid(bot.id, 'o', leverage));
  const fills = await client.fillsByOrder(orderId);
  const entry = fills.reduce((s, f) => s + Number(f.execPrice) * Number(f.execQty), 0) / fills.reduce((s, f) => s + Number(f.execQty), 0);
  const lot: Lot = { qty: Number(qty), openOrderId: orderId };
  if (state.position) {
    state.position.lots.push(lot);
  } else {
    const hold = HOLD_MIN_MS + Math.random() * (HOLD_MAX_MS - HOLD_MIN_MS);
    state.position = { dir, leverage, lots: [lot], entryPrice: entry, openedAt: Date.now(), closeAt: Date.now() + hold, addDecided: false };
  }
  log(bot.id, 'open', { reason, dir, leverage, qty, notional, entry, orderId, symbol: bot.symbol });
}

async function closePosition(bot: BotConfig, state: BotState): Promise<{ net: number } | null> {
  const pos = state.position;
  if (!pos) return null;
  const spec = specs.get(bot.symbol);
  if (!spec) throw new Error(`no spec for ${bot.symbol}`);
  const totalQty = pos.lots.reduce((s, l) => s + l.qty, 0);
  const decimals = (String(spec.multiplier).split('.')[1] ?? '').length;
  const side = pos.dir === 'long' ? 'sell' : 'buy';
  const closeId = await client.placeMarket(bot.symbol, side, pos.dir, totalQty.toFixed(decimals), oid(bot.id, 'c', pos.leverage));
  const closeFills = await client.fillsByOrder(closeId);
  let openPnl = 0;
  let openFees = 0;
  for (const lot of pos.lots) {
    const r = netOfFills(await client.fillsByOrder(lot.openOrderId));
    openPnl += r.pnl;
    openFees += r.fees;
  }
  const closed = netOfFills(closeFills);
  const net = openPnl + closed.pnl - openFees - closed.fees;
  state.position = null;
  state.roundTrips += 1;
  log(bot.id, 'close', { dir: pos.dir, net, closeOrderId: closeId, heldMs: Date.now() - pos.openedAt, lots: pos.lots.length, leverage: pos.leverage });
  return { net };
}

function leverageFor(bot: BotConfig, state: BotState): number {
  if (bot.id !== 'V') return bot.baseLeverage;
  const spec = specs.get(bot.symbol);
  const cap = Math.min(25, spec?.maxLeverage ?? 25);
  return state.winStreak < 3 ? bot.baseLeverage : Math.min(cap, bot.baseLeverage + 5 * (state.winStreak - 2));
}

async function tick(bot: BotConfig): Promise<void> {
  const state = states.get(bot.id) as BotState;
  const now = Date.now();

  if (state.position) {
    const pos = state.position;
    if (bot.id === 'A' && !pos.addDecided) {
      const price = await client.lastPrice(bot.symbol);
      const adverse = pos.dir === 'long' ? (pos.entryPrice - price) / pos.entryPrice : (price - pos.entryPrice) / pos.entryPrice;
      if (adverse >= ADD_ADVERSE) {
        pos.addDecided = true;
        const draw = Math.random();
        log(bot.id, 'add_decision', { adverse, draw, willAdd: draw < 0.4 });
        if (draw < 0.4) await openLot(bot, state, pos.dir, pos.leverage, bot.notionalUsd, 'leak:add_to_loser');
      }
    }
    if (now >= pos.closeAt) {
      const result = await closePosition(bot, state);
      if (result) {
        const lost = result.net < 0;
        state.winStreak = lost ? 0 : state.winStreak + 1;
        if (lost) {
          if (bot.id === 'R') {
            const draw = Math.random();
            log(bot.id, 'revenge_decision', { draw, willRevenge: draw < 0.5 });
            if (draw < 0.5) state.pendingRevenge = { dir: pos.dir, at: now + Math.random() * 120_000 };
            else state.cooldownUntil = now + COOLDOWN_MS;
          } else {
            state.cooldownUntil = now + COOLDOWN_MS;
          }
        }
      }
    }
    return;
  }

  if (bot.id === 'R' && state.pendingRevenge && now >= state.pendingRevenge.at) {
    const { dir } = state.pendingRevenge;
    state.pendingRevenge = null;
    await openLot(bot, state, dir, bot.baseLeverage, bot.notionalUsd * 2, 'leak:revenge_reentry');
    return;
  }

  if (now >= STOP_AT) return;
  const candles = await client.candles(bot.symbol, '1m', 40);
  const closed = candles.slice(0, -1);
  const lastClosed = closed[closed.length - 1];
  if (!lastClosed || lastClosed.ts <= state.lastSignalTs) return;
  state.lastSignalTs = lastClosed.ts;
  const signal = trendSignal(closed.map((c) => c.close));
  if (!signal) return;

  if (now < state.cooldownUntil) {
    log(bot.id, 'skip', { reason: 'cooldown', signal, cooldownLeftMs: state.cooldownUntil - now });
    return;
  }
  if (bot.id === 'S') {
    const session = etSession(new Date(now));
    if (session === 'regular' || session === 'pre_market' || session === 'after_hours') {
      log(bot.id, 'skip', { reason: 'bot_s_trades_overnight_and_weekend_only', session, signal });
      return;
    }
    log(bot.id, 'leak_context', { session });
  }
  await openLot(bot, state, signal, leverageFor(bot, state), bot.notionalUsd, 'signal:ema_trend');
}

async function main(): Promise<void> {
  for (const bot of BOTS) {
    const inst = await client.instrument(bot.symbol);
    specs.set(bot.symbol, { multiplier: Number(inst.quantityMultiplier), min: Number(inst.minOrderQty), maxLeverage: Number(inst.maxLeverage) });
    states.set(bot.id, loadState(bot.id));
    log(bot.id, 'start', { symbol: bot.symbol, notionalUsd: bot.notionalUsd, resumedPosition: states.get(bot.id)?.position !== null });
  }
  for (;;) {
    for (const bot of BOTS) {
      try {
        await tick(bot);
      } catch (err) {
        log(bot.id, 'error', { message: err instanceof Error ? err.message : String(err) });
      }
      saveState(bot.id, states.get(bot.id) as BotState);
    }
    const allFlat = BOTS.every((b) => states.get(b.id)?.position === null);
    if (Date.now() >= STOP_AT && allFlat) {
      console.log('stop time reached and all positions flat, exiting');
      return;
    }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
}

await main();
