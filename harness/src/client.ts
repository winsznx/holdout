import { createHmac } from 'node:crypto';

const BASE = 'https://api.bitget.com';

export interface DemoCreds {
  key: string;
  secret: string;
  passphrase: string;
}

export interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Fill {
  execId: string;
  orderId: string;
  clientOid: string;
  symbol: string;
  side: 'buy' | 'sell';
  tradeSide: string;
  posSide: 'long' | 'short';
  execPrice: string;
  execQty: string;
  execPnl: string;
  feeDetail: { feeCoin: string; fee: string }[];
  createdTime: string;
}

export function credsFromEnv(): DemoCreds {
  const { BITGET_DEMO_KEY, BITGET_DEMO_SECRET, BITGET_DEMO_PASSPHRASE } = process.env;
  if (!BITGET_DEMO_KEY || !BITGET_DEMO_SECRET || !BITGET_DEMO_PASSPHRASE) {
    throw new Error('BITGET_DEMO_KEY, BITGET_DEMO_SECRET and BITGET_DEMO_PASSPHRASE are required (harness/.env)');
  }
  return { key: BITGET_DEMO_KEY, secret: BITGET_DEMO_SECRET, passphrase: BITGET_DEMO_PASSPHRASE };
}

export class DemoClient {
  constructor(private readonly creds: DemoCreds) {}

  private async request<T>(method: 'GET' | 'POST', path: string, query = '', body = ''): Promise<T> {
    const ts = Date.now().toString();
    const target = query ? `${path}?${query}` : path;
    const sign = createHmac('sha256', this.creds.secret).update(ts + method + target + body).digest('base64');
    const res = await fetch(BASE + target, {
      method,
      headers: {
        'ACCESS-KEY': this.creds.key,
        'ACCESS-SIGN': sign,
        'ACCESS-TIMESTAMP': ts,
        'ACCESS-PASSPHRASE': this.creds.passphrase,
        'Content-Type': 'application/json',
        paptrading: '1',
        locale: 'en-US',
      },
      body: body || undefined,
    });
    const json = (await res.json()) as { code: string; msg: string; data: T };
    if (json.code !== '00000') throw new Error(`Bitget ${path} ${json.code} ${json.msg}`);
    return json.data;
  }

  async candles(symbol: string, interval = '1m', limit = 60): Promise<Candle[]> {
    const rows = await this.request<string[][]>(
      'GET',
      '/api/v3/market/candles',
      `category=USDT-FUTURES&symbol=${symbol}&interval=${interval}&limit=${limit}`,
    );
    return rows.map((r) => ({
      ts: Number(r[0]),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
    }));
  }

  async lastPrice(symbol: string): Promise<number> {
    const rows = await this.request<{ symbol: string; lastPrice: string }[]>(
      'GET',
      '/api/v3/market/tickers',
      `category=USDT-FUTURES&symbol=${symbol}`,
    );
    const row = rows[0];
    if (!row) throw new Error(`no ticker for ${symbol}`);
    return Number(row.lastPrice);
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    await this.request('POST', '/api/v3/account/set-leverage', '', JSON.stringify({ category: 'USDT-FUTURES', symbol, leverage: String(leverage) }));
  }

  async placeMarket(symbol: string, side: 'buy' | 'sell', posSide: 'long' | 'short', qty: string, clientOid: string): Promise<string> {
    const data = await this.request<{ orderId: string }>(
      'POST',
      '/api/v3/trade/place-order',
      '',
      JSON.stringify({ category: 'USDT-FUTURES', symbol, qty, side, posSide, orderType: 'market', clientOid }),
    );
    return data.orderId;
  }

  async fillsByOrder(orderId: string): Promise<Fill[]> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const data = await this.request<{ list: Fill[] | null }>('GET', '/api/v3/trade/fills', `category=USDT-FUTURES&orderId=${orderId}`);
      if (data.list && data.list.length > 0) return data.list;
      await new Promise((r) => setTimeout(r, 700));
    }
    throw new Error(`no fills for order ${orderId}`);
  }

  async allFills(startTime: number, endTime: number): Promise<Fill[]> {
    const out: Fill[] = [];
    let cursor = '';
    for (;;) {
      const q = `category=USDT-FUTURES&startTime=${startTime}&endTime=${endTime}&limit=100${cursor ? `&cursor=${cursor}` : ''}`;
      const data = await this.request<{ list: Fill[] | null; cursor?: string }>('GET', '/api/v3/trade/fills', q);
      if (!data.list || data.list.length === 0) break;
      out.push(...data.list);
      if (data.list.length < 100 || !data.cursor) break;
      cursor = data.cursor;
    }
    return out;
  }

  async instrument(symbol: string): Promise<{ minOrderQty: string; quantityMultiplier: string; maxLeverage: string }> {
    const rows = await this.request<{ minOrderQty: string; quantityMultiplier: string; maxLeverage: string }[]>(
      'GET',
      '/api/v3/market/instruments',
      `category=USDT-FUTURES&symbol=${symbol}`,
    );
    const row = rows[0];
    if (!row) throw new Error(`no instrument ${symbol}`);
    return row;
  }
}
