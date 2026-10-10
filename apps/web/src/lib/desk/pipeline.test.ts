import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ruleId } from '@holdout/engine';
import { intervalFor, marketProxyUrl, mergeWindows } from './market';
import { analyzeHistory, auditAll, detectAdapter, parseCsvText } from './pipeline';
import { buildDraftRulebook, diffRulebooks } from './rulebook-build';
import { mapStatedRules } from './stated-rules';
import { buildSyncBody, pickForwardHeaders } from './sync';
import type { DeskHistory, DeskSource } from './types';

const SAMPLES = join(__dirname, '../../../public/data/samples');
const sampleFiles = readdirSync(SAMPLES).filter((f) => f.endsWith('.json') && f !== 'index.json');

interface SampleOnDisk {
  meta: { id: string; label: string; kind: DeskSource['kind']; source: string; notes: string[]; statedRules?: string[] };
  fills: DeskHistory['fills'];
  funding: DeskHistory['funding'];
  reference: DeskHistory['reference'];
  fundingSettlements?: DeskHistory['fundingSettlements'];
  dayLevel?: boolean;
  trips?: DeskHistory['trips'];
}

function readSample(file: string): SampleOnDisk {
  return JSON.parse(readFileSync(join(SAMPLES, file), 'utf8')) as SampleOnDisk;
}

describe('analyzeHistory on the published samples', () => {
  it('finds sample files', () => {
    expect(sampleFiles.length).toBeGreaterThan(0);
  });

  for (const file of sampleFiles) {
    it(`${file} analyzes and audits without throwing`, () => {
      const s = readSample(file);
      const history: DeskHistory = { fills: s.fills, funding: s.funding, reference: s.reference, fundingSettlements: s.fundingSettlements, dayLevel: s.dayLevel, trips: s.trips };
      const { base, seed } = analyzeHistory(s.meta.id, history, {});
      expect(base.ledger.roundTrips.length).toBeGreaterThan(0);
      expect(base.ingest.fillsOut).toBeLessThanOrEqual(base.ingest.fillsIn);
      const mapped = mapStatedRules(s.meta.statedRules ?? []);
      const audits = auditAll(seed, mapped.mapped.map((m) => m.rule));
      expect(Object.keys(audits)).toHaveLength(mapped.mapped.length);
      for (const a of Object.values(audits)) {
        if (a.status === 'priced') expect(a.interval).not.toBeNull();
        if (a.status === 'untestable') expect(a.untestableReason).toBeTruthy();
      }
      if (history.dayLevel) expect(base.sessionLens.unavailableReason).toContain('day-level');
    });
  }

  it('is deterministic for the holdout run', () => {
    const file = sampleFiles.find((f) => f.includes('backtest'));
    if (!file) return;
    const s = readSample(file);
    const history: DeskHistory = { fills: s.fills, funding: s.funding, reference: s.reference, dayLevel: s.dayLevel, trips: s.trips };
    const a = analyzeHistory(s.meta.id, history, {}).base.holdout;
    const b = analyzeHistory(s.meta.id, history, {}).base.holdout;
    expect(a?.freeze?.sha256).toBe(b?.freeze?.sha256);
    expect(a?.verdict).toBe(b?.verdict);
  });
});

describe('detectAdapter', () => {
  it('detects the money_boys backtest header', () => {
    expect(detectAdapter('tradeId,symbol,side,entryDate,quantity,exitDate,pnlUsd,feesUsd,entryTokenPrice,exitTokenPrice\n')).toBe('money-boys-backtest');
  });
  it('detects the money_boys paper header', () => {
    expect(detectAdapter('timestamp,symbol,decision,fillPrice,filledQuantity,pnlUsd,orderId\n')).toBe('money-boys-paper');
  });
  it('detects a Bitget style export', () => {
    expect(detectAdapter('Symbol,Side,Price,Qty,Time,Fee\n')).toBe('bitget-export');
  });
  it('returns null for an unknown header', () => {
    expect(detectAdapter('a,b,c\n1,2,3')).toBeNull();
  });
  it('rejects an unknown file with a named error', () => {
    expect(() => parseCsvText('a,b,c\n1,2,3')).toThrow(/No adapter matches/);
  });
});

