import Decimal from 'decimal.js';
import type { Direction, Fill, FundingRecord, Product, ReferencePosition } from '../../engine/src/types.ts';
import { NormalizeError } from './errors.ts';
import type { Instrument } from './public.ts';
import type { RawFill, RawFinancialRecord, RawHistoryPosition } from './private.ts';

export type ProductClassifier = (input: { symbol: string; category: string }) => Product;

const RTOKEN_SYMBOL = /^r[A-Z0-9]+USDT$/;
const LEVERAGE_TAG = /L(\d{1,3}(?:\.\d+)?)x/;
const FUNDING_TYPE = /FUND|SETTLE_FEE/i;

export function parseLeverageFromClientOid(clientOid: string | undefined): number | undefined {
  if (!clientOid) return undefined;
  const match = LEVERAGE_TAG.exec(clientOid);
  if (!match || match[1] === undefined) return undefined;
  const leverage = Number(match[1]);
  return leverage >= 1 && leverage <= 500 ? leverage : undefined;
}

export function stockSymbolsFromInstruments(instruments: Pick<Instrument, 'symbol' | 'symbolType'>[]): Set<string> {
  return new Set(instruments.filter((i) => i.symbolType === 'stock').map((i) => i.symbol));
}

export function buildProductClassifier(instruments: Pick<Instrument, 'symbol' | 'symbolType'>[]): ProductClassifier {
  const stocks = stockSymbolsFromInstruments(instruments);
  return ({ symbol, category }) => {
    if (category === 'SPOT') return RTOKEN_SYMBOL.test(symbol) ? 'rtoken' : 'spot';
    return stocks.has(symbol) ? 'stock_perp' : 'perp';
  };
}

function parseTradeSide(value: string): 'open' | 'close' {
  if (value === 'open_long' || value === 'open_short') return 'open';
  if (value === 'close_long' || value === 'close_short') return 'close';
  throw new NormalizeError('tradeSide', value, 'expected open_long, open_short, close_long or close_short');
}

function parseTimestamp(field: string, value: string): number {
  const ts = Number(value);
  if (!Number.isFinite(ts) || ts <= 0) throw new NormalizeError(field, value, 'expected positive millisecond timestamp');
  return ts;
}

function sumFees(fill: RawFill): { fee: string; feeCoin: string } {
  const details = fill.feeDetail ?? [];
  const coins = new Set(details.map((d) => d.feeCoin));
  if (coins.size > 1) {
    throw new NormalizeError('feeDetail', [...coins].join(','), 'fill has fees in more than one coin');
  }
  const total = details.reduce((sum, d) => sum.plus(new Decimal(d.fee)), new Decimal(0));
  return { fee: total.toFixed(), feeCoin: details[0]?.feeCoin ?? '' };
}

export function normalizeFill(raw: RawFill, classify: ProductClassifier): Fill {
  if (raw.side !== 'buy' && raw.side !== 'sell') throw new NormalizeError('side', String(raw.side), 'expected buy or sell');
  if (raw.posSide !== 'long' && raw.posSide !== 'short') {
    throw new NormalizeError('posSide', String(raw.posSide), 'expected long or short');
  }
  const { fee, feeCoin } = sumFees(raw);
  const clientOid = raw.clientOid === '' ? undefined : raw.clientOid;
  const fill: Fill = {
    execId: raw.execId,
    orderId: raw.orderId,
    symbol: raw.symbol,
    product: classify({ symbol: raw.symbol, category: raw.category }),
    side: raw.side,
    tradeSide: parseTradeSide(raw.tradeSide),
    posSide: raw.posSide,
    qty: raw.execQty,
    price: raw.execPrice,
    fee,
    feeCoin,
    maker: raw.tradeScope === 'maker',
    ts: parseTimestamp('createdTime', raw.createdTime),
  };
  if (clientOid !== undefined) fill.clientOid = clientOid;
  if (raw.execPnl !== undefined && raw.execPnl !== '') fill.execPnl = raw.execPnl;
  const leverage = parseLeverageFromClientOid(clientOid);
  if (leverage !== undefined) fill.leverage = leverage;
  return fill;
}

export function normalizeFills(raws: RawFill[], classify: ProductClassifier): Fill[] {
  return raws.map((raw) => normalizeFill(raw, classify));
}

export function normalizeHistoryPosition(raw: RawHistoryPosition): ReferencePosition {
  const side: Direction = raw.posSide;
  if (side !== 'long' && side !== 'short') throw new NormalizeError('posSide', String(raw.posSide), 'expected long or short');
  return {
    symbol: raw.symbol,
    openTs: parseTimestamp('createdTime', raw.createdTime),
    closeTs: parseTimestamp('updatedTime', raw.updatedTime),
    side,
    netProfit: raw.netProfit,
  };
}

export function isFundingRecord(raw: Pick<RawFinancialRecord, 'type'>): boolean {
  return FUNDING_TYPE.test(raw.type);
}

export function normalizeFundingRecords(raws: RawFinancialRecord[]): FundingRecord[] {
  return raws
    .filter(isFundingRecord)
    .map((raw) => ({
      id: raw.id,
      symbol: raw.symbol,
      ts: parseTimestamp('ts', raw.ts),
      amount: raw.amount,
    }));
}
