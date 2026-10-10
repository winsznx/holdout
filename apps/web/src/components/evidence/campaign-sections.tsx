import { DataTable, StateBlock, type Column } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatSignedUsdt } from '@/lib/format';
import { NO_VOLUNTEER_RULES, numberField, type Campaign, type CampaignRow, type FirewallFile } from '@/lib/evidence-data';
import type { Loaded } from '@/lib/use-loaded';
import { StatusLabel } from './common';

export function CampaignTable({ rows }: { rows: CampaignRow[] }) {
  const columns: Column<CampaignRow>[] = [
    { key: 'id', header: 'Test', mono: true, cell: (r) => r.id },
    { key: 'name', header: 'What it checks', cell: (r) => r.name },
    { key: 'status', header: 'Status', cell: (r) => <StatusLabel status={r.status} /> },
    { key: 'detail', header: 'Reason and numbers', cell: (r) => <span className="block max-w-[64ch] whitespace-normal text-muted">{r.detail}</span> },
  ];
  return <DataTable caption="Evaluation campaign P1 to P9" columns={columns} rows={rows} rowKey={(r) => r.id} emptyState={null} />;
}

export function SpecificityMatrix({ p1b }: { p1b: Campaign['p1b'] }) {
  if (!p1b || p1b.matrix.length === 0) {
    return <StateBlock variant="empty" title="No specificity matrix in the evaluation file" body="campaign.p1b is absent, so no bot by rule matrix is drawn." />;
  }
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-max border-collapse text-[13px]">
          <caption className="sr-only">Bitget Demo bots by stated rule. Outlined cells are the planted leak.</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="label px-3 py-2.5 text-left font-normal">
                Bitget Demo bot
              </th>
              {p1b.rules.map((r) => (
                <th key={r} scope="col" className="label px-3 py-2.5 text-left font-normal">
                  {r}
                </th>
              ))}
              <th scope="col" className="label px-3 py-2.5 text-left font-normal">
                Top proposal
              </th>
            </tr>
          </thead>
          <tbody>
            {p1b.matrix.map((row) => (
              <tr key={row.bot} className="border-b border-line last:border-b-0">
                <th scope="row" className="num px-3 py-2 text-left font-normal">
                  {row.bot}
                  <span className="block text-[11px] text-muted">{row.plantedLeak ? `planted: ${row.plantedLeak}` : 'planted: none (control)'}</span>
                </th>
                {p1b.rules.map((rule) => {
                  const cell = row.cells.find((c) => c.rule === rule);
                  const planted = row.plantedLeak === rule;
                  return (
                    <td key={rule} className={cn('px-3 py-2 align-top', planted && 'outline outline-1 -outline-offset-1 outline-signal')}>
                      {cell ? (
                        <>
                          <span className={cn('font-medium', cell.flagged ? 'text-ink' : 'text-muted')}>{cell.flagged ? 'Flagged' : 'Not flagged'}</span>
                          <span className="num block text-[11px] text-muted">
                            {cell.status.replaceAll('_', ' ')}, {cell.breaks} breaks
                          </span>
                          {cell.status === 'priced' ? (
                            <span className="num block text-[11px] text-muted">
                              {formatSignedUsdt(Number(cell.cost))} ({cell.intervalLo === null ? 'n/a' : formatSignedUsdt(cell.intervalLo)} to {cell.intervalHi === null ? 'n/a' : formatSignedUsdt(cell.intervalHi)})
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-muted">no cell</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2 align-top">{row.topProposal ?? <span className="text-muted">none</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="num grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line text-[13px] sm:grid-cols-5">
        {[
          ['True positives', String(p1b.audit.tp)],
          ['False positives', String(p1b.audit.fp)],
          ['False negatives', String(p1b.audit.fn)],
          ['Precision', p1b.audit.precision === null ? 'not defined' : p1b.audit.precision.toFixed(2)],
          ['Recall', p1b.audit.recall === null ? 'not defined' : p1b.audit.recall.toFixed(2)],
        ].map(([k, v]) => (
          <div key={k} className="bg-surface px-3 py-2">
            <dt className="label">{k}</dt>
            <dd className="mt-1 text-[18px]">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function AblationTable({ p7 }: { p7: Campaign['p7'] }) {
  if (!p7) return <StateBlock variant="empty" title="No ablation in the evaluation file" body="campaign.p7 is absent." />;
  type Row = NonNullable<Campaign['p7']>['rows'][number];
  const columns: Column<Row>[] = [
    { key: 'id', header: 'Trader', mono: true, cell: (r) => r.id },
    { key: 'probes', header: 'Rule probes', align: 'right', mono: true, cell: (r) => r.probes },
    { key: 'full', header: 'Untestable, all sources', align: 'right', mono: true, cell: (r) => r.untestableFull },
    { key: 'ablated', header: 'Untestable, sources off', align: 'right', mono: true, cell: (r) => r.untestableAblated },
    { key: 'became', header: 'Became untestable', align: 'right', mono: true, cell: (r) => r.becameUntestable },
    { key: 'vanished', header: 'Audited cost lost (USDT)', align: 'right', mono: true, cell: (r) => r.auditedCostVanished.toFixed(2) },
  ];
  return (
    <div className="space-y-3">
      <p className="text-[14px] text-muted">Sources switched off: {p7.sourcesDisabled.join(', ')}.</p>
      <DataTable caption="Sponsor data ablation" columns={columns} rows={p7.rows} rowKey={(r) => r.id} emptyState={null} />
      <p className="num text-[13px]">
        Total: {p7.totalBecameUntestable} rule checks became untestable. {p7.totalCostVanished.toFixed(2)} USDT of audited cost vanished.
      </p>
    </div>
  );
}

export function FirewallStats({ state }: { state: Loaded<FirewallFile> }) {
  if (state.status === 'loading') return <StateBlock variant="loading" title="Reading the firewall file" />;
  if (state.status === 'absent') {
    return (
      <StateBlock
        variant="empty"
        title="No narrator calls have been logged yet"
        body="/data/evidence/firewall.json does not exist. Firewall pass and failure counts appear here once narrator calls are logged."
      />
    );
  }
  if (state.status === 'error') return <StateBlock variant="error" surface="Holdout data file" title="The firewall file could not be read" body={state.message} />;
  const { passes, failures } = state.data;
  const total = passes + failures;
  return (
    <dl className="num grid grid-cols-3 gap-px overflow-hidden rounded-card border border-line bg-line text-[13px]">
      {[
        ['Narrations passed', String(passes)],
        ['Fell back to template', String(failures)],
        ['Fallback rate', total === 0 ? 'no calls' : `${((failures / total) * 100).toFixed(1)}%`],
      ].map(([k, v]) => (
        <div key={k} className="bg-surface px-3 py-3">
          <dt className="label">{k}</dt>
          <dd className="mt-1 text-[22px]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CompilerEval({ p9 }: { p9: Campaign['p9'] }) {
  const total = p9 ? numberField(p9, 'total') : null;
  if (!p9 || total === null || total === 0) {
    return <StateBlock variant="empty" title={NO_VOLUNTEER_RULES} body="The compiler is scored against hand labels written before it runs. Nothing is shown until volunteer rules exist." />;
  }
  const correct = numberField(p9, 'correct') ?? 0;
  const accuracy = numberField(p9, 'accuracy');
  return (
    <dl className="num grid grid-cols-3 gap-px overflow-hidden rounded-card border border-line bg-line text-[13px]">
      {[
        ['Volunteer rules', String(total)],
        ['Compiled correctly', String(correct)],
        ['Accuracy', accuracy === null ? `${((correct / total) * 100).toFixed(1)}%` : `${(accuracy * 100).toFixed(1)}%`],
      ].map(([k, v]) => (
        <div key={k} className="bg-surface px-3 py-3">
          <dt className="label">{k}</dt>
          <dd className="mt-1 text-[22px]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
