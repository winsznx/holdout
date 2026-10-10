'use client';

import { num } from '@holdout/engine';
import { Bar, DataTable, Stat, StateBlock, type BarItem } from '@/components/ui';
import { DeskGate, type ReadyDesk } from '@/components/desk/gate';
import { NotInData } from '@/components/desk/not-in-data';
import { SectionCard } from '@/components/desk/section-card';
import { formatRate, money, signedMoney, toneClass } from '@/lib/desk/display';
import { formatCount } from '@/lib/format';
import type { GroupStats, LabeledGroup } from '@/lib/desk/types';

function GroupTable({ rows, caption }: { rows: LabeledGroup[]; caption: string }) {
  return (
    <DataTable
      caption={caption}
      rows={rows}
      rowKey={(r) => r.key}
      emptyState={<StateBlock variant="empty" title="No round trips in these groups" />}
      columns={[
        { key: 'label', header: 'Group', cell: (r) => <span className="whitespace-normal">{r.label}</span> },
        { key: 'n', header: 'Trips', align: 'right', mono: true, cell: (r) => formatCount(r.n) },
        { key: 'win', header: 'Win rate', align: 'right', mono: true, cell: (r) => formatRate(r.winRate) },
        { key: 'fees', header: 'Fees', align: 'right', mono: true, cell: (r) => money(r.fees) },
        { key: 'funding', header: 'Funding', align: 'right', mono: true, cell: (r) => signedMoney(r.funding) },
        { key: 'net', header: 'Net P&L', align: 'right', mono: true, cell: (r) => <span className={toneClass(r.net)}>{signedMoney(r.net)}</span> },
      ]}
    />
  );
}

function barItems(rows: LabeledGroup[]): BarItem[] {
  return rows.map((r) => ({ id: r.key, label: r.label.split(' (')[0] ?? r.label, value: num(r.net), display: signedMoney(r.net), tone: num(r.net) >= 0 ? 'gain' : 'loss' }));
}

function Compare({ label, g, missing }: { label: string; g: GroupStats | null; missing: string | undefined }) {
  if (!g) return <NotInData title={label} reason={missing ?? 'not in this data'} />;
  return (
    <div className="space-y-3">
      <div className="label">{label}</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Stat label="Net P&L" value={signedMoney(g.net)} unit="USDT" tone={num(g.net) > 0 ? 'gain' : num(g.net) < 0 ? 'loss' : 'neutral'} provenance={{ kind: 'observed', source: label, n: g.n }} />
        <Stat label="Win rate" value={formatRate(g.winRate)} provenance={{ kind: 'observed', source: label, n: g.n }} />
      </div>
      <p className="num text-[12px] text-muted">
        Fees {money(g.fees)} USDT, funding {signedMoney(g.funding)} USDT
      </p>
    </div>
  );
}

function SessionsBody({ desk }: { desk: ReadyDesk }) {
  const lens = desk.analysis.sessionLens;
  const { productCompare: pc, funding, premium } = lens;
  const stockMissing = pc.missing.find((m) => m.includes('stock perp'));
  const rtokenMissing = pc.missing.find((m) => m.includes('rToken'));
  const hasStock = desk.analysis.ledger.roundTrips.some((t) => t.product === 'stock_perp' || t.product === 'rtoken');

  return (
    <div className="space-y-8">
      <SectionCard label="01 / Sessions" title="P&L by US session at entry">
        {lens.unavailableReason ? (
          <NotInData reason={lens.unavailableReason} />
        ) : (
          <div className="space-y-4">
            {!hasStock ? (
              <p className="text-[13px] text-muted">
                Every trade here is a crypto perp, which trades around the clock. US sessions are shown as the time of day the trade opened, not as a Bitget trading session.
              </p>
            ) : null}
            <Bar label="Net P&L by session" items={barItems(lens.bySession)} />
            <GroupTable rows={lens.bySession} caption="Round trips grouped by the US session at entry" />
          </div>
        )}
      </SectionCard>

      <SectionCard label="02 / Holds" title="Holds across the open and the weekend">
        {lens.unavailableReason ? <NotInData reason={lens.unavailableReason} /> : <GroupTable rows={lens.holds} caption="Round trips grouped by what they were held across" />}
      </SectionCard>

      <SectionCard label="03 / Products" title="Stock perp against rToken">
        <div className="grid gap-6 md:grid-cols-2">
          <Compare label="Stock perp" g={pc.stockPerp} missing={stockMissing} />
          <Compare label="rToken" g={pc.rtoken} missing={rtokenMissing} />
        </div>
        {pc.stockPerp && pc.rtoken ? null : (
          <p className="mt-4 text-[12px] text-muted">A comparison needs round trips in both products. It is shown when both exist in the history.</p>
        )}
      </SectionCard>

      <SectionCard label="04 / Costs" title="Funding and premium">
        <div className="grid gap-6 md:grid-cols-2">
          {funding.total === null ? (
            <NotInData title="Funding" reason={funding.unavailableReason ?? 'not in this data'} />
          ) : (
            <div className="space-y-2">
              <Stat label="Funding paid and received" value={signedMoney(funding.total)} unit="USDT" provenance={{ kind: 'observed', source: 'Bitget financial records (S2)', n: funding.records }} />
              <p className="text-[12px] text-muted">{funding.tripsWithFunding} of {desk.analysis.ledger.roundTrips.length} round trips carry a funding amount.</p>
            </div>
          )}
          <NotInData title="Premium" reason={premium.reason} />
        </div>
      </SectionCard>
    </div>
  );
}

export function SessionsView() {
  return <DeskGate>{(desk) => <SessionsBody desk={desk} />}</DeskGate>;
}
