import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { stableStringify } from '../packages/engine/src/index.ts';
import { computeAll, computeTrader, readFreezeFile, type TraderResult } from './lib/compute.ts';
import type { History } from './lib/history.ts';
import { loadHistories, loadMarket } from './lib/pipeline.ts';

const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const canon = (v: unknown) => stableStringify(JSON.parse(JSON.stringify(v)));

let failures = 0;
function report(ok: boolean, name: string, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

if (!existsSync('evidence/runs/latest.json')) {
  console.log('FAIL  no published run (evidence/runs/latest.json missing)');
  process.exit(1);
}
const latest = JSON.parse(readFileSync('evidence/runs/latest.json', 'utf8')) as { runId: string; resultsPath: string; resultsSha256: string };
report(sha(latest.resultsPath) === latest.resultsSha256, 'published results file hash', latest.runId);
const published = JSON.parse(readFileSync(latest.resultsPath, 'utf8')) as {
  manifest: { preregSha256: string; dataHashes: Record<string, string> };
  cohorts: unknown;
  results: TraderResult[];
  campaign: Record<string, unknown>;
};

report(sha('evidence/PREREG.md') === published.manifest.preregSha256, 'PREREG.md matches the hash recorded in the manifest');
for (const [name, hash] of Object.entries(published.manifest.dataHashes)) {
  const path = `evidence/raw/${name}`;
  report(existsSync(path) && sha(path) === hash, `raw data hash ${name}`);
}

const histories = loadHistories().filter((h) => !h.meta.id.startsWith('planted-'));
const market = loadMarket();
const recomputed = computeAll(histories, market, readFreezeFile);

for (const mine of recomputed.results) {
  const theirs = published.results.find((r) => r.id === mine.id);
  report(theirs !== undefined && canon(mine.recon) === canon(theirs.recon), `${mine.id} reconciliation`, `delta ${mine.recon.totalDelta} on ${mine.recon.tripRows} trades`);
  report(theirs !== undefined && canon(mine.audits) === canon(theirs.audits), `${mine.id} audit of stated rules`);
  report(theirs !== undefined && canon(mine.outcome) === canon(theirs.outcome), `${mine.id} holdout result`, mine.outcome.verdict);
}
report(canon(recomputed.cohorts) === canon(published.cohorts), 'cohort summary and kill rule');
for (const key of Object.keys(recomputed.campaign)) {
  report(canon((recomputed.campaign as Record<string, unknown>)[key]) === canon(published.campaign[key]), `campaign ${key}`);
}

const victim = histories.find((h) => h.fills.some((f) => /[1-8]/.test(f.fee)));
if (victim) {
  const tampered: History = JSON.parse(JSON.stringify(victim)) as History;
  const fill = tampered.fills[0];
  if (fill) {
    const digits = fill.fee.split('');
    const i = digits.findIndex((c) => c >= '1' && c <= '8');
    if (i >= 0) digits[i] = String(Number(digits[i]) + 1);
    fill.fee = digits.join('');
  }
  const before = published.results.find((r) => r.id === victim.meta.id);
  let detected = false;
  try {
    const after = computeTrader(tampered, market, readFreezeFile);
    detected = before === undefined || canon(after) !== canon(before);
  } catch {
    detected = true;
  }
  console.log(`${detected ? 'FAIL' : 'PASS'}  tamper test: flipped one digit of the fee in one fill of ${victim.meta.id}, ${detected ? 'verification fails as designed' : 'NOT DETECTED'}`);
  if (!detected) failures += 1;
}

console.log(failures === 0 ? '\nverify: all numbers PASS' : `\nverify: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
