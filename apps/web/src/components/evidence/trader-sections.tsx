import Link from 'next/link';
import { renderRule } from '@holdout/engine';
import { DataTable, RuleCard, StateBlock, tagPropsForKind, type Column } from '@/components/ui';
import { formatCount, formatPercent, formatSignedUsdt, shortHash } from '@/lib/format';
import type { TraderResult } from '@/lib/evidence-data';
import { KindTag, SampleNotice, VerdictLabel } from './common';
import { ShamHistogram } from './sham-histogram';

type Candidate = NonNullable<TraderResult['outcome']['selection']>['candidates'][number];

export function TraderVerdictTable({ results }: { results: TraderResult[] }) {
  const columns: Column<TraderResult>[] = [
    {
      key: 'trader',
      header: 'Trader',
      cell: (r) => (
        <div className="space-y-1">
          <Link href={`/evidence/${encodeURIComponent(r.id)}`} className="underline underline-offset-4">
            {r.label}
          </Link>
          <div>
            <KindTag kind={r.kind} />
          </div>
        </div>
      ),
    },
    { key: 'trips', header: 'Round trips', align: 'right', mono: true, cell: (r) => formatCount(r.nTrips) },
    {
      key: 'recon',
      header: 'Reconciled',
      cell: (r) => (r.recon.pass ? 'Yes' : `No: ${r.recon.reason ?? 'failed'}`),
    },
    { key: 'verdict', header: 'Verdict', cell: (r) => <VerdictLabel verdict={r.outcome.verdict} /> },
    {
      key: 'rule',
      header: 'Frozen rule',
      cell: (r) => (r.outcome.freeze ? renderRule(r.outcome.freeze.rule) : 'none frozen'),
    },
    {
      key: 'delta',
      header: 'Test delta (USDT)',
      align: 'right',
      mono: true,
      cell: (r) => (r.outcome.test ? formatSignedUsdt(r.outcome.test.deltaTest) : 'not tested'),
    },
    { key: 'p', header: 'p', align: 'right', mono: true, cell: (r) => (r.outcome.test ? r.outcome.test.p.toFixed(3) : 'n/a') },
    {
      key: 'why',
      header: 'Reason',
      cell: (r) => <span className="block max-w-[44ch] whitespace-normal text-muted">{r.blocked ?? r.outcome.reason}</span>,
    },
  ];
  return (
    <DataTable
      caption="Per trader verdicts from the frozen holdout test"
      columns={columns}
      rows={results}
      rowKey={(r) => r.id}
      emptyState={<StateBlock variant="empty" title="No trader results in the evaluation file" body="evidence summary results[] is empty." />}
    />
  );
}

export function FreezeTable({ results }: { results: TraderResult[] }) {
  const rows = results.filter((r) => r.outcome.freeze);
  const columns: Column<TraderResult>[] = [
    { key: 'trader', header: 'Trader', cell: (r) => r.label },
    { key: 'sha', header: 'Freeze sha256', mono: true, cell: (r) => <span className="break-all">{r.outcome.freeze?.sha256}</span> },
    { key: 'commit', header: 'Code commit', mono: true, cell: (r) => shortHash(r.outcome.freeze?.codeCommit ?? '', 12) },
    { key: 'at', header: 'Frozen at', mono: true, cell: (r) => r.outcome.freeze?.timestamp },
  ];
  return (
    <DataTable
      caption="Freeze records written before the test step"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      emptyState={<StateBlock variant="empty" title="No rule was frozen" body="No trader had a candidate that passed the train filters with a positive train gain, so there is nothing to freeze." />}
    />
  );
}

