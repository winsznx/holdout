import Papa from 'papaparse';
import type { Direction, Fill, Product, ReferencePosition, RoundTrip } from './types.ts';
import { D, str } from './decimal.ts';
import { sha256Hex } from './hash.ts';
import { weakExecId } from './ingest.ts';

export interface CsvIssue {
  line: number;
  reason: string;
}

export interface CsvParse {
  adapter: 'money-boys-backtest' | 'money-boys-paper' | 'bitget-export';
  fills: Fill[];
  roundTrips: RoundTrip[];
  reference: ReferencePosition[];
  issues: CsvIssue[];
  rowsRead: number;
  untestedAgainstLiveExport: boolean;
}

function readRows(text: string): { rows: Record<string, string>[]; fields: string[]; issues: CsvIssue[] } {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
  const issues: CsvIssue[] = [];
  for (const err of parsed.errors) {
    issues.push({ line: (err.row ?? 0) + 2, reason: `${err.code}: ${err.message}` });
  }
  const badRows = new Set(parsed.errors.map((e) => e.row));
  const rows = parsed.data.filter((_, i) => !badRows.has(i));
  return { rows, fields: parsed.meta.fields ?? [], issues };
}

function classify(symbol: string): Product {
  return /^r[A-Z]+USDT$/.test(symbol) ? 'rtoken' : 'stock_perp';
}

