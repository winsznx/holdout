import fc from 'fast-check';
import type { Direction, Fill, FundingRecord } from '../src/types.ts';

const dec = (n: number, scale: number): string => (n / scale).toFixed(Math.log10(scale));

export interface Episode {
  symbol: string;
  posSide: Direction;
  fills: Fill[];
  funding: FundingRecord[];
}

const episodeArb = (symbol: string, posSide: Direction, startTs: number, tag: string): fc.Arbitrary<Episode> =>
  fc
    .record({
      openLots: fc.array(fc.record({ qty: fc.integer({ min: 1, max: 5000 }), price: fc.integer({ min: 100, max: 900000 }), fee: fc.integer({ min: 0, max: 5000 }) }), { minLength: 1, maxLength: 3 }),
      closeCuts: fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 3 }),
      closePrices: fc.array(fc.integer({ min: 100, max: 900000 }), { minLength: 3, maxLength: 3 }),
      closeFees: fc.array(fc.integer({ min: 0, max: 5000 }), { minLength: 3, maxLength: 3 }),
      pnls: fc.array(fc.integer({ min: -100000, max: 100000 }), { minLength: 3, maxLength: 3 }),
      gaps: fc.array(fc.integer({ min: 1, max: 5000 }), { minLength: 8, maxLength: 8 }),
      fundingAmount: fc.integer({ min: -5000, max: 5000 }),
      hasFunding: fc.boolean(),
    })
    .map((g) => {
      let ts = startTs;
      const fills: Fill[] = [];
      const base = { symbol, product: 'perp' as const, posSide, feeCoin: 'USDT', maker: false };
      let total = 0;
      g.openLots.forEach((lot, i) => {
        ts += g.gaps[i] as number;
        total += lot.qty;
        fills.push({ ...base, execId: `${tag}-o${i}`, orderId: `${tag}-O${i}`, side: posSide === 'long' ? 'buy' : 'sell', tradeSide: 'open', qty: dec(lot.qty, 1000), price: dec(lot.price, 100), fee: dec(lot.fee, 100000), ts });
      });
      const cuts = g.closeCuts.slice(0, Math.min(3, total));
      const weights = cuts.reduce((a, b) => a + b, 0);
      let remaining = total;
      cuts.forEach((cut, i) => {
        const last = i === cuts.length - 1;
        const qty = last ? remaining : Math.max(1, Math.min(remaining - (cuts.length - 1 - i), Math.floor((total * cut) / weights)));
        remaining -= qty;
        ts += g.gaps[3 + i] as number;
        fills.push({ ...base, execId: `${tag}-c${i}`, orderId: `${tag}-C${i}`, side: posSide === 'long' ? 'sell' : 'buy', tradeSide: 'close', qty: dec(qty, 1000), price: dec(g.closePrices[i] as number, 100), fee: dec(g.closeFees[i] as number, 100000), execPnl: dec(g.pnls[i] as number, 100000), ts });
      });
      const open = fills[0]?.ts ?? startTs;
      const close = fills[fills.length - 1]?.ts ?? startTs;
      const funding: FundingRecord[] = g.hasFunding
        ? [{ id: `${tag}-f`, symbol, ts: Math.floor((open + close) / 2), amount: dec(g.fundingAmount, 100000) }]
        : [];
      return { symbol, posSide, fills, funding };
    });

export const validLedgerInput: fc.Arbitrary<{ fills: Fill[]; funding: FundingRecord[] }> = fc
  .array(fc.record({ symbolIdx: fc.integer({ min: 0, max: 2 }), long: fc.boolean() }), { minLength: 1, maxLength: 6 })
  .chain((specs) => {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    const clock = new Map<string, number>();
    const arbs = specs.map((s, i) => {
      const symbol = symbols[s.symbolIdx] as string;
      const posSide: Direction = s.long ? 'long' : 'short';
      const key = `${symbol}|${posSide}`;
      const start = (clock.get(key) ?? 1_700_000_000_000) + 100_000;
      clock.set(key, start + 40_000);
      return episodeArb(symbol, posSide, start, `e${i}`);
    });
    return fc.tuple(...arbs);
  })
  .map((episodes) => ({
    fills: episodes.flatMap((e) => e.fills),
    funding: episodes.flatMap((e) => e.funding),
  }));
