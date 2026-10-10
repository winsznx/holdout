import { mkdirSync, writeFileSync } from 'node:fs';
import { PublicClient, fetchCandlesRange } from '../packages/bitget/src/index.ts';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'NVDAUSDT', 'DOGEUSDT'];
const start = Date.parse(process.env.HISTORY_START ?? '2026-10-10T22:00:00Z');
const end = Date.now();
const client = new PublicClient();
mkdirSync('evidence/raw/market', { recursive: true });
for (const symbol of SYMBOLS) {
  const candles = await fetchCandlesRange(client, { category: 'USDT-FUTURES', symbol, interval: '1m', type: 'mark', startTime: start, endTime: end });
  const rows = candles.map((c) => [c.ts, Number(c.open), Number(c.high), Number(c.low), Number(c.close)]);
  writeFileSync(`evidence/raw/market/mark-${symbol}-1m.json`, JSON.stringify({ source: 'Bitget UTA v3 GET /api/v3/market/candles type=mark interval=1m', symbol, startTime: start, endTime: end, rows }));
  console.log(symbol, rows.length);
}
