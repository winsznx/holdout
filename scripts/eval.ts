import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import {
  makeFreeze,
  median,
  renderRule,
  runHoldout,
  stageSelect,
  stageTest,
  type FreezeRecord,
  type HoldoutOutcome,
  type RuleAudit,
} from '../packages/engine/src/index.ts';
import { headCommit, isCommitted } from './lib/git.ts';
import { loadHistories, loadMarket, prepare, statedAudits, type TraderBase } from './lib/pipeline.ts';
import { campaignExtras } from './lib/campaign.ts';
import type { History } from './lib/history.ts';

const FREEZE_DIR = 'evidence/freeze';
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

interface TraderResult {
  id: string;
  label: string;
  kind: string;
  cohort: string;
  nTrips: number;
  recon: TraderBase['recon'];
  flags: TraderBase['ledger']['flags'];
  blocked: string | null;
  audits: RuleAudit[];
  outcome: HoldoutOutcome;
}

function testStageRun(): void {
  if (!isCommitted(PREREG)) throw new Error(`${PREREG} must be committed before any evaluation runs`);
  const market = loadMarket();
  const histories = tradedHistories();
  const results: TraderResult[] = [];
  for (const history of histories) {
    const base = prepare(history, market);
    const id = history.meta.id;
    const audits = statedAudits(base);
    const cohort = history.meta.kind === 'bot' ? 'bitget-demo-bots' : history.meta.kind;
    let outcome: HoldoutOutcome;
    if (base.blocked) {
      outcome = { traderId: id, verdict: 'INSUFFICIENT', reason: base.blocked, nTrips: base.ledger.roundTrips.length, nTrain: 0, nTest: 0, splitTs: 0, selection: null, freeze: null, test: null };
    } else {
      const freezePath = `${FREEZE_DIR}/${id}.json`;
      const staged = stageSelect(id, base.ledger.roundTrips, base.ctx, 'replay', 'replay');
      if (staged.insufficient || !staged.selection) {
        outcome = runHoldout(id, base.ledger.roundTrips, base.ctx, 'replay', 'replay');
      } else if (!staged.freeze) {
        outcome = stageTest(id, staged.split, staged.selection, null, base.ctx);
      } else {
        if (!existsSync(freezePath)) throw new Error(`${id}: selection produced a rule but ${freezePath} does not exist. Run the select stage first.`);
        if (!isCommitted(freezePath)) throw new Error(`${id}: ${freezePath} is not committed. Refusing to run the test step.`);
        const frozen = JSON.parse(readFileSync(freezePath, 'utf8')) as FreezeRecord;
        const recomputed = makeFreeze(id, staged.split, staged.selection, frozen.codeCommit, frozen.timestamp);
        if (!recomputed || recomputed.sha256 !== frozen.sha256) throw new Error(`${id}: frozen selection does not match a recomputation from train data`);
        outcome = stageTest(id, staged.split, staged.selection, frozen, base.ctx);
      }
    }
    results.push({ id, label: history.meta.label, kind: history.meta.kind, cohort, nTrips: base.ledger.roundTrips.length, recon: base.recon, flags: base.ledger.flags, blocked: base.blocked, audits, outcome });
    console.log(`${id}: ${outcome.verdict} (${outcome.reason})`);
  }

  const cohorts = [...new Set(results.map((r) => r.cohort))].map((cohort) => {
    const rows = results.filter((r) => r.cohort === cohort && r.outcome.test && !r.outcome.test.untestable);
    const deltas = rows.map((r) => (r.outcome.test as NonNullable<typeof r.outcome.test>).deltaTest);
    const shamMedians = rows.map((r) => (r.outcome.test as NonNullable<typeof r.outcome.test>).shamMedian);
    const medDelta = deltas.length ? median(deltas) : null;
    const medSham = shamMedians.length ? median(shamMedians) : null;
    const killed = medDelta === null || medSham === null || medDelta <= medSham || medDelta <= 0;
    return {
      cohort,
      traders: results.filter((r) => r.cohort === cohort).length,
      tested: rows.length,
      medianDeltaTest: medDelta,
      medianShamMedian: medSham,
      adoptWorthy: results.filter((r) => r.cohort === cohort && r.outcome.verdict === 'ADOPT_WORTHY').length,
      headline: killed ? 'audit' : 'discovered_rules_help',
      killRuleApplied: killed,
    };
  });

  const runId = `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const dir = `evidence/runs/${runId}`;
  mkdirSync(dir, { recursive: true });
  const extras = campaignExtras(histories, market, results.map((r) => ({ id: r.id, outcome: r.outcome, audits: r.audits })));
  const dataHashes: Record<string, string> = {};
  for (const f of readdirSync('evidence/raw/histories').filter((n) => n.endsWith('.json'))) dataHashes[`histories/${f}`] = sha256File(`evidence/raw/histories/${f}`);
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
