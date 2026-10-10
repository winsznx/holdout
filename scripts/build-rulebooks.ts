import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { makeRulebook, similarTradeIndex, type RulebookRule } from '../packages/engine/src/index.ts';
import type { TraderResult } from './lib/compute.ts';
import { loadHistories, loadMarket, prepare } from './lib/pipeline.ts';

const latest = JSON.parse(readFileSync('evidence/runs/latest.json', 'utf8')) as { resultsPath: string };
const published = JSON.parse(readFileSync(latest.resultsPath, 'utf8')) as { results: TraderResult[]; manifest: { createdAt: string } };
const market = loadMarket();
const outDir = 'apps/web/public/data/rulebooks';
mkdirSync(outDir, { recursive: true });

for (const history of loadHistories()) {
  const result = published.results.find((r) => r.id === history.meta.id);
  if (!result) continue;
  const base = prepare(history, market);
  const rules: Omit<RulebookRule, 'id' | 'rendered'>[] = result.audits.map((a) => ({
    rule: a.rule,
    status: 'stated' as const,
    evidence: { breaks: a.breaks, costDelta: a.costDelta, intervalLo: a.interval?.lo ?? null, intervalHi: a.interval?.hi ?? null },
  }));
  const t = result.outcome.test;
  if (t && result.outcome.freeze) {
    rules.push({
      rule: t.rule,
      status: 'proposed',
      evidence: { deltaTest: t.deltaTest, p: t.p, shamMedian: t.shamMedian, baselineDelta: t.baseline.deltaTest, nTrain: result.outcome.nTrain, nTest: result.outcome.nTest, freezeSha256: result.outcome.freeze.sha256 },
    });
  }
  const book = makeRulebook({
    version: 1,
    traderId: history.meta.id,
    label: history.meta.label,
    createdAt: published.manifest.createdAt,
    rules,
    buckets: similarTradeIndex(base.ledger.roundTrips),
    ledger: { roundTrips: base.ledger.roundTrips.length, reconciled: base.recon.pass, incomplete: base.ledger.flags.incomplete },
  });
  writeFileSync(`${outDir}/${history.meta.id}.json`, JSON.stringify(book, null, 2) + '\n');
  console.log(`rulebook ${history.meta.id}: ${book.rules.length} rules, ${book.buckets.length} buckets`);
}
