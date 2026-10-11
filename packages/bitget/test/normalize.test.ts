import { describe, expect, it } from 'vitest';
import {
  buildProductClassifier,
  isFundingRecord,
  normalizeFill,
  normalizeFills,
  normalizeFundingRecords,
  normalizeHistoryPosition,
  parseLeverageFromClientOid,
} from '../src/normalize.ts';
import { NormalizeError } from '../src/errors.ts';
import type { Instrument } from '../src/public.ts';
import type { CursorPage } from '../src/http.ts';
import type { RawFill, RawFinancialRecord, RawHistoryPosition } from '../src/private.ts';
import { fixture, type Envelope } from './helpers.ts';

const fills = fixture<Envelope<CursorPage<RawFill>>>('fills').data.list;
const positions = fixture<Envelope<CursorPage<RawHistoryPosition>>>('history-position').data.list;
const records = fixture<Envelope<CursorPage<RawFinancialRecord>>>('financial-records').data.list;
const instruments = fixture<Envelope<Instrument[]>>('instruments').data;
const classify = buildProductClassifier(instruments);

describe('product classification from real instruments', () => {
  it('marks symbolType stock as stock_perp and crypto as perp', () => {
    expect(classify({ symbol: 'NVDAUSDT', category: 'USDT-FUTURES' })).toBe('stock_perp');
    expect(classify({ symbol: 'BTCUSDT', category: 'USDT-FUTURES' })).toBe('perp');
  });

  it('keeps metals as perp even though isRwa is YES', () => {
    const xau = instruments.find((i) => i.symbol === 'XAUUSDT');
    expect(xau?.isRwa).toBe('YES');
    expect(classify({ symbol: 'XAUUSDT', category: 'USDT-FUTURES' })).toBe('perp');
  });

  it('classifies spot rTokens by r prefix', () => {
    expect(classify({ symbol: 'rNVDAUSDT', category: 'SPOT' })).toBe('rtoken');
    expect(classify({ symbol: 'BTCUSDT', category: 'SPOT' })).toBe('spot');
  });
});

describe('normalizeFill on real fills', () => {
  it('normalizes every captured row', () => {
    expect(fills.length).toBeGreaterThan(0);
    const normalized = normalizeFills(fills, classify);
    expect(normalized).toHaveLength(fills.length);
    for (const [index, fill] of normalized.entries()) {
      const raw = fills[index] as RawFill;
      expect(fill.execId).toBe(raw.execId);
      expect(fill.qty).toBe(raw.execQty);
      expect(fill.price).toBe(raw.execPrice);
      expect(fill.ts).toBe(Number(raw.createdTime));
      expect(fill.tradeSide).toBe(raw.tradeSide.startsWith('open') ? 'open' : 'close');
      expect(fill.maker).toBe(raw.tradeScope === 'maker');
      expect(fill.fee).toBe(raw.feeDetail[0]?.fee);
      expect(fill.feeCoin).toBe('USDT');
      expect(fill.execPnl).toBe(raw.execPnl);
      expect(fill.leverage).toBeUndefined();
    }
  });

  it('keeps money values as strings', () => {
    const first = normalizeFill(fills[0] as RawFill, classify);
    expect(typeof first.price).toBe('string');
    expect(typeof first.qty).toBe('string');
    expect(typeof first.fee).toBe('string');
  });

  it('parses leverage from the harness clientOid tag and leaves the rest undefined', () => {
    const tagged = { ...(fills[0] as RawFill), clientOid: 'hVoL10xabc123' };
    expect(normalizeFill(tagged, classify).leverage).toBe(10);
    expect(parseLeverageFromClientOid('hRomv2yddvr6')).toBeUndefined();
    expect(parseLeverageFromClientOid('')).toBeUndefined();
    expect(parseLeverageFromClientOid(undefined)).toBeUndefined();
    expect(parseLeverageFromClientOid('hVoL0xabc')).toBeUndefined();
  });

  it('sums fee details in a single coin', () => {
    const base = fills[0] as RawFill;
    const split: RawFill = {
      ...base,
      feeDetail: [
        { feeCoin: 'USDT', fee: '0.1' },
        { feeCoin: 'USDT', fee: '0.2' },
      ],
    };
    expect(normalizeFill(split, classify).fee).toBe('0.3');
  });

  it('throws NormalizeError for mixed fee coins and unknown tradeSide', () => {
    const base = fills[0] as RawFill;
    const mixed: RawFill = {
      ...base,
      feeDetail: [
        { feeCoin: 'USDT', fee: '0.1' },
        { feeCoin: 'BGB', fee: '0.2' },
      ],
    };
    expect(() => normalizeFill(mixed, classify)).toThrow(NormalizeError);
    expect(() => normalizeFill({ ...base, tradeSide: 'reduce_buy' }, classify)).toThrow(NormalizeError);
  });
});

describe('normalizeHistoryPosition on real rows', () => {
  it('maps to ReferencePosition', () => {
    const raw = positions[0] as RawHistoryPosition;
    expect(normalizeHistoryPosition(raw)).toEqual({
      symbol: raw.symbol,
      openTs: Number(raw.createdTime),
      closeTs: Number(raw.updatedTime),
      side: raw.posSide,
      netProfit: raw.netProfit,
    });
  });
});

describe('normalizeFundingRecords on real financial records', () => {
  it('maps the settlement row Bitget Demo writes at each funding time', () => {
    // #given a row shaped like the real CONTRACT_MAIN_SETTLE_FEE_USER_IN rows seen at 00:00 UTC on Demo
    const base = records[0] as RawFinancialRecord;
    const settle: RawFinancialRecord = { ...base, type: 'CONTRACT_MAIN_SETTLE_FEE_USER_IN', amount: '0.00250739' };

    // #when
    const mapped = normalizeFundingRecords([settle]);

    // #then
    expect(mapped).toEqual([{ id: base.id, symbol: base.symbol, ts: Number(base.ts), amount: '0.00250739' }]);
  });

  it('captured records contain only open and close types, so none are funding', () => {
    expect(new Set(records.map((r) => r.type))).not.toContain('FUNDING');
    expect(normalizeFundingRecords(records)).toEqual([]);
  });

  it('recognizes a funding type name and maps the row', () => {
    const base = records[0] as RawFinancialRecord;
    const funding: RawFinancialRecord = { ...base, type: 'FUNDING_FEE', amount: '-0.01' };
    expect(isFundingRecord(funding)).toBe(true);
    expect(normalizeFundingRecords([funding])).toEqual([
      { id: base.id, symbol: base.symbol, ts: Number(base.ts), amount: '-0.01' },
    ]);
  });
});