function dayTs(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

const BACKTEST_COLUMNS = ['tradeId', 'symbol', 'side', 'entryDate', 'quantity', 'exitDate', 'pnlUsd', 'feesUsd', 'entryTokenPrice', 'exitTokenPrice'];

export function parseMoneyBoysBacktest(text: string): CsvParse {
  const { rows, fields, issues } = readRows(text);
  const missing = BACKTEST_COLUMNS.filter((c) => !fields.includes(c));
  if (missing.length > 0) throw new Error(`money-boys backtest CSV is missing columns: ${missing.join(', ')}`);
  const fills: Fill[] = [];
  const roundTrips: RoundTrip[] = [];
  for (const [i, r] of rows.entries()) {
    const posSide: Direction = r.side === 'SELL_BASIS' ? 'short' : 'long';
    const net = D(r.pnlUsd as string);
    const fees = D(r.feesUsd as string);
    const gross = net.plus(fees);
    const openTs = dayTs(r.entryDate as string);
    const closeTs = dayTs(r.exitDate as string);
    if (Number.isNaN(openTs) || Number.isNaN(closeTs)) {
      issues.push({ line: i + 2, reason: 'unparseable date' });
      continue;
    }
    const symbol = r.symbol as string;
    const product = classify(symbol);
    const tradeId = r.tradeId as string;
    const openId = `${tradeId}#1open`;
    const closeId = `${tradeId}#2close`;
    const halfFee = fees.div(2);
    const base = { symbol, product, posSide, orderId: tradeId, feeCoin: 'USDT', maker: false };
    fills.push({ ...base, execId: openId, side: posSide === 'long' ? 'buy' : 'sell', tradeSide: 'open', qty: r.quantity as string, price: r.entryTokenPrice as string, fee: str(halfFee), ts: openTs });
    fills.push({ ...base, execId: closeId, side: posSide === 'long' ? 'sell' : 'buy', tradeSide: 'close', qty: r.quantity as string, price: r.exitTokenPrice as string, fee: str(fees.minus(halfFee)), execPnl: str(gross), ts: closeTs });
    roundTrips.push({
      id: `rt_${sha256Hex(tradeId).slice(0, 16)}`,
      symbol,
      product,
      side: posSide,
      entries: [{ execId: openId, ts: openTs, qty: r.quantity as string, price: r.entryTokenPrice as string, fee: str(halfFee), addedWhileLosing: false }],
      exits: [{ execId: closeId, ts: closeTs, qty: r.quantity as string, price: r.exitTokenPrice as string, fee: str(fees.minus(halfFee)), execPnl: str(gross) }],
      openTs,
      closeTs,
      qty: r.quantity as string,
      avgEntry: r.entryTokenPrice as string,
      avgExit: r.exitTokenPrice as string,
      grossPnl: str(gross),
      fees: str(fees),
      funding: '0',
      netPnl: str(net),
      addedWhileLosing: false,
      liquidated: false,
      execIds: [openId, closeId],
    });
  }
  const reference: ReferencePosition[] = roundTrips.map((t) => ({ symbol: t.symbol, openTs: t.openTs, closeTs: t.closeTs, side: t.side, netProfit: t.netPnl }));
  return { adapter: 'money-boys-backtest', fills, roundTrips, reference, issues, rowsRead: rows.length, untestedAgainstLiveExport: false };
}

const PAPER_COLUMNS = ['timestamp', 'symbol', 'decision', 'fillPrice', 'filledQuantity', 'pnlUsd', 'orderId'];

export function parseMoneyBoysPaper(text: string): CsvParse {
  const { rows, fields, issues } = readRows(text);
  const missing = PAPER_COLUMNS.filter((c) => !fields.includes(c));
  if (missing.length > 0) throw new Error(`money-boys paper CSV is missing columns: ${missing.join(', ')}`);
  const fills: Fill[] = [];
  const roundTrips: RoundTrip[] = [];
  for (const [i, r] of rows.entries()) {
    const qty = Number(r.filledQuantity);
    if (r.decision !== 'APPROVED' || !r.orderId || !(qty > 0)) continue;
    const ts = Date.parse(r.timestamp as string);
    if (Number.isNaN(ts)) {
      issues.push({ line: i + 2, reason: 'unparseable timestamp' });
      continue;
    }
    const symbol = r.symbol as string;
    const product = classify(symbol);
    const orderId = r.orderId as string;
    const pnl = D(r.pnlUsd as string);
    const openId = `${orderId}#1open`;
    const closeId = `${orderId}#2close`;
    const price = r.fillPrice as string;
    const base = { symbol, product, posSide: 'long' as Direction, orderId, feeCoin: 'USDT', maker: false, ts };
    fills.push({ ...base, execId: openId, side: 'buy', tradeSide: 'open', qty: r.filledQuantity as string, price, fee: '0' });
    fills.push({ ...base, execId: closeId, side: 'sell', tradeSide: 'close', qty: r.filledQuantity as string, price, fee: '0', execPnl: str(pnl) });
    roundTrips.push({
      id: `rt_${sha256Hex(orderId).slice(0, 16)}`,
      symbol,
      product,
      side: 'long',
      entries: [{ execId: openId, ts, qty: r.filledQuantity as string, price, fee: '0', addedWhileLosing: false }],
      exits: [{ execId: closeId, ts, qty: r.filledQuantity as string, price, fee: '0', execPnl: str(pnl) }],
      openTs: ts,
      closeTs: ts,
      qty: r.filledQuantity as string,
      avgEntry: price,
      avgExit: price,
      grossPnl: str(pnl),
      fees: '0',
      funding: '0',
      netPnl: str(pnl),
      addedWhileLosing: false,
      liquidated: false,
      execIds: [openId, closeId],
    });
  }
  const reference: ReferencePosition[] = roundTrips.map((t) => ({ symbol: t.symbol, openTs: t.openTs, closeTs: t.closeTs, side: t.side, netProfit: t.netPnl }));
  return { adapter: 'money-boys-paper', fills, roundTrips, reference, issues, rowsRead: rows.length, untestedAgainstLiveExport: false };
}

const ALIASES: Record<string, string[]> = {
  tradeId: ['trade id', 'fill id', 'exec id', 'tradeid', 'execid'],
  orderId: ['order id', 'order no.', 'order no', 'orderid', 'order number'],
  symbol: ['symbol', 'futures', 'pair', 'trading pair', 'contract'],
  side: ['side', 'direction', 'type', 'trade side'],
  price: ['price', 'filled price', 'avg price', 'execution price', 'fill price'],
  qty: ['quantity', 'qty', 'filled amount', 'filled quantity', 'amount', 'size'],
  fee: ['fee', 'fees', 'trading fee', 'fee amount'],
  pnl: ['realized pnl', 'realized p&l', 'profit', 'pnl', 'realized profit', 'closed pnl'],
  time: ['time', 'date', 'date(utc)', 'date (utc)', 'created time', 'trade time', 'timestamp', 'filled time'],
  role: ['role', 'maker/taker', 'liquidity'],
};

function pick(row: Record<string, string>, key: string): string | undefined {
  const wanted = ALIASES[key] ?? [];
  for (const [col, value] of Object.entries(row)) {
    if (wanted.includes(col.trim().toLowerCase())) return value;
  }
  return undefined;
}

export function parseBitgetExport(text: string): CsvParse {
  const { rows, issues } = readRows(text);
  const fills: Fill[] = [];
  for (const [i, r] of rows.entries()) {
    const symbol = pick(r, 'symbol');
    const sideText = (pick(r, 'side') ?? '').toLowerCase();
    const price = pick(r, 'price');
    const qty = pick(r, 'qty');
    const time = pick(r, 'time');
    const orderId = pick(r, 'orderId') ?? '';
    if (!symbol || !price || !qty || !time) {
      issues.push({ line: i + 2, reason: 'missing symbol, price, quantity or time column' });
      continue;
    }
    const ts = /^\d{12,}$/.test(time.trim()) ? Number(time.trim()) : Date.parse(time.includes('T') || time.includes('Z') ? time : `${time.replace(' ', 'T')}Z`);
    const isOpen = sideText.includes('open') || sideText.includes('buy');
    const isLong = sideText.includes('long') || (!sideText.includes('short') && sideText.includes('buy'));
    const isClose = sideText.includes('close') || sideText.includes('sell');
    if (Number.isNaN(ts) || (!isOpen && !isClose)) {
      issues.push({ line: i + 2, reason: `unrecognized side or time: "${sideText}" / "${time}"` });
      continue;
    }
    const tradeSide = sideText.includes('close') ? 'close' : 'open';
    const posSide: Direction = isLong ? 'long' : 'short';
    const partial = { orderId, ts, price: D(price).toFixed(), qty: D(qty).abs().toFixed(), side: (tradeSide === 'open') === (posSide === 'long') ? ('buy' as const) : ('sell' as const) };
    const explicitId = pick(r, 'tradeId');
    const execId = explicitId && explicitId.length > 0 ? explicitId : weakExecId(partial);
    const pnl = pick(r, 'pnl');
    const feeText = pick(r, 'fee') ?? '0';
    fills.push({
      execId,
      orderId,
      symbol,
      product: /^r[A-Z]+USDT$/.test(symbol) ? 'rtoken' : 'perp',
      side: partial.side,
      tradeSide,
      posSide,
      qty: partial.qty,
      price: partial.price,
      fee: D(feeText || '0').abs().toFixed(),
      feeCoin: 'USDT',
      execPnl: tradeSide === 'close' && pnl !== undefined && pnl !== '' ? D(pnl).toFixed() : undefined,
      maker: (pick(r, 'role') ?? '').toLowerCase().includes('maker'),
      ts,
      ...(explicitId && explicitId.length > 0 ? {} : { weakId: true }),
    });
  }
  return { adapter: 'bitget-export', fills, roundTrips: [], reference: [], issues, rowsRead: rows.length, untestedAgainstLiveExport: true };
}
