import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  PublicClient,
  PrivateClient,
  buildProductClassifier,
  credentialsAuthorizer,
  credentialsFromEnv,
  fetchFillsRange,
  fetchFinancialRecordsRange,
  fetchFundingRateHistory,
  fetchHistoryPositionsRange,
  normalizeFills,
  normalizeFundingRecords,
  normalizeHistoryPosition,
} from '../packages/bitget/src/index.ts';
import { parseMoneyBoysBacktest, parseMoneyBoysPaper, referenceFromTrips } from '../packages/engine/src/index.ts';
import { ledgerOf, type History } from './lib/history.ts';

const BOTS = [
  { id: 'R', symbol: 'BTCUSDT', leak: 'revenge re-entry after a loss', rules: ['cooldown after a loss', 'no add to a loser', 'max 10x leverage', 'no new stock-perp risk overnight or weekend'] },
  { id: 'A', symbol: 'ETHUSDT', leak: 'adds to a losing position', rules: [] },
  { id: 'V', symbol: 'SOLUSDT', leak: 'leverage creep after wins', rules: [] },
  { id: 'S', symbol: 'NVDAUSDT', leak: 'opens stock-perp positions overnight and on the weekend', rules: [] },
  { id: 'C', symbol: 'DOGEUSDT', leak: 'none (disciplined control)', rules: [] },
] as const;

const STATED_RULES = ['cooldown 3 minutes after a loss', 'never add to a loser', 'max 10x leverage', 'no new stock-perp risk overnight or weekend'];
const START = Date.parse(process.env.HISTORY_START ?? '2026-10-10T22:05:00Z');
const OUT_DIRS = ['evidence/raw/histories', 'apps/web/public/data/samples'];

function write(history: History): void {
  for (const dir of OUT_DIRS) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${history.meta.id}.json`, JSON.stringify(history));
  }
  console.log(`wrote ${history.meta.id}: ${history.fills.length} fills`);
}

async function exportBots(): Promise<History[]> {
  const creds = credentialsFromEnv(process.env, 'BITGET_DEMO');
  const priv = new PrivateClient({ authorize: credentialsAuthorizer(creds, { paper: true }) });
  const pub = new PublicClient();
  const now = Date.now();
  const range = { startTime: START, endTime: now };
  const instruments = await pub.getInstruments('USDT-FUTURES');
  const classify = buildProductClassifier(instruments);
  const rawFills = await fetchFillsRange(priv, { category: 'USDT-FUTURES', range });
  const rawPositions = await fetchHistoryPositionsRange(priv, { category: 'USDT-FUTURES', range });
  const rawFinancial = await fetchFinancialRecordsRange(priv, { category: 'USDT-FUTURES', range });
  const histories: History[] = [];
  for (const bot of BOTS) {
    const ownFills = rawFills.filter((f) => f.symbol === bot.symbol && (f.clientOid ?? '').startsWith(`h${bot.id}`));
    const orderIds = new Set(ownFills.map((f) => f.orderId));
    const fills = normalizeFills(ownFills.filter((f) => orderIds.has(f.orderId)), classify);
    const lastTs = Math.max(...fills.map((f) => f.ts), START);
    const settlementsRaw = await fetchFundingRateHistory(pub, { category: 'USDT-FUTURES', symbol: bot.symbol, sinceTs: START });
    const settlements = settlementsRaw.map((p) => Number(p.fundingRateTimestamp)).filter((t) => t >= START && t <= lastTs);
    const funding = normalizeFundingRecords(rawFinancial.filter((r) => r.symbol === bot.symbol));
    const reference = rawPositions.filter((p) => p.symbol === bot.symbol).map(normalizeHistoryPosition);
    histories.push({
      meta: {
        id: `bot-${bot.id}`,
        label: `Bitget Demo bot ${bot.id}`,
        kind: 'bot',
        source: `Fills read back from the Bitget Demo API (UTA v3) for ${bot.symbol}`,
        notes: [
          'Bitget Demo bot. Real fills on Bitget Demo, not a human trader.',
          `Planted habit: ${bot.leak}.`,
          'Leverage is read from the bot client order id, because Bitget fill history does not include leverage.',
        ],
        exportedAt: new Date(now).toISOString(),
        statedRules: STATED_RULES,
        plantedLeak: bot.leak,
      },
      fills,
      funding,
      reference,
      fundingSettlements: { [bot.symbol]: settlements },
    });
  }
  return histories;
}

function exportStrategySamples(): History[] {
  const stamp = new Date().toISOString();
  const backtest = parseMoneyBoysBacktest(readFileSync('internal/money_boys_89d_trades.csv', 'utf8'));
  const paper = parseMoneyBoysPaper(readFileSync('internal/money_boys_paper_trades.csv', 'utf8'));
  const label = "Strategy sample: a friend's trading agent (backtest and paper ledger), not live fills.";
  return [
    {
      meta: {
        id: 'strategy-backtest',
        label: "Strategy sample: a friend's agent, 89-day backtest",
        kind: 'strategy-sample',
        source: 'internal/money_boys_89d_trades.csv',
        notes: [label, 'Daily dates only, so intraday, session, hard stop and leverage rules show not in this data.', `${backtest.issues.length} malformed rows skipped.`],
        exportedAt: stamp,
      },
      fills: backtest.fills,
      funding: [],
      reference: backtest.reference,
      dayLevel: true,
      trips: backtest.roundTrips,
    },
    {
      meta: {
        id: 'strategy-paper',
        label: "Strategy sample: a friend's agent, paper ledger",
        kind: 'strategy-sample',
        source: 'internal/money_boys_paper_trades.csv',
        notes: [
          label,
          `${paper.roundTrips.length} filled decisions. The file has no fees column, so fees are recorded as zero.`,
          `${paper.issues.length} malformed rows skipped (a comma inside a text field shifted the columns).`,
          'The paper ledger has no losing fills, so the audit has nothing to price.',
        ],
        exportedAt: stamp,
      },
      fills: paper.fills,
      funding: [],
      reference: referenceFromTrips(paper.roundTrips),
      dayLevel: true,
      trips: paper.roundTrips,
    },
  ];
}

const target = process.argv[2] ?? 'all';
const list: History[] = [];
if (target === 'all' || target === 'samples') list.push(...exportStrategySamples());
if (target === 'all' || target === 'bots') list.push(...(await exportBots()));
for (const h of list) write(h);

if (target === 'all') {
  const botR = list.find((h) => h.meta.id === 'bot-R');
  const botRTrips = botR ? ledgerOf(botR).roundTrips.length : 0;
  const defaultId = botR && botRTrips >= 30 ? 'bot-R' : 'strategy-backtest';
  const index = {
    default: defaultId,
    samples: list.map((h) => ({ id: h.meta.id, label: h.meta.label, kind: h.meta.kind, fills: h.fills.length, roundTrips: ledgerOf(h).roundTrips.length })),
  };
  mkdirSync('apps/web/public/data/samples', { recursive: true });
  writeFileSync('apps/web/public/data/samples/index.json', JSON.stringify(index));
  const chosen = list.find((h) => h.meta.id === defaultId);
  if (chosen) writeFileSync('apps/web/public/data/samples/default.json', JSON.stringify(chosen));
  console.log(`default sample: ${defaultId} (bot-R closed round trips: ${botRTrips})`);
}
