import { readFileSync, writeFileSync } from 'node:fs';
import type { TraderResult } from './lib/compute.ts';

interface Cell { rule: string; status: string; breaks: number; cost: string; flagged: boolean }
interface Results {
  manifest: { runId: string; commit: string; preregSha256: string; llm: unknown };
  cohorts: { cohort: string; traders: number; tested: number; medianDeltaTest: number | null; medianShamMedian: number | null; adoptWorthy: number; headline: string; killRuleApplied: boolean }[];
  results: TraderResult[];
  campaign: {
    p1b: { matrix: { bot: string; plantedLeak: string | null; cells: Cell[]; topProposal: string | null }[]; audit: { tp: number; fp: number; fn: number; precision: number | null; recall: number | null }; proposals: { targetedOwnLeak: number; targetedOtherRule: number } };
    p2: { verdict?: string; pass?: boolean };
    p3: { status: string; trimmedTo?: number };
    p4: { status: string; recall?: number; costError?: number | null; injected?: number; caught?: number };
    p5: { status: string };
    p6: { status: string; ledgerByteIdentical?: boolean };
    p7: { totalBecameUntestable: number; totalCostVanished: number };
    p9: { status: string; reason?: string };
  };
}

const URL = 'https://holdout.timjosh507.workers.dev';
const REPO = 'https://github.com/winsznx/holdout';
const latest = JSON.parse(readFileSync('evidence/runs/latest.json', 'utf8')) as { resultsPath: string };
const r = JSON.parse(readFileSync(latest.resultsPath, 'utf8')) as Results;

const bots = r.results.filter((x) => x.cohort === 'bitget-demo-bots');
const leakBots = bots.filter((b) => r.campaign.p1b.matrix.find((m) => m.bot === b.id)?.plantedLeak);
const trips = Object.fromEntries(bots.map((b) => [b.id, b.nTrips]));
const a = r.campaign.p1b.audit;
const botCohort = r.cohorts.find((c) => c.cohort === 'bitget-demo-bots');
const control = bots.find((b) => b.id === 'bot-C');

const facts = {
  generatedFrom: latest.resultsPath,
  runId: r.manifest.runId,
  commit: r.manifest.commit,
  preregSha256: r.manifest.preregSha256,
  urls: { app: URL, evidence: `${URL}/evidence`, repo: REPO },
  botRoundTrips: trips,
  planted: { habitsPlanted: leakBots.length, habitsFlagged: a.tp, missed: a.fn, falseFlags: a.fp, precision: a.precision, recall: a.recall },
  proposalsTargetingOwnLeak: r.campaign.p1b.proposals,
  healthyControl: { verdict: control?.outcome.verdict ?? null, reason: control?.outcome.reason ?? null },
  holdoutCohort: botCohort ?? null,
  plantedLeakTest: r.campaign.p4,
  tooLittleData: r.campaign.p3,
  gaps: r.campaign.p5,
  duplicates: r.campaign.p6,
  ablation: r.campaign.p7,
  compilerEval: r.campaign.p9,
  humanHistories: r.results.filter((x) => x.kind === 'human-demo' || x.kind === 'human-live').length,
  limitations: [
    'Bitget Demo bots test detection power and false positives. They are not evidence about human traders.',
    'The Bitget CSV adapter is untested against a live export. The money_boys files are strategy samples, not live fills.',
    'Bitget fill history has no leverage. Leverage for the bots is read from the bot client order id.',
    'Demo has no rToken pairs, so the product-switch rule is untestable on Demo data.',
    'Chainbase AgentKey (S8) is not connected.',
  ],
};
writeFileSync('submission-facts.json', JSON.stringify(facts, null, 2) + '\n');

const pct = (x: number | null) => (x === null ? 'n/a' : `${Math.round(x * 100)}%`);
const headline = a.tp + a.fn > 0
  ? `On ${bots.length} Bitget Demo bots with one planted habit each (or none, for the control), the audit flagged ${a.tp} of ${a.tp + a.fn} planted habits and ${a.fp} habits that were not planted. The disciplined control returned "${control?.outcome.verdict ?? 'n/a'}".`
  : 'The bot cohort did not produce enough trades to price the planted habits yet.';
const holdoutLine = !botCohort
  ? 'No cohort result.'
  : botCohort.headline === 'audit'
    ? `The "discovered rules help" headline is withdrawn for the bot cohort under the pre-registered kill rule (${botCohort.tested} bots had a tested rule, ${botCohort.adoptWorthy} adopt-worthy). The audit headline ships.`
    : `Rules chosen on earlier trades beat the same-size random rule on later trades for the bot cohort (median test gain ${botCohort.medianDeltaTest?.toFixed(4)} USDT against a median sham of ${botCohort.medianShamMedian?.toFixed(4)} USDT).`;