describe('parseCsvText on a Bitget style export', () => {
  const csv = [
    'Symbol,Side,Price,Qty,Time,Fee,PnL,tradeId',
    'BTCUSDT,open long,100,1,2026-10-01 10:00:00,0.1,,t1',
    'BTCUSDT,close long,110,1,2026-10-01 11:00:00,0.1,10,t2',
    'BTCUSDT,close long,110,1,2026-10-01 11:00:00,0.1,10,t2',
  ].join('\n');

  it('labels the export as untested and reports the duplicate', () => {
    const out = parseCsvText(csv);
    expect(out.report.untestedAgainstLiveExport).toBe(true);
    expect(out.report.fillsIn).toBe(3);
    expect(out.report.duplicatesDropped).toBe(1);
    expect(out.report.products.perp).toBe(2);
  });

  it('builds a ledger with no reference and does not block proposals for that', () => {
    const out = parseCsvText(csv);
    const { base } = analyzeHistory('csv-test', out.history, {});
    expect(base.ledger.roundTrips).toHaveLength(1);
    expect(base.reconciliation.referenceRows).toBe(0);
    expect(base.holdoutBlockedReason).toBeNull();
  });
});

describe('sync helpers', () => {
  it('forwards only the allowed headers', () => {
    const headers = pickForwardHeaders({
      'ACCESS-KEY': 'k',
      'ACCESS-SIGN': 's',
      'ACCESS-TIMESTAMP': '1',
      'ACCESS-PASSPHRASE': 'p',
      'Content-Type': 'application/json',
      locale: 'en-US',
      cookie: 'x',
    });
    expect(Object.keys(headers).sort()).toEqual(['ACCESS-KEY', 'ACCESS-PASSPHRASE', 'ACCESS-SIGN', 'ACCESS-TIMESTAMP']);
  });

  it('builds a body with method, path, query and timestamp only', () => {
    const body = buildSyncBody('https://api.bitget.com/api/v3/trade/fills?category=USDT-FUTURES&limit=100', { 'ACCESS-TIMESTAMP': '99', 'ACCESS-KEY': 'k' });
    expect(body.method).toBe('GET');
    expect(body.path).toBe('/api/v3/trade/fills');
    expect(body.query).toBe('category=USDT-FUTURES&limit=100');
    expect(body.timestamp).toBe('99');
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});

describe('market helpers', () => {
  it('merges close windows per symbol', () => {
    const windows = mergeWindows([
      { symbol: 'A', openTs: 0, closeTs: 1000 },
      { symbol: 'A', openTs: 2000, closeTs: 3000 },
      { symbol: 'A', openTs: 10_000_000, closeTs: 10_001_000 },
      { symbol: 'B', openTs: 0, closeTs: 10 },
    ]);
    expect(windows.filter((w) => w.symbol === 'A')).toEqual([
      { symbol: 'A', from: 0, to: 3000 },
      { symbol: 'A', from: 10_000_000, to: 10_001_000 },
    ]);
    expect(windows.filter((w) => w.symbol === 'B')).toHaveLength(1);
  });

  it('picks 1m inside 90 days and 5m outside', () => {
    const now = 200 * 86_400_000;
    expect(intervalFor(now - 10 * 86_400_000, now)).toBe('1m');
    expect(intervalFor(now - 120 * 86_400_000, now)).toBe('5m');
  });

  it('rewrites a Bitget URL to the market proxy', () => {
    expect(marketProxyUrl('https://api.bitget.com/api/v3/market/candles?symbol=BTCUSDT')).toBe('/api/market/candles?symbol=BTCUSDT');
  });
});

describe('rulebook versions', () => {
  it('diffs added rules and status changes', () => {
    const file = sampleFiles.find((f) => f.startsWith('bot-')) ?? sampleFiles[0];
    if (!file) throw new Error('no sample files');
    const s = readSample(file);
    const history: DeskHistory = { fills: s.fills, funding: s.funding, reference: s.reference, fundingSettlements: s.fundingSettlements };
    const { base, seed } = analyzeHistory(s.meta.id, history, {});
    const mapped = mapStatedRules(s.meta.statedRules ?? []).mapped;
    const analysis = { ...base, audits: auditAll(seed, mapped.map((m) => m.rule)) };
    const source: DeskSource = { id: s.meta.id, label: s.meta.label, kind: s.meta.kind, origin: 'sample', detail: s.meta.source, notes: [], untestedAgainstLiveExport: false, loadedAt: 0 };
    const none = buildDraftRulebook({ source, analysis, rules: [], decisions: {}, version: 1, createdAt: '2026-10-10T00:00:00.000Z' });
    const some = buildDraftRulebook({ source, analysis, rules: mapped, decisions: {}, version: 2, createdAt: '2026-10-10T00:00:00.000Z' });
    const d = diffRulebooks(none, some);
    expect(d.added).toHaveLength(mapped.length);
    expect(d.removed).toHaveLength(0);
    expect(some.rules.every((r) => r.status === 'stated')).toBe(true);
    expect(some.rules.map((r) => r.id)).toEqual(mapped.map((m) => ruleId(m.rule)));
  });
});
