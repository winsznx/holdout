import { num, str, sum } from '@holdout/engine';
import { Stat } from '@/components/ui';
import type { ReadyDesk } from '@/components/desk/gate';
import { money, signedMoney } from '@/lib/desk/display';
import { formatCount } from '@/lib/format';

type SummaryDesk = Pick<ReadyDesk, 'analysis' | 'rules' | 'source'>;

export function DeskSummary({ desk }: { desk: SummaryDesk }) {
  const { analysis, rules, source } = desk;
  const trips = analysis.ledger.roundTrips;
  const net = str(sum(trips.map((t) => t.netPnl)));
  const rec = analysis.reconciliation;
  const audited = rules.filter((r) => analysis.audits[r.id]);
  const priced = audited.filter((r) => analysis.audits[r.id]?.status === 'priced').length;
  const provenance = { kind: 'observed' as const, source: source.label, n: trips.length };

  return (
    <section aria-label="History summary" className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
      <div className="bg-surface p-4">
        <Stat label="Round trips" value={formatCount(trips.length)} provenance={provenance} />
      </div>
      <div className="bg-surface p-4">
        <Stat label="Net P&L" value={signedMoney(net)} unit="USDT" tone={num(net) > 0 ? 'gain' : num(net) < 0 ? 'loss' : 'neutral'} provenance={provenance} />
      </div>
      <div className="bg-surface p-4">
        <Stat
          label="Reconciliation delta"
          value={rec.referenceRows === 0 ? 'not run' : signedMoney(rec.totalDelta)}
          unit={rec.referenceRows === 0 ? undefined : 'USDT'}
          tone={rec.referenceRows === 0 ? 'neutral' : rec.pass ? 'gain' : 'loss'}
          provenance={{ kind: 'observed', source: rec.referenceRows === 0 ? 'no reference positions' : rec.pass ? `pass, ${money(rec.totalDelta)} within limit` : 'fail, over limit', n: rec.referenceRows || undefined }}
        />
      </div>
      <div className="bg-surface p-4">
        <Stat
          label="Breaks priced"
          value={rules.length === 0 ? 'no rules' : audited.length < rules.length ? 'auditing' : `${priced} of ${rules.length}`}
          provenance={{ kind: 'observed', source: rules.length === 0 ? 'add rules to price breaks' : 'rules with a priced cost', n: rules.length || undefined }}
        />
      </div>
    </section>
  );
}
