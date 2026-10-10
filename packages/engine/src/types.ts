export type Product = 'perp' | 'stock_perp' | 'rtoken' | 'stock_plus' | 'spot';
export type Direction = 'long' | 'short';
export type Session = 'pre_market' | 'regular' | 'after_hours' | 'overnight' | 'weekend' | 'holiday' | 'early_close';

export interface Fill {
  execId: string;
  orderId: string;
  clientOid?: string;
  symbol: string;
  product: Product;
  side: 'buy' | 'sell';
  tradeSide: 'open' | 'close';
  posSide: Direction;
  qty: string;
  price: string;
  fee: string;
  feeCoin: string;
  execPnl?: string;
  maker: boolean;
  ts: number;
  leverage?: number;
  marginMode?: string;
  weakId?: boolean;
}

export interface FundingRecord {
  id: string;
  symbol: string;
  ts: number;
  amount: string;
}

export interface Lot {
  execId: string;
  ts: number;
  qty: string;
  price: string;
  fee: string;
  addedWhileLosing: boolean;
}

export interface Exit {
  execId: string;
  ts: number;
  qty: string;
  price: string;
  fee: string;
  execPnl?: string;
}

export interface RoundTrip {
  id: string;
  symbol: string;
  product: Product;
  side: Direction;
  entries: Lot[];
  exits: Exit[];
  openTs: number;
  closeTs: number;
  qty: string;
  avgEntry: string;
  avgExit: string;
  grossPnl: string;
  fees: string;
  funding: string;
  netPnl: string;
  maxLeverage?: number;
  addedWhileLosing: boolean;
  liquidated: boolean;
  execIds: string[];
}

export interface LedgerFlags {
  incomplete: boolean;
  incompleteReasons: string[];
  weakIdCount: number;
  openPositions: { symbol: string; side: Direction; qty: string }[];
}

export interface Ledger {
  traderId: string;
  fills: Fill[];
  funding: FundingRecord[];
  roundTrips: RoundTrip[];
  flags: LedgerFlags;
}

export interface ReferencePosition {
  symbol: string;
  openTs: number;
  closeTs: number;
  side: Direction;
  netProfit: string;
}
