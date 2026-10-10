import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rulebookDir = resolve(packageRoot, '../../apps/web/public/data/rulebooks');

interface RulebookShape {
  rules: Array<{ id: string }>;
  buckets: Array<{ symbol: string; product: string; side: string }>;
}

function findRulebook(): string | undefined {
  if (!existsSync(rulebookDir)) return undefined;
  const first = readdirSync(rulebookDir)
    .filter((f) => f.endsWith('.json'))
    .sort()[0];
  return first ? join(rulebookDir, first) : undefined;
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content.map((c) => c.text ?? '').join('\n');
}

const rulebookPath = findRulebook();
if (rulebookPath === undefined) {
  console.log(`smoke skipped: no rulebook JSON found in ${rulebookDir}`);
  process.exit(0);
}

const shape = JSON.parse(readFileSync(rulebookPath, 'utf8')) as RulebookShape;
const bucket = shape.buckets[0];
const rule = shape.rules[0];

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['--import', 'tsx', join(packageRoot, 'src/stdio.ts')],
  cwd: packageRoot,
  env: { ...getDefaultEnvironment(), HOLDOUT_RULEBOOK: rulebookPath },
});
const client = new Client({ name: 'holdout-smoke', version: '0.0.0' });
await client.connect(transport);

try {
  const tools = await client.listTools();
  console.log(`tools: ${tools.tools.map((t) => t.name).join(', ')}\n`);

  const book = await client.callTool({ name: 'get_rulebook', arguments: {} });
  console.log(`get_rulebook: ${book.isError ? 'ERROR' : 'ok'} (${textOf(book).length} bytes)\n`);

  const check = await client.callTool({
    name: 'check_trade',
    arguments: {
      symbol: bucket?.symbol ?? 'NVDAUSDT',
      side: bucket?.side === 'short' ? 'short' : 'long',
      leverage: 10,
      product: bucket?.product ?? 'stock_perp',
    },
  });
  console.log(textOf(check), '\n');

  if (rule) {
    const explained = await client.callTool({ name: 'explain_rule', arguments: { ruleId: rule.id } });
    console.log(textOf(explained));
  }
} finally {
  await client.close();
}
