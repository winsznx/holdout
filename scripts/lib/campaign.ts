import { existsSync, readFileSync } from 'node:fs';
import {
  applyRule,
  auditRule,
  ingest,
  ledgerFromFills,
  num,
  parseBitgetExport,
  rngFromSeed,
  runHoldout,
  sum,
  type Candle,
  type Fill,
  type HoldoutOutcome,
  type Rule,
  type RoundTrip,
  type RuleAudit,
} from '../../packages/engine/src/index.ts';
import type { History } from './history.ts';
import { LEAK_RULE, STATED_RULES, flagged, prepare } from './pipeline.ts';

interface ResultRef {
  id: string;
  outcome: HoldoutOutcome;
  audits: RuleAudit[];
}

function p1b(results: ResultRef[]) {
  const bots = results.filter((r) => r.id.startsWith('bot-'));
  const matrix = bots.map((r) => ({
    bot: r.id,
    plantedLeak: LEAK_RULE[r.id] ?? null,
    cells: r.audits.map((a) => ({
      rule: a.rule.t,
      status: a.status,
      breaks: a.breaks,
      cost: a.costDelta,
      intervalLo: a.interval?.lo ?? null,
      intervalHi: a.interval?.hi ?? null,
      flagged: flagged(a),
    })),
    topProposal: r.outcome.selection?.selected?.rule.t ?? null,
  }));
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const row of matrix) {
    for (const cell of row.cells) {
      const expected = row.plantedLeak === cell.rule;
      if (cell.flagged && expected) tp += 1;
      if (cell.flagged && !expected) fp += 1;
      if (!cell.flagged && expected) fn += 1;
    }
  }
  return {
    rules: STATED_RULES.map((r) => r.t),
    matrix,
    audit: { tp, fp, fn, precision: tp + fp === 0 ? null : tp / (tp + fp), recall: tp + fn === 0 ? null : tp / (tp + fn) },
    proposals: {
      targetedOwnLeak: matrix.filter((m) => m.plantedLeak && m.topProposal === m.plantedLeak).length,
      targetedOtherRule: matrix.filter((m) => m.topProposal && m.topProposal !== m.plantedLeak).length,
    },
  };
}

function p3(histories: History[], market: Record<string, Candle[]>) {
  const source = histories.find((h) => h.meta.id === 'bot-C') ?? histories.find((h) => h.meta.kind === 'bot');
  if (!source) return { status: 'not_run', reason: 'no bot history available' };
  const base = prepare(source, market);
  const trimmed = base.ledger.roundTrips.slice(0, 20);
  const outcome = runHoldout(`${source.meta.id}-trim20`, trimmed, base.ctx, 'p3', 'p3');
  const audit = auditRule(source.meta.id, trimmed, STATED_RULES[0] as Rule, base.ctx);
  return {
    status: outcome.verdict === 'INSUFFICIENT' && audit.status !== 'untestable' ? 'pass' : 'fail',
    source: source.meta.id,
    trimmedTo: trimmed.length,
    verdict: outcome.verdict,
    reason: outcome.reason,
    auditStatus: audit.status,
    auditBreaks: audit.breaks,
  };
}

function p4(histories: History[], market: Record<string, Candle[]>) {
  const source = histories.find((h) => h.meta.id === 'bot-C');
  if (!source) return { status: 'not_run', reason: 'bot-C history missing' };
  const base = prepare(source, market);
  const real = base.ledger.roundTrips;
  const losses = real.filter((t) => num(t.netPnl) < 0).slice(0, 25);
  if (losses.length < 10 || real.length < 20) {
    return { status: 'not_run', reason: `needs 10 losing trades and 20 trades, has ${losses.length} and ${real.length}` };
  }
  const rng = rngFromSeed(20261010);
  const planted: RoundTrip[] = losses.map((loss, i) => {
    const donor = real[Math.floor(rng() * real.length)] as RoundTrip;
    const openTs = loss.closeTs + 45_000;
    const duration = Math.max(60_000, donor.closeTs - donor.openTs);
    return { ...donor, id: `planted_${i}`, openTs, closeTs: openTs + duration, execIds: [`planted_${i}`], entries: [], exits: [] };
  });
  const plantedNet = num(sum(planted.map((t) => t.netPnl)));
  const combined = [...real, ...planted].sort((a, b) => a.closeTs - b.closeTs);
  const rule: Rule = { t: 'cooldown_after_loss', minutes: 5 };
  const audit = auditRule('planted-C', combined, rule, base.ctx);
  const plantedIds = new Set(planted.map((t) => t.id));
  const caughtIds = audit.brokenTripIds.filter((id) => plantedIds.has(id));
  const auditedOnInjected = -num(sum(combined.filter((t) => caughtIds.includes(t.id)).map((t) => t.netPnl)));
  const recall = caughtIds.length / planted.length;
  const costError = plantedNet === 0 ? null : Math.abs(-auditedOnInjected - plantedNet) / Math.abs(plantedNet);
  return {
    status: recall >= 0.9 && costError !== null && costError <= 0.05 ? 'pass' : 'fail',
    label: 'planted-C: labeled copy of Bitget Demo bot C with injected post-loss re-entries, never real data',
    injected: planted.length,
    caught: caughtIds.length,
    recall,
    injectedNetPnl: plantedNet,
    auditedNetPnlOnInjected: -auditedOnInjected,
    costError,
    realTripsAlsoFlagged: audit.brokenTripIds.filter((id) => !plantedIds.has(id)).length,
  };
}

