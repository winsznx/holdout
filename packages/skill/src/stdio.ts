#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadRulebookFromFile } from './rulebook-file.ts';
import { createHoldoutServer } from './server.ts';
import { createLiveMarketData } from './signals.ts';

const server = createHoldoutServer({
  loadRulebook: () => loadRulebookFromFile(process.env.HOLDOUT_RULEBOOK),
  marketData: createLiveMarketData(),
});

await server.connect(new StdioServerTransport());

process.stdin.on('end', () => process.exit(0));
