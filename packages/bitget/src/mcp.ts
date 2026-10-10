import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { available, unavailable, type SurfaceId, type SurfaceResult } from './errors.ts';

export const S5_URL = 'https://agent.bitget.com/mcp';
export const S6_URL = 'https://datahub.noxiaohao.com/mcp';

export interface McpToolInfo {
  name: string;
  description: string;
}

export type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class McpSession {
  private client: Client | undefined;

  constructor(
    readonly surface: Extract<SurfaceId, 'S5' | 'S6'>,
    private readonly url: string,
    private readonly fetchImpl?: typeof fetch,
  ) {}

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    const client = new Client({ name: 'holdout', version: '0.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(this.url), { fetch: this.fetchImpl });
    await client.connect(transport);
    this.client = client;
    return client;
  }

  async listTools(): Promise<SurfaceResult<McpToolInfo[]>> {
    try {
      const client = await this.connect();
      const result = await client.listTools();
      return available(
        this.surface,
        result.tools.map((tool) => ({ name: tool.name, description: tool.description ?? '' })),
      );
    } catch (error) {
      return unavailable(this.surface, describeError(error));
    }
  }

  async callJson(name: string, args: JsonObject): Promise<SurfaceResult<unknown>> {
    try {
      const client = await this.connect();
      const result = await client.callTool({ name, arguments: args });
      if (result.isError === true) {
        return unavailable(this.surface, `tool ${name} returned isError: ${firstText(result.content)}`);
      }
      if (isRecord(result.structuredContent)) return available(this.surface, result.structuredContent);
      const text = firstText(result.content);
      try {
        return available(this.surface, JSON.parse(text));
      } catch {
        return unavailable(this.surface, `tool ${name} returned non-JSON text`);
      }
    } catch (error) {
      return unavailable(this.surface, describeError(error));
    }
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    if (client) await client.close();
  }
}

function firstText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  for (const part of content) {
    if (isRecord(part) && part.type === 'text' && typeof part.text === 'string') return part.text;
  }
  return '';
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createS5Session(options: { url?: string; fetchImpl?: typeof fetch } = {}): McpSession {
  return new McpSession('S5', options.url ?? S5_URL, options.fetchImpl);
}

export function createS6Session(options: { url?: string; fetchImpl?: typeof fetch } = {}): McpSession {
  return new McpSession('S6', options.url ?? S6_URL, options.fetchImpl);
}

export interface S5Envelope {
  success: boolean;
  status_code: number | null;
  data: unknown;
  error: string | null;
}

function toS5Envelope(value: unknown): S5Envelope | undefined {
  if (!isRecord(value) || typeof value.success !== 'boolean') return undefined;
  return {
    success: value.success,
    status_code: typeof value.status_code === 'number' ? value.status_code : null,
    data: value.data,
    error: typeof value.error === 'string' ? value.error : null,
  };
}

export async function s5Query(
  session: McpSession,
  entryId: string,
  params: JsonObject,
): Promise<SurfaceResult<JsonObject[]>> {
  const called = await session.callJson('do_query', { entry_id: entryId, params });
  if (!called.available) return called;
  const envelope = toS5Envelope(called.data);
  if (!envelope) return unavailable('S5', `${entryId}: unexpected response shape`);
  if (!envelope.success) {
    const detail = envelope.error ?? JSON.stringify(envelope.data).slice(0, 200);
    return unavailable('S5', `${entryId}: status ${envelope.status_code ?? 'none'} ${detail}`);
  }
  if (envelope.status_code === 204) return available('S5', []);
  if (!isRecord(envelope.data) || !Array.isArray(envelope.data.results)) {
    return unavailable('S5', `${entryId}: missing data.results`);
  }
  return available('S5', envelope.data.results.filter(isRecord));
}

export interface UsStockQuote {
  symbol: string;
  last_price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  prev_close: number;
  change: number;
  change_percent: number;
}

export async function getUsStockQuote(session: McpSession, symbol: string): Promise<SurfaceResult<UsStockQuote>> {
  const result = await s5Query(session, 'equity_price_quote', { symbol });
  if (!result.available) return result;
  const row = result.data[0];
  if (!row) return unavailable('S5', `equity_price_quote: no quote for ${symbol}`);
  return available('S5', row as unknown as UsStockQuote);
}

export interface UsStockKline {
  [field: string]: unknown;
}

export async function getUsStockKlines(
  session: McpSession,
  q: { symbol: string; startTime?: number; endTime?: number },
): Promise<SurfaceResult<UsStockKline[]>> {
  const params: JsonObject = { symbol: q.symbol };
  if (q.startTime !== undefined) params.start_time = q.startTime;
  if (q.endTime !== undefined) params.end_time = q.endTime;
  const result = await s5Query(session, 'equity_price_historical', params);
  if (!result.available) return result;
  if (result.data.length === 0) {
    return unavailable('S5', `equity_price_historical: empty result (HTTP 204) for ${q.symbol}`);
  }
  return available('S5', result.data);
}

export interface EarningsCalendarRow {
  symbol: string;
  period_ending: string;
  fiscal_year: string;
  report_type_name: string;
  perf_briefing_fore_dsclsr_date: string | null;
  perf_brief_dsclsr_date: string | null;
  perf_report_dsclsr_date: string | null;
  perf_report_fore_dsclsr_date: string | null;
  is_trading_time: string;
  time: number;
}

export async function getEarningsCalendar(
  session: McpSession,
  q: { symbol: string; startDate?: string; endDate?: string; fiscalYear?: number },
): Promise<SurfaceResult<EarningsCalendarRow[]>> {
  const params: JsonObject = { symbol: q.symbol };
  if (q.startDate !== undefined) params.start_date = q.startDate;
  if (q.endDate !== undefined) params.end_date = q.endDate;
  if (q.fiscalYear !== undefined) params.fiscal_year = q.fiscalYear;
  const result = await s5Query(session, 'equity_calendar', params);
  if (!result.available) return result;
  return available('S5', result.data as unknown as EarningsCalendarRow[]);
}

export type FundamentalsKind = 'profile' | 'ratios' | 'metrics';

const FUNDAMENTALS_ENTRY: Record<FundamentalsKind, string> = {
  profile: 'equity_profile',
  ratios: 'equity_fundamental_ratios',
  metrics: 'equity_fundamental_metrics',
};

export async function getFundamentals(
  session: McpSession,
  q: { symbol: string; kind: FundamentalsKind; limit?: number },
): Promise<SurfaceResult<JsonObject[]>> {
  const params: JsonObject = { symbol: q.symbol };
  if (q.kind !== 'profile' && q.limit !== undefined) params.limit = q.limit;
  return s5Query(session, FUNDAMENTALS_ENTRY[q.kind], params);
}

export interface TechnicalSnapshot {
  symbol: string;
  timeframe: string;
  [indicator: string]: unknown;
}

export async function getTechnicalSignal(
  session: McpSession,
  q: { symbol: string; timeframe?: string },
): Promise<SurfaceResult<TechnicalSnapshot>> {
  const called = await session.callJson('technical_analysis', {
    action: 'full_analysis',
    symbol: q.symbol,
    timeframe: q.timeframe ?? '4h',
  });
  if (!called.available) return called;
  return toS6Payload<TechnicalSnapshot>('technical_analysis', called.data);
}

export async function getFearGreed(session: McpSession): Promise<SurfaceResult<JsonObject>> {
  const called = await session.callJson('sentiment_index', { action: 'current' });
  if (!called.available) return called;
  return toS6Payload<JsonObject>('sentiment_index', called.data);
}

export async function getDerivativesSentiment(
  session: McpSession,
  q: { action: 'long_short' | 'top_ls' | 'taker_ratio' | 'open_interest'; symbol: string; period?: string },
): Promise<SurfaceResult<JsonObject>> {
  const called = await session.callJson('derivatives_sentiment', {
    action: q.action,
    symbol: q.symbol,
    period: q.period ?? '4h',
  });
  if (!called.available) return called;
  return toS6Payload<JsonObject>('derivatives_sentiment', called.data);
}

function toS6Payload<T extends JsonObject>(tool: string, data: unknown): SurfaceResult<T> {
  if (!isRecord(data)) return unavailable('S6', `${tool}: unexpected response shape`);
  const keys = Object.keys(data);
  const errorKey = keys.find((key) => key === 'error' || key.endsWith('_error'));
  if (errorKey !== undefined && keys.length === 1) {
    const detail = String(data[errorKey]);
    return unavailable('S6', `${tool}: upstream ${errorKey}${detail ? ` ${detail}` : ' (empty message)'}`);
  }
  return available('S6', data as T);
}

export interface SignalTags {
  technical: SurfaceResult<TechnicalSnapshot>;
  fearGreed: SurfaceResult<JsonObject>;
  longShort: SurfaceResult<JsonObject>;
}

export async function getSignalTags(
  session: McpSession,
  q: { pair: string; futuresSymbol: string; timeframe?: string },
): Promise<SignalTags> {
  const [technical, fearGreed, longShort] = await Promise.all([
    getTechnicalSignal(session, { symbol: q.pair, timeframe: q.timeframe }),
    getFearGreed(session),
    getDerivativesSentiment(session, { action: 'long_short', symbol: q.futuresSymbol, period: q.timeframe }),
  ]);
  return { technical, fearGreed, longShort };
}