export function ShamGrid({ results }: { results: TraderResult[] }) {
  const tested = results.filter((r) => r.outcome.test && !r.outcome.test.untestable && r.outcome.test.shamDraws.length > 0);
  if (tested.length === 0) {
    return <StateBlock variant="empty" title="No sham distribution to draw" body="No trader reached the test step with a testable rule, so there are no sham draws." />;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tested.map((r) => {
        const t = r.outcome.test;
        if (!t) return null;
        return (
          <div key={r.id} className="rounded-card border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/evidence/${encodeURIComponent(r.id)}`} className="text-[14px] font-medium underline underline-offset-4">
                {r.label}
              </Link>
              <KindTag kind={r.kind} />
            </div>
            <p className="mt-1 mb-3 text-[12px] text-muted">{renderRule(t.rule)}</p>
            <ShamHistogram draws={t.shamDraws} observed={t.deltaTest} label={`Sham distribution for ${r.label}`} />
            <p className="num mt-2 text-[11px] text-muted">
              p = {t.p.toFixed(3)}. Sham median {formatSignedUsdt(t.shamMedian)}.
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function CandidateTable({ candidates }: { candidates: Candidate[] }) {
  const columns: Column<Candidate>[] = [
    { key: 'rule', header: 'Candidate rule', cell: (c) => renderRule(c.rule) },
    { key: 'affected', header: 'Train trades affected', align: 'right', mono: true, cell: (c) => `${c.affectedTrain} (${formatPercent(c.rate)})` },
    { key: 'gain', header: 'Train gain (USDT)', align: 'right', mono: true, cell: (c) => formatSignedUsdt(c.deltaTrain) },
    {
      key: 'state',
      header: 'Outcome',
      cell: (c) => <span className="block max-w-[46ch] whitespace-normal">{c.eligible ? 'Eligible' : `Skipped: ${c.skippedReason ?? 'no reason recorded'}`}</span>,
    },
  ];
  return (
    <DataTable
      caption="Candidate rules considered on the train set"
      columns={columns}
      rows={candidates}
      rowKey={(c) => JSON.stringify(c.rule)}
      emptyState={<StateBlock variant="empty" title="No candidates were considered" body="The trader had too few trades for the selection step." />}
    />
  );
}

export function NullResults({ results }: { results: TraderResult[] }) {
  const nulls = results.filter((r) => r.outcome.verdict !== 'ADOPT_WORTHY');
  const rejected = results.flatMap((r) =>
    (r.outcome.selection?.candidates ?? []).filter((c) => !c.eligible).map((c) => ({ trader: r, candidate: c })),
  );
  return (
    <div className="space-y-6">
      {nulls.length === 0 ? (
        <StateBlock variant="empty" title="Every trader was adopt worthy" body="No null results are in the evaluation file." />
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {nulls.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-[14px]">
              <div className="min-w-0">
                <Link href={`/evidence/${encodeURIComponent(r.id)}`} className="underline underline-offset-4">
                  {r.label}
                </Link>
                <p className="mt-0.5 text-muted">{r.blocked ?? r.outcome.reason}</p>
              </div>
              <VerdictLabel verdict={r.outcome.verdict} />
            </li>
          ))}
        </ul>
      )}
      <details className="rounded-card border border-line bg-surface">
        <summary className="label cursor-pointer px-4 py-3 select-none">Rejected candidates ({formatCount(rejected.length)})</summary>
        <div className="px-4 pb-4">
          {rejected.length === 0 ? (
            <p className="text-[14px] text-muted">No candidate was skipped in the evaluation file.</p>
          ) : (
            <ul className="divide-y divide-line text-[13px]">
              {rejected.map(({ trader, candidate }) => (
                <li key={`${trader.id}:${JSON.stringify(candidate.rule)}`} className="py-2">
                  <span className="num text-muted">{trader.id}</span> {renderRule(candidate.rule)}
                  <span className="block text-muted">{candidate.skippedReason ?? 'no reason recorded'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}

export function AuditCards({ result }: { result: TraderResult }) {
  if (result.audits.length === 0) {
    return <StateBlock variant="empty" title="No stated rules were audited" body="The evaluation file has no audits for this trader." />;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {result.audits.map((a) => {
        const value = Number(a.costDelta);
        return (
          <RuleCard
            key={JSON.stringify(a.rule)}
            rendered={a.rendered}
            ruleType={a.rule.t}
            status={a.status}
            breaks={a.breaks}
            tradesConsidered={a.tripsConsidered}
            effect={a.status === 'priced' && a.interval ? { value, lo: a.interval.lo, hi: a.interval.hi } : null}
            untestableReason={a.untestableReason}
            source={tagPropsForKind(result.kind)}
          />
        );
      })}
    </div>
  );
}

export { SampleNotice };
