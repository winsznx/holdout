import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import {
  renderRule,
  stageSelect,
} from '../packages/engine/src/index.ts';
import { headCommit, isCommitted } from './lib/git.ts';
import { loadHistories, loadMarket, prepare } from './lib/pipeline.ts';
import { FREEZE_DIR, computeAll, readFreezeFile, type FreezeLoader } from './lib/compute.ts';
import type { History } from './lib/history.ts';

const PREREG = 'evidence/PREREG.md';
const stage = process.argv[2] ?? 'help';

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function tradedHistories(): History[] {
  return loadHistories().filter((h) => !h.meta.id.startsWith('planted-'));
}

function selectStageRun(): void {
  if (!isCommitted(PREREG)) throw new Error(`${PREREG} must be committed before any evaluation runs`);
  mkdirSync(FREEZE_DIR, { recursive: true });
  const market = loadMarket();
  const commit = headCommit();
  const timestamp = new Date().toISOString();
  for (const history of tradedHistories()) {
    const base = prepare(history, market);
    const id = history.meta.id;
    if (base.blocked) {
      console.log(`${id}: proposals blocked, ${base.blocked}`);
      continue;
    }
    const staged = stageSelect(id, base.ledger.roundTrips, base.ctx, commit, timestamp);
    if (!staged.freeze) {
      console.log(`${id}: no freeze (${staged.insufficient ?? 'no candidate qualified'})`);
      continue;
    }
    writeFileSync(`${FREEZE_DIR}/${id}.json`, JSON.stringify(staged.freeze, null, 2) + '\n');
    console.log(`${id}: froze ${renderRule(staged.freeze.rule)} (${staged.freeze.sha256.slice(0, 12)})`);
  }
  console.log('Freeze files written. Commit evidence/freeze before running the test stage.');
}

function testStageRun(): void {
  if (!isCommitted(PREREG)) throw new Error(`${PREREG} must be committed before any evaluation runs`);
  const market = loadMarket();
  const histories = tradedHistories();
  const guarded: FreezeLoader = (id) => {
    const path = `${FREEZE_DIR}/${id}.json`;
    if (!existsSync(path)) throw new Error(`${id}: selection produced a rule but ${path} does not exist. Run the select stage first.`);
    if (!isCommitted(path)) throw new Error(`${id}: ${path} is not committed. Refusing to run the test step.`);
    return readFreezeFile(id);
  };
  const { cohorts, results, campaign: extras } = computeAll(histories, market, guarded);
  for (const r of results) console.log(`${r.id}: ${r.outcome.verdict} (${r.outcome.reason})`);

  const runId = `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const dir = `evidence/runs/${runId}`;
  mkdirSync(dir, { recursive: true });
  const dataHashes: Record<string, string> = {};
  for (const f of readdirSync('evidence/raw/histories').filter((n) => n.endsWith('.json'))) dataHashes[`histories/${f}`] = sha256File(`evidence/raw/histories/${f}`);
  for (const f of readdirSync('evidence/raw/harness').filter((n) => n.endsWith('.jsonl'))) dataHashes[`harness/${f}`] = sha256File(`evidence/raw/harness/${f}`);
  if (existsSync('evidence/raw/market')) for (const f of readdirSync('evidence/raw/market')) dataHashes[`market/${f}`] = sha256File(`evidence/raw/market/${f}`);
  const manifest = {
    runId,
    commit: headCommit(),
    node: process.version,
    pnpm: process.env.npm_config_user_agent ?? 'unknown',
    preregSha256: sha256File(PREREG),
    dataHashes,
    seeds: 'audit: sha256(holdout-audit-v1|trader|rule); sham: first 8 bytes of freeze sha256',
    llm: extras.compilerEval ? extras.compilerEval.models : null,
    createdAt: new Date().toISOString(),
  };
  const output = { manifest, cohorts, results, campaign: extras };
  writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(`${dir}/results.json`, JSON.stringify(output) + '\n');
  writeFileSync('evidence/runs/latest.json', JSON.stringify({ runId, resultsPath: `${dir}/results.json`, resultsSha256: sha256File(`${dir}/results.json`) }) + '\n');
  mkdirSync('apps/web/public/data/evidence', { recursive: true });
  writeFileSync('apps/web/public/data/evidence/summary.json', JSON.stringify(output));
  for (const r of results) writeFileSync(`apps/web/public/data/evidence/${r.id}.json`, JSON.stringify(r));
  console.log(`wrote ${dir}`);
}

switch (stage) {
  case 'select':
    selectStageRun();
    break;
  case 'test':
    testStageRun();
    break;
  default:
    console.log('usage: tsx scripts/eval.ts select | test');
}
