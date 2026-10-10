import { describe, expect, it } from 'vitest';
import { McpSession, getEarningsCalendar, getUsStockKlines, getUsStockQuote, getTechnicalSignal, getFearGreed } from '../src/mcp.ts';
import { available, unavailable } from '../src/errors.ts';
import type { JsonObject } from '../src/mcp.ts';
import { fixture } from './helpers.ts';

interface ToolResult {
  structuredContent: unknown;
}

class FakeSession extends McpSession {
  constructor(
    surface: 'S5' | 'S6',
    private readonly responder: (name: string, args: JsonObject) => unknown,
  ) {
    super(surface, 'http://invalid.test');
  }

  override async callJson(name: string, args: JsonObject) {
    return available(this.surface, this.responder(name, args));
  }
}

const quote = fixture<ToolResult>('s5-equity-price-quote').structuredContent;
const calendar = fixture<ToolResult>('s5-equity-calendar-range').structuredContent;
const historical = fixture<ToolResult>('s5-equity-price-historical').structuredContent;
const technical = fixture<{ content: { text: string }[] }>('s6-technical-analysis');
const sentimentError = fixture<{ content: { text: string }[] }>('s6-sentiment-index');

describe('S5 wrappers on real responses', () => {
  const s5 = new FakeSession('S5', (name, args) => {
    if (args.entry_id === 'equity_price_quote') return quote;
    if (args.entry_id === 'equity_calendar') return calendar;
    if (args.entry_id === 'equity_price_historical') return historical;
    return { success: false, status_code: 404, data: null, error: `${name} unknown` };
  });

  it('returns the NVDA quote', async () => {
    const result = await getUsStockQuote(s5, 'NVDA');
    expect(result.available).toBe(true);
    if (result.available) expect(result.data.symbol).toBe('NVDA');
  });

  it('returns earnings rows with report dates', async () => {
    const result = await getEarningsCalendar(s5, { symbol: 'NVDA', startDate: '2020-01-01', endDate: '2030-12-31' });
    expect(result.available).toBe(true);
    if (result.available) expect(result.data.length).toBeGreaterThan(10);
  });

  it('reports empty K-lines (HTTP 204) as unavailable on S5 instead of falling back', async () => {
    const result = await getUsStockKlines(s5, { symbol: 'NVDA' });
    expect(result).toEqual({
      available: false,
      surface: 'S5',
      reason: 'equity_price_historical: empty result (HTTP 204) for NVDA',
    });
  });
});

describe('S6 wrappers on real responses', () => {
  const textOf = (fx: { content: { text: string }[] }): unknown => JSON.parse(fx.content[0]?.text ?? 'null');
  const s6 = new FakeSession('S6', (name) => (name === 'technical_analysis' ? textOf(technical) : textOf(sentimentError)));

  it('parses a working technical_analysis payload', async () => {
    const result = await getTechnicalSignal(s6, { symbol: 'BTC/USDT' });
    expect(result.available).toBe(true);
    if (result.available) expect(result.data.symbol).toBe('BTC/USDT');
  });

  it('turns an upstream empty error payload into an S6 unavailable result', async () => {
    const result = await getFearGreed(s6);
    expect(result.available).toBe(false);
    expect(result).toMatchObject({ surface: 'S6' });
  });
});

describe('result helpers', () => {
  it('build tagged results', () => {
    expect(unavailable('S6', 'x')).toEqual({ available: false, surface: 'S6', reason: 'x' });
  });
});
