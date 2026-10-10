import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { runCheckTrade, renderTradeCard } from './check.ts';
import { explainRule, renderRuleCard } from './explain.ts';
import type { RulebookLoad } from './rulebook-load.ts';
import type { MarketData } from './signals.ts';

export interface HoldoutDeps {
  loadRulebook: () => Promise<RulebookLoad>;
  marketData: MarketData;
  now?: () => number;
}

export const SERVER_INFO = { name: 'holdout', version: '0.0.0' } as const;

const TIME_INPUT = z.union([z.number().int().positive(), z.string().min(1)]);

export const checkTradeInput = {
  symbol: z.string().min(1).describe('Bitget symbol, for example NVDAUSDT'),
  side: z.enum(['long', 'short']),
  leverage: z.number().positive().max(1000),
  product: z.enum(['perp', 'stock_perp', 'rtoken', 'stock_plus', 'spot']).optional(),
  time: TIME_INPUT.optional().describe('Epoch milliseconds or an ISO timestamp. Defaults to now.'),
  lastLossClosedTs: z.number().int().positive().optional().describe('Epoch ms when the last losing trade closed'),
  dayRealizedUsdt: z.number().optional().describe("Today's realized P&L in USDT"),
  openPositionAdverse: z.boolean().optional().describe('True when you hold a losing position in this symbol'),
};

export const explainRuleInput = {
  ruleId: z.string().min(1).describe('Rule id from get_rulebook, for example r_1a2b3c4d5e'),
};

function failure(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function parseTime(value: string | number | undefined, now: () => number): { ok: true; time: number } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, time: now() };
  const time = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(time)) return { ok: false, error: `time ${String(value)} is not epoch milliseconds or an ISO timestamp` };
  return { ok: true, time };
}

export function createHoldoutServer(deps: HoldoutDeps): McpServer {
  const now = deps.now ?? Date.now;
  const server = new McpServer(SERVER_INFO);
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;

  server.registerTool(
    'get_rulebook',
    {
      title: 'Get rulebook',
      description: 'Return the trader rulebook JSON after verifying its sha256. Read-only.',
      annotations: { ...readOnly, openWorldHint: false },
    },
    async (): Promise<CallToolResult> => {
      const loaded = await deps.loadRulebook();
      if (!loaded.ok) return failure(loaded.error);
      return {
        content: [{ type: 'text', text: JSON.stringify(loaded.book, null, 2) }],
        structuredContent: { ...loaded.book },
      };
    },
  );

  server.registerTool(
    'check_trade',
    {
      title: 'Check a trade idea',
      description:
        'Check a trade idea against the trader rulebook with live S5 earnings and S6 signal context. Returns one card. Read-only. Never places or previews orders. Show the card to the human and wait for their decision.',
      inputSchema: checkTradeInput,
      annotations: { ...readOnly, openWorldHint: true },
    },
    async (args): Promise<CallToolResult> => {
      const loaded = await deps.loadRulebook();
      if (!loaded.ok) return failure(loaded.error);
      const time = parseTime(args.time, now);
      if (!time.ok) return failure(time.error);
      const card = await runCheckTrade(loaded.book, { ...args, time: time.time }, deps.marketData, now);
      return { content: [{ type: 'text', text: renderTradeCard(card) }], structuredContent: { ...card } };
    },
  );

  server.registerTool(
    'explain_rule',
    {
      title: 'Explain a rule',
      description: 'Return the evidence recorded for one rule in the rulebook. Read-only.',
      inputSchema: explainRuleInput,
      annotations: { ...readOnly, openWorldHint: false },
    },
    async ({ ruleId }): Promise<CallToolResult> => {
      const loaded = await deps.loadRulebook();
      if (!loaded.ok) return failure(loaded.error);
      const result = explainRule(loaded.book, ruleId);
      if (!result.ok) return failure(result.error);
      return { content: [{ type: 'text', text: renderRuleCard(result.card) }], structuredContent: { ...result.card } };
    },
  );

  return server;
}
