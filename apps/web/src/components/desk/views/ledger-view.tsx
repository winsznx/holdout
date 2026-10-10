'use client';

import { D, num, str, sum, type RoundTrip } from '@holdout/engine';
import { DataTable, StateBlock, Stat } from '@/components/ui';
import { DeskGate, type ReadyDesk } from '@/components/desk/gate';
import { SectionCard } from '@/components/desk/section-card';
import { SortableTable, type SortColumn } from '@/components/desk/sortable-table';
import { formatHold, formatTs, money, productLabel, signedMoney, toneClass } from '@/lib/desk/display';
import { formatCount, formatPercent } from '@/lib/format';

function tripColumns(desk: ReadyDesk): SortColumn<RoundTrip>[] {
  const { analysis } = desk;
  const dayLevel = analysis.dayLevel;
  return [
    { key: 'closeTs', header: 'Closed', mono: true, sortValue: (t) => t.closeTs, cell: (t) => formatTs(t.closeTs, dayLevel) },
    { key: 'symbol', header: 'Symbol', sortValue: (t) => t.symbol, cell: (t) => t.symbol },
    { key: 'product', header: 'Product', sortValue: (t) => t.product, cell: (t) => productLabel(t.product) },
    { key: 'side', header: 'Side', sortValue: (t) => t.side, cell: (t) => t.side },
    { key: 'hold', header: 'Held', align: 'right', mono: true, sortValue: (t) => t.closeTs - t.openTs, cell: (t) => formatHold(t.openTs, t.closeTs, dayLevel) },
    { key: 'qty', header: 'Qty', align: 'right', mono: true, sortValue: (t) => num(t.qty), cell: (t) => t.qty },
    { key: 'leverage', header: 'Leverage', align: 'right', mono: true, sortValue: (t) => t.maxLeverage ?? -1, cell: (t) => (t.maxLeverage !== undefined ? `${t.maxLeverage}x` : 'not in data') },
    { key: 'gross', header: 'Gross', align: 'right', mono: true, sortValue: (t) => num(t.grossPnl), cell: (t) => signedMoney(t.grossPnl) },
    { key: 'fees', header: 'Fees', align: 'right', mono: true, sortValue: (t) => num(t.fees), cell: (t) => money(t.fees) },
    { key: 'funding', header: 'Funding', align: 'right', mono: true, sortValue: (t) => num(t.funding), cell: (t) => signedMoney(t.funding) },
    { key: 'net', header: 'Net P&L', align: 'right', mono: true, sortValue: (t) => num(t.netPnl), cell: (t) => <span className={toneClass(t.netPnl)}>{signedMoney(t.netPnl)}</span> },
    {
      key: 'tags',
      header: 'Tags',
      cell: (t) => {
        const tag = analysis.tags[t.id];
        const items: string[] = [];
        if (tag) {
          items.push(tag.session.replace('_', ' '));
          if (tag.holdsAcrossOpen) items.push('across open');
          if (tag.holdsAcrossWeekend) items.push('across weekend');
          if (tag.intoFridayClose) items.push('into Friday close');
        }
        if (t.addedWhileLosing) items.push('added to loser');
        if (t.liquidated) items.push('liquidated');
        return items.length === 0 ? <span className="text-muted">none</span> : <span className="text-[12px]">{items.join(', ')}</span>;
      },
    },
  ];
}