const readme = `# Holdout

A trading journal that proves which rules make you money. Holdout takes a Bitget trader's own fills, audits the rules they say they follow, tests candidate rules on trades they never saw, and checks new trade ideas against the result. Holdout never places orders.

Live: ${URL}
Evidence: ${URL}/evidence

## What the evidence says

${headline}

${holdoutLine}

Bitget Demo bots test the method. They say nothing about whether Holdout helps a human trader. Every number is recomputed by \`pnpm verify\` from \`evidence/raw\` with no network and no keys. Run id: ${r.manifest.runId}. Pre-registration sha256: ${r.manifest.preregSha256}.

Limits: ${facts.limitations.join(' ')}

## Run it

\`\`\`
pnpm install
pnpm test
pnpm verify
pnpm --filter @holdout/web dev
\`\`\`

## Layout

apps/web (Next.js on Cloudflare Workers), packages/engine (pure TypeScript), packages/bitget (clients), packages/llm (compiler, narrator, numbers firewall), packages/skill (Skill and MCP server), harness (Demo-only test bots), evidence (raw data, freeze files, runs), docs (methodology, math, decisions).

See docs/METHODOLOGY.md, docs/MATH.md and docs/DECISIONS.md. MIT license.
`;
const current = readFileSync('README.md', 'utf8');
const block = readme.slice(readme.indexOf('## What the evidence says'), readme.indexOf('## Run it')).trim();
writeFileSync('README.md', current.replace(/<!-- evidence:start -->[\s\S]*<!-- evidence:end -->/, `<!-- evidence:start -->\n${block}\n<!-- evidence:end -->`));

const form = `# Submission text

Generated from submission-facts.json (run ${r.manifest.runId}). Numbers come from the evidence run only.

## 1. Thesis
Traders do not lack rules. Nothing checks them. Holdout turns a Bitget trader's own fills into a rulebook proven in dollars, with each rule tested on trades it never saw, and checks new trade ideas against it. GetAgent 2.0 and journal apps describe the past. None tests a fix out of sample.

## 2. Target user
Bitget retail to VIP3 traders in stock perps, rTokens and crypto futures, accounts of 1k to 50k USDT, 10 or more trades a week, medium-to-high risk appetite, mostly emerging markets. Targets, not measurements.

## 3. Validation (each labeled)
- Observed, Bitget Demo bots: ${Object.entries(trips).map(([k, v]) => `${k} ${v}`).join(', ')} closed round trips. ${headline}
- Observed, holdout test: ${holdoutLine}
- Observed, planted-leak test (P4): ${r.campaign.p4.status === 'not_run' ? 'not run' : `recall ${pct(r.campaign.p4.recall ?? null)}, cost error ${pct(r.campaign.p4.costError ?? null)}`}.
- Observed, too little data (P3): ${r.campaign.p3.status}. Duplicates (P6): ${r.campaign.p6.status}. Gaps (P5): ${r.campaign.p5.status}.
- Observed, sponsor ablation (P7): ${r.campaign.p7.totalBecameUntestable} rule probes became untestable, ${r.campaign.p7.totalCostVanished.toFixed(4)} USDT of audited cost vanished.
- Rule compiler (P9): ${r.campaign.p9.status === 'not_run' ? r.campaign.p9.reason ?? 'not run' : 'see /evidence'}.
- Human histories: ${facts.humanHistories}.

## 4. Progress
Built: engine, audit, holdout test with pre-registration and freeze gate, sham and baseline, desk (import, ledger, rules, proposals, sessions, check, chat, rulebook), evidence page and verifier, Skill and MCP server. Not built: Bybit and Binance adapters (no real export arrived), Chainbase AgentKey (S8). Stack and Bitget surfaces S1 to S7 are listed in docs/METHODOLOGY.md.

## 5. Deliverables
Live desk, sample, evidence page and bundle, repo, video, Skill and MCP.

## 6. Take
Agentic accounts cannot read main-account history, so review tools still need manual read-only keys. bitget-signal has no historical endpoint for trade-time tagging. Bitget v3 fill history carries no leverage. See docs/SPONSOR_FINDINGS.md.

## LLM role
The LLM compiles plain-language rules into a typed DSL and refuses what it cannot test, parses trade ideas, narrates engine results through a numbers firewall, and runs the desk chat through tool calls. It never computes a number and never sees raw fills. Models: ${JSON.stringify(r.manifest.llm) === 'null' ? 'OpenAI gpt-5.5 (compiler, parser, narrator, chat)' : JSON.stringify(r.manifest.llm)}.
`;
writeFileSync('docs/SUBMISSION.md', form);
console.log('wrote submission-facts.json, README.md, docs/SUBMISSION.md');
