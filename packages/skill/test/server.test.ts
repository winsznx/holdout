import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { handleMcpRequest } from '../src/http.ts';
import { loadRulebookFromFile } from '../src/rulebook-file.ts';
import { parseRulebookText } from '../src/rulebook-load.ts';
import { checkTradeInput, createHoldoutServer, explainRuleInput } from '../src/server.ts';
import type { MarketData } from '../src/signals.ts';
import { DOWN_SIGNALS, WEDNESDAY_REGULAR_SESSION, fakeMarketData, testFixtureRulebook } from './fixtures.ts';

const book = testFixtureRulebook();
const bookText = JSON.stringify(book);

async function connect(marketData: MarketData, loadText: string | null = bookText): Promise<Client> {
  const server = createHoldoutServer({
    loadRulebook: async () =>
      loadText === null ? { ok: false, error: 'No rulebook is configured.' } : parseRulebookText(loadText, 'test'),
    marketData,
    now: () => WEDNESDAY_REGULAR_SESSION,
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientSide);
  return client;
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content.map((c) => c.text ?? '').join('\n');
}

const NVDA_IDEA = { symbol: 'NVDAUSDT', side: 'long', leverage: 20, product: 'stock_perp', time: WEDNESDAY_REGULAR_SESSION };

describe('tool schemas', () => {
  const checkSchema = z.object(checkTradeInput);

  it('accepts a minimal valid check_trade input', () => {
    expect(checkSchema.safeParse({ symbol: 'NVDAUSDT', side: 'long', leverage: 20 }).success).toBe(true);
  });

  it('rejects bad side, leverage and product', () => {
    expect(checkSchema.safeParse({ symbol: 'NVDAUSDT', side: 'buy', leverage: 20 }).success).toBe(false);
    expect(checkSchema.safeParse({ symbol: 'NVDAUSDT', side: 'long', leverage: -1 }).success).toBe(false);
    expect(checkSchema.safeParse({ symbol: 'NVDAUSDT', side: 'long', leverage: 5, product: 'futures' }).success).toBe(false);
    expect(checkSchema.safeParse({ side: 'long', leverage: 5 }).success).toBe(false);
  });

  it('requires a ruleId for explain_rule', () => {
    expect(z.object(explainRuleInput).safeParse({}).success).toBe(false);
  });

  it('lists exactly three read-only tools', async () => {
    const client = await connect(fakeMarketData());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['check_trade', 'explain_rule', 'get_rulebook']);
    for (const tool of tools) expect(tool.annotations?.readOnlyHint).toBe(true);
  });
});