function Reconciliation({ desk }: { desk: ReadyDesk }) {
  const { reconciliation: r, ledger } = desk.analysis;
  if (r.referenceRows === 0) {
    return (
      <StateBlock
        variant="partial"
        title="Not reconciled"
        body={
          desk.source.origin === 'csv' && desk.source.adapter === 'bitget-export'
            ? 'A Bitget CSV export has no positions history to compare against. Sync the read-only API to reconcile this ledger with Bitget positions history and financial records (S2).'
            : 'This history carries no reference positions, so the ledger totals cannot be compared with Bitget positions history and financial records (S2).'
        }
      />
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Ledger net P&L" value={money(r.totalOurs)} unit="USDT" provenance={{ kind: 'observed', source: 'engine ledger', n: ledger.roundTrips.length }} />
        <Stat label="Reference net profit" value={money(r.totalReference)} unit="USDT" provenance={{ kind: 'observed', source: 'reference positions', n: r.referenceRows }} />
        <Stat label="Delta" value={signedMoney(r.totalDelta)} unit="USDT" tone={r.pass ? 'neutral' : 'loss'} provenance={{ kind: 'observed', source: 'ledger minus reference' }} />
        <Stat label="Delta share" value={formatPercent(r.totalDeltaPct, 3)} tone={r.pass ? 'gain' : 'loss'} provenance={{ kind: 'observed', source: 'of sum of absolute net P&L, limit 1%' }} />
      </div>
      <p className={r.pass ? 'text-[14px] text-gain' : 'text-[14px] text-loss'}>
        {r.pass ? 'Pass: total delta is within 1% and every symbol is within 2%.' : `Fail: ${r.reason ?? 'delta is over the limit'}. Proposals are paused for this history.`}
      </p>
      <DataTable
        caption="Reconciliation by symbol"
        rows={r.perSymbol}
        rowKey={(s) => s.symbol}
        emptyState={<StateBlock variant="empty" title="No symbols to compare" />}
        columns={[
          { key: 'symbol', header: 'Symbol', cell: (s) => s.symbol },
          { key: 'ours', header: 'Ledger', align: 'right', mono: true, cell: (s) => signedMoney(s.ours) },
          { key: 'ref', header: 'Reference', align: 'right', mono: true, cell: (s) => signedMoney(s.reference) },
          { key: 'delta', header: 'Delta', align: 'right', mono: true, cell: (s) => signedMoney(s.delta) },
          { key: 'pct', header: 'Delta share', align: 'right', mono: true, cell: (s) => formatPercent(s.deltaPct, 3) },
          { key: 'pass', header: 'Within 2%', cell: (s) => (s.pass ? 'yes' : 'no') },
        ]}
      />
    </div>
  );
}

function Flags({ desk }: { desk: ReadyDesk }) {
  const { flags } = desk.analysis.ledger;
  const { ingest } = desk.analysis;
  const items: string[] = [];
  if (flags.incomplete) for (const reason of flags.incompleteReasons) items.push(reason);
  if (flags.weakIdCount > 0) items.push(`${formatCount(flags.weakIdCount)} fills have no exchange execution id and use a hash id instead.`);
  if (ingest.duplicatesDropped > 0) items.push(`${formatCount(ingest.duplicatesDropped)} duplicate fills were dropped on execution id.`);
  if (items.length === 0) {
    return <StateBlock variant="success" title="No incomplete-data flags" body="Every position closed, every fill has an id, and no funding window is missing." />;
  }
  return (
    <div className="space-y-3">
      <StateBlock variant="partial" title={flags.incomplete ? 'This ledger is marked incomplete' : 'Notes on this ledger'} />
      <ul className="list-disc space-y-1 pl-5 text-[14px]">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

function LedgerBody({ desk }: { desk: ReadyDesk }) {
  const { analysis, source, history } = desk;
  const { ledger } = analysis;
  const trips = ledger.roundTrips;

  if (history.fills.length === 0 && trips.length === 0) {
    return (
      <StateBlock
        variant="empty"
        title="This account has no fills in the window"
        body="The source answered, and it holds no fills for the last 90 days. That is a real empty history, not an error. Trade on Bitget and sync again, or load a sample."
      />
    );
  }

  const net = str(sum(trips.map((t) => t.netPnl)));
  const fees = str(sum(trips.map((t) => t.fees)));
  const funding = str(sum(trips.map((t) => t.funding)));
  const wins = trips.filter((t) => D(t.netPnl).gt(0)).length;
  const provenance = { kind: 'observed' as const, source: source.label, n: trips.length };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Round trips" value={formatCount(trips.length)} provenance={provenance} />
        <Stat label="Net P&L" value={signedMoney(net)} unit="USDT" tone={num(net) > 0 ? 'gain' : num(net) < 0 ? 'loss' : 'neutral'} provenance={provenance} />
        <Stat label="Fees" value={money(fees)} unit="USDT" provenance={provenance} />
        <Stat label="Funding" value={analysis.sessionLens.funding.total === null ? 'not in data' : signedMoney(funding)} unit={analysis.sessionLens.funding.total === null ? undefined : 'USDT'} provenance={provenance} />
        <Stat label="Win rate" value={trips.length === 0 ? 'n/a' : formatPercent(wins / trips.length, 0)} provenance={provenance} />
      </div>

      <SectionCard label="01 / Reconciliation" title="Ledger against Bitget">
        <Reconciliation desk={desk} />
      </SectionCard>

      <SectionCard label="02 / Flags" title="Incomplete-data flags">
        <Flags desk={desk} />
      </SectionCard>

      <section aria-labelledby="trips-h" className="space-y-3">
        <div className="label">03 / Round trips</div>
        <h2 id="trips-h" className="text-[22px]">
          Round trips
        </h2>
        <SortableTable
          caption="Round trips, sortable by any column with a sort button"
          rows={trips}
          rowKey={(t) => t.id}
          columns={tripColumns(desk)}
          initialSort={{ key: 'closeTs', direction: 'desc' }}
          emptyState={<StateBlock variant="empty" title="No closed round trips yet" body="Fills exist, but no position has closed. Open positions are listed below." />}
        />
      </section>

      <SectionCard label="04 / Open" title="Open positions">
        {ledger.flags.openPositions.length === 0 ? (
          <p className="text-[14px] text-muted">No position is open at the end of this history.</p>
        ) : (
          <DataTable
            caption="Open positions at the end of the history"
            rows={ledger.flags.openPositions}
            rowKey={(p) => `${p.symbol}|${p.side}`}
            emptyState={null}
            columns={[
              { key: 's', header: 'Symbol', cell: (p) => p.symbol },
              { key: 'side', header: 'Side', cell: (p) => p.side },
              { key: 'qty', header: 'Open qty', align: 'right', mono: true, cell: (p) => p.qty },
            ]}
          />
        )}
      </SectionCard>
    </div>
  );
}

export function LedgerView() {
  return <DeskGate>{(desk) => <LedgerBody desk={desk} />}</DeskGate>;
}