function p5(histories: History[]) {
  const rows = histories
    .filter((h) => h.meta.kind === 'bot')
    .map((h) => {
      const settlements = Object.values(h.fundingSettlements ?? {}).flat();
      const present = ledgerFromFills(h.meta.id, h.fills, h.funding, { fundingSettlements: h.fundingSettlements });
      const removed = ledgerFromFills(h.meta.id, h.fills, [], { fundingSettlements: h.fundingSettlements });
      const crossing = present.roundTrips.filter((t) => settlements.some((s) => s > t.openTs && s <= t.closeTs)).length;
      return { id: h.meta.id, tripsCrossingSettlement: crossing, flaggedWhenFundingRemoved: removed.flags.incomplete, flaggedWhenPresent: present.flags.incomplete };
    });
  const testable = rows.filter((r) => r.tripsCrossingSettlement > 0);
  return {
    status: testable.length === 0 ? 'not_testable' : testable.every((r) => r.flaggedWhenFundingRemoved && !r.flaggedWhenPresent) ? 'pass' : 'fail',
    note: testable.length === 0 ? 'No Demo bot round trip crossed a funding settlement, so there is no funding window to remove.' : undefined,
    rows,
  };
}

function csvFromFills(fills: Fill[]): string {
  const header = 'Trade ID,Order ID,Symbol,Side,Price,Quantity,Fee,Realized PnL,Time';
  const rows = fills.map((f) => [f.execId, f.orderId, f.symbol, `${f.tradeSide} ${f.posSide}`, f.price, f.qty, f.fee, f.execPnl ?? '', new Date(f.ts).toISOString()].join(','));
  return [header, ...rows].join('\n');
}

function p6(histories: History[]) {
  const source = histories.find((h) => h.meta.id === 'bot-R') ?? histories.find((h) => h.meta.kind === 'bot');
  if (!source) return { status: 'not_run', reason: 'no bot history available' };
  const parsed = parseBitgetExport(csvFromFills(source.fills));
  const byId = new Map(source.fills.map((f) => [f.execId, f]));
  const csvFills = parsed.fills.map((f) => {
    const original = byId.get(f.execId);
    return { ...f, product: original?.product ?? f.product, leverage: original?.leverage, clientOid: original?.clientOid };
  });
  const merged = ingest(source.fills, csvFills);
  const api = ledgerFromFills(source.meta.id, source.fills, source.funding);
  const both = ledgerFromFills(source.meta.id, merged.fills, source.funding);
  const identical = JSON.stringify(api) === JSON.stringify(both);
  return {
    status: identical ? 'pass' : 'fail',
    source: source.meta.id,
    note: 'The CSV was rendered from API fills in the documented Bitget export columns. It is not a live Bitget export, so this checks the merge path only.',
    apiFills: source.fills.length,
    csvFills: parsed.fills.length,
    mergedFills: merged.fills.length,
    duplicatesDropped: merged.duplicatesDropped,
    ledgerByteIdentical: identical,
  };
}

function p7(histories: History[], market: Record<string, Candle[]>) {
  const probes: Rule[] = [
    ...STATED_RULES,
    { t: 'hard_stop', pct: 1 },
    { t: 'hard_stop', pct: 2 },
    { t: 'earnings_blackout', hoursBefore: 24 },
    { t: 'product_switch_weekend', from: 'stock_perp', to: 'rtoken' },
  ];
  const rows = histories.map((h) => {
    const full = prepare(h, market);
    const off = { ...full.ctx, disabled: ['S3', 'S4', 'S5', 'S7'] as ('S3' | 'S4' | 'S5' | 'S7')[] };
    let untestableFull = 0;
    let untestableAblated = 0;
    let vanished = 0;
    for (const rule of probes) {
      const a = auditRule(h.meta.id, full.ledger.roundTrips, rule, full.ctx);
      const b = auditRule(h.meta.id, full.ledger.roundTrips, rule, off);
      if (a.status === 'untestable') untestableFull += 1;
      if (b.status === 'untestable') untestableAblated += 1;
      if (a.status !== 'untestable' && b.status === 'untestable') vanished += Math.abs(num(a.costDelta));
    }
    return { id: h.meta.id, probes: probes.length, untestableFull, untestableAblated, becameUntestable: untestableAblated - untestableFull, auditedCostVanished: vanished };
  });
  return {
    sourcesDisabled: ['S3 mark candles', 'S4 rToken candles', 'S5 earnings calendar', 'S7 NYSE session calendar'],
    rows,
    totalBecameUntestable: rows.reduce((s, r) => s + r.becameUntestable, 0),
    totalCostVanished: rows.reduce((s, r) => s + r.auditedCostVanished, 0),
  };
}

function p9() {
  const path = 'evidence/runs/compiler-eval/latest.json';
  if (!existsSync(path)) return { status: 'not_run', reason: 'no volunteer rules received yet (n = 0)', models: null as unknown };
  return JSON.parse(readFileSync(path, 'utf8')) as { status: string; models: unknown };
}

export function campaignExtras(histories: History[], market: Record<string, Candle[]>, results: ResultRef[]) {
  const compilerEval = p9();
  const control = results.find((r) => r.id === 'bot-C');
  return {
    p1b: p1b(results),
    p2: control
      ? { traderId: control.id, verdict: control.outcome.verdict, reason: control.outcome.reason, pass: control.outcome.verdict !== 'ADOPT_WORTHY' }
      : { status: 'not_run' },
    p3: p3(histories, market),
    p4: p4(histories, market),
    p5: p5(histories),
    p6: p6(histories),
    p7: p7(histories, market),
    p9: compilerEval,
    compilerEval,
  };
}