describe('get_rulebook', () => {
  it('returns the verified rulebook', async () => {
    const client = await connect(fakeMarketData());
    const result = await client.callTool({ name: 'get_rulebook', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { sha256: string }).sha256).toBe(book.sha256);
  });

  it('rejects a tampered rulebook by naming the hash check', async () => {
    const tampered = JSON.stringify({ ...book, label: 'edited by hand' });
    const client = await connect(fakeMarketData(), tampered);
    const result = await client.callTool({ name: 'get_rulebook', arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('sha256 verification');
  });

  it('reports a missing rulebook', async () => {
    const client = await connect(fakeMarketData(), null);
    const result = await client.callTool({ name: 'get_rulebook', arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('No rulebook');
  });
});

describe('rulebook loading', () => {
  it('rejects tampered rule content', () => {
    const first = book.rules[0];
    if (!first) throw new Error('fixture has no rules');
    const tampered = { ...book, rules: [{ ...first, rule: { t: 'max_leverage', x: 100 } }, ...book.rules.slice(1)] };
    const loaded = parseRulebookText(JSON.stringify(tampered), 'test');
    expect(loaded.ok).toBe(false);
  });

  it('rejects non-JSON and wrong schema', () => {
    expect(parseRulebookText('not json', 'test').ok).toBe(false);
    expect(parseRulebookText('{"schema":"other"}', 'test').ok).toBe(false);
  });

  it('names the env var when the path is unset or unreadable', async () => {
    const unset = await loadRulebookFromFile(undefined);
    expect(unset.ok === false && unset.error).toContain('HOLDOUT_RULEBOOK');
    const missing = await loadRulebookFromFile('/nonexistent/holdout-rulebook.json');
    expect(missing.ok).toBe(false);
  });
});

describe('check_trade', () => {
  it('flags broken rules and renders the card from engine output', async () => {
    const client = await connect(fakeMarketData());
    const result = await client.callTool({ name: 'check_trade', arguments: NVDA_IDEA });
    expect(result.isError).toBeFalsy();
    const card = result.structuredContent as {
      broken: number;
      sessionNow: string;
      rules: Array<{ state: string; rendered: string }>;
      similar: { found: boolean; n: number };
      earnings: { state: string; nextReportDate: string };
    };
    expect(card.sessionNow).toBe('regular');
    expect(card.rules.filter((r) => r.state === 'broken')).toHaveLength(2);
    expect(card.broken).toBe(2);
    expect(card.similar).toMatchObject({ found: true, n: 4 });
    expect(card.earnings).toMatchObject({ state: 'available', nextReportDate: '2026-10-15' });
    const text = textOf(result);
    expect(text).toContain('Rules broken: 2 of 3');
    expect(text).toContain('Holdout does not place orders');
  });

  it('names S5 when the earnings calendar is unavailable', async () => {
    const client = await connect(
      fakeMarketData({ getEarnings: async () => ({ available: false, surface: 'S5', reason: 'HTTP 500' }) }),
    );
    const result = await client.callTool({ name: 'check_trade', arguments: NVDA_IDEA });
    const text = textOf(result);
    expect(text).toContain('earnings calendar unavailable (S5)');
    const card = result.structuredContent as { rules: Array<{ ruleId: string; state: string; reason: string }> };
    const earningsRule = card.rules.find((r) => r.reason === 'earnings calendar unavailable (S5)');
    expect(earningsRule?.state).toBe('not_checkable');
  });

  it('names S6 when no signal is available', async () => {
    const client = await connect(fakeMarketData({ getSignals: async () => DOWN_SIGNALS }));
    const result = await client.callTool({ name: 'check_trade', arguments: NVDA_IDEA });
    expect(textOf(result)).toContain('signal unavailable (S6)');
    expect((result.structuredContent as { signal: { state: string } }).signal.state).toBe('unavailable');
  });

  it('uses optional context for the cooldown rule', async () => {
    const client = await connect(fakeMarketData());
    const result = await client.callTool({
      name: 'check_trade',
      arguments: { ...NVDA_IDEA, lastLossClosedTs: WEDNESDAY_REGULAR_SESSION - 10 * 60_000 },
    });
    const card = result.structuredContent as { rules: Array<{ rendered: string; state: string }> };
    const cooldown = card.rules.find((r) => r.rendered.toLowerCase().includes('minute'));
    expect(cooldown?.state).toBe('broken');
  });

  it('skips S5 for a perp and does not call it', async () => {
    let calls = 0;
    const client = await connect(
      fakeMarketData({
        getEarnings: async () => {
          calls += 1;
          return { available: false, surface: 'S5', reason: 'should not be called' };
        },
      }),
    );
    const result = await client.callTool({
      name: 'check_trade',
      arguments: { symbol: 'BTCUSDT', side: 'long', leverage: 3, product: 'perp', time: WEDNESDAY_REGULAR_SESSION },
    });
    expect(calls).toBe(0);
    expect((result.structuredContent as { earnings: { state: string } }).earnings.state).toBe('not_applicable');
  });

  it('fails clearly without a rulebook and on a bad time', async () => {
    const none = await connect(fakeMarketData(), null);
    expect((await none.callTool({ name: 'check_trade', arguments: NVDA_IDEA })).isError).toBe(true);
    const client = await connect(fakeMarketData());
    const bad = await client.callTool({ name: 'check_trade', arguments: { ...NVDA_IDEA, time: 'soon' } });
    expect(bad.isError).toBe(true);
  });
});

describe('explain_rule', () => {
  it('returns holdout evidence for a proposed rule', async () => {
    const proposed = book.rules.find((r) => r.status === 'proposed');
    if (!proposed) throw new Error('fixture has no proposed rule');
    const client = await connect(fakeMarketData());
    const result = await client.callTool({ name: 'explain_rule', arguments: { ruleId: proposed.id } });
    expect(result.isError).toBeFalsy();
    const card = result.structuredContent as { holdout: { p: number; nTest: number; freezeSha256: string } };
    expect(card.holdout).toMatchObject({ p: 0.03, nTest: 18, freezeSha256: 'f'.repeat(64) });
  });

  it('returns stated rule audit', async () => {
    const stated = book.rules[0];
    if (!stated) throw new Error('fixture has no rules');
    const client = await connect(fakeMarketData());
    const result = await client.callTool({ name: 'explain_rule', arguments: { ruleId: stated.id } });
    expect((result.structuredContent as { statedRuleAudit: { breaks: number } }).statedRuleAudit.breaks).toBe(3);
  });

  it('returns a not-found error', async () => {
    const client = await connect(fakeMarketData());
    const result = await client.callTool({ name: 'explain_rule', arguments: { ruleId: 'r_missing' } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('not in this rulebook');
  });
});

describe('http handler', () => {
  const rpc = (method: string, params: unknown, headers: Record<string, string> = {}): Request =>
    new Request('https://holdout.example/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });

  it('lists tools statelessly', async () => {
    const response = await handleMcpRequest(rpc('tools/list', {}), {}, { marketData: fakeMarketData() });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools).toHaveLength(3);
  });

  it('loads and verifies the rulebook from the header URL', async () => {
    let requested = '';
    const fetchImpl: typeof fetch = async (input) => {
      requested = String(input);
      return new Response(bookText, { status: 200 });
    };
    const response = await handleMcpRequest(
      rpc('tools/call', { name: 'get_rulebook', arguments: {} }, { 'x-holdout-rulebook-url': 'https://files.example/rb.json' }),
      {},
      { marketData: fakeMarketData(), fetchImpl },
    );
    const body = (await response.json()) as { result: { isError?: boolean; structuredContent: { sha256: string } } };
    expect(requested).toBe('https://files.example/rb.json');
    expect(body.result.structuredContent.sha256).toBe(book.sha256);
  });

  it('rejects a tampered rulebook and non-https URLs', async () => {
    const tamperedFetch: typeof fetch = async () => new Response(JSON.stringify({ ...book, version: 9 }), { status: 200 });
    const tampered = await handleMcpRequest(
      rpc('tools/call', { name: 'get_rulebook', arguments: {} }, { 'x-holdout-rulebook-url': 'https://files.example/rb.json' }),
      {},
      { marketData: fakeMarketData(), fetchImpl: tamperedFetch },
    );
    expect(((await tampered.json()) as { result: { isError: boolean } }).result.isError).toBe(true);

    const insecure = await handleMcpRequest(
      rpc('tools/call', { name: 'get_rulebook', arguments: {} }, { 'x-holdout-rulebook-url': 'http://files.example/rb.json' }),
      {},
      { marketData: fakeMarketData() },
    );
    expect(((await insecure.json()) as { result: { isError: boolean } }).result.isError).toBe(true);
  });

  it('reads the rulebook from env JSON when no header is sent', async () => {
    const response = await handleMcpRequest(
      rpc('tools/call', { name: 'get_rulebook', arguments: {} }),
      { HOLDOUT_RULEBOOK_JSON: bookText },
      { marketData: fakeMarketData() },
    );
    const body = (await response.json()) as { result: { structuredContent: { sha256: string } } };
    expect(body.result.structuredContent.sha256).toBe(book.sha256);
  });
});

describe('package hygiene', () => {
  const root = join(import.meta.dirname, '..');
  const sourceFiles = readdirSync(join(root, 'src')).map((f) => join(root, 'src', f));

  it('has no order-placing code path', () => {
    const forbidden = [
      /place-?order/i,
      /batch-?place/i,
      /cancel-?order/i,
      /modify-?order/i,
      /close-?position/i,
      /\/trade\/(place|cancel|modify|close)/i,
      /\bsignRequest\b/,
      /\bbuildSignedHeaders\b/,
      /\bcredentialsFromEnv\b/,
      /\.\/private\.ts|bitget\/src\/private/,
    ];
    for (const file of sourceFiles) {
      const text = readFileSync(file, 'utf8');
      for (const pattern of forbidden) expect(text, `${file} matches ${pattern}`).not.toMatch(pattern);
    }
  });

  it('uses no em dashes in source or docs', () => {
    const files = [...sourceFiles, join(root, 'SKILL.md'), join(root, 'README.md')];
    for (const file of files) expect(readFileSync(file, 'utf8'), file).not.toContain('—');
  });
});
