'use client';

import { ArrowRight, Compass, ListChecks, Plus } from 'lucide-react';
import { num, str, sum } from '@holdout/engine';
import { ButtonLink } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Stat } from '@/components/ui/stat';
import { StateBlock } from '@/components/ui/state-block';
import { DeskGate, type ReadyDesk } from '@/components/desk/gate';
import { SectionCard } from '@/components/desk/section-card';
import { costOfBreaking, STATUS_LABEL } from '@/lib/desk/rule-view';
import { money, signedMoney } from '@/lib/desk/display';
import { formatCount } from '@/lib/format';

export interface NextAction {
  href: string;
  label: string;
  reason: string;
}

export function nextActionFor(desk: Pick<ReadyDesk, 'analysis' | 'rules' | 'decisions'>): NextAction {
  const { analysis, rules, decisions } = desk;
  if (analysis.ledger.roundTrips.length === 0) {
    return { href: '/desk/import', label: 'Import a history', reason: 'There are no closed round trips to audit yet.' };
  }
  if (analysis.holdoutBlockedReason) {
    return { href: '/desk/ledger', label: 'Review the ledger', reason: analysis.holdoutBlockedReason };
  }
  if (rules.length === 0) {
    return { href: '/desk/rules', label: 'Say your rules', reason: 'Add the rules you try to follow and see what breaking them cost.' };
  }
  const freeze = analysis.holdout?.freeze;
  if (analysis.holdout?.verdict === 'ADOPT_WORTHY' && freeze && !Object.keys(decisions).length) {
    return { href: '/desk/proposals', label: 'Review the proposal', reason: 'A rule beat the random sham on trades it never saw. The call is yours.' };
  }
  return { href: '/desk/check', label: 'Check a trade', reason: 'Test the next idea against your rulebook before you place it.' };
}

function HomeBody({ desk }: { desk: ReadyDesk }) {
  const { analysis, source, rules } = desk;
  const trips = analysis.ledger.roundTrips;
  const net = str(sum(trips.map((t) => t.netPnl)));
  const next = nextActionFor(desk);
  const provenance = { kind: 'observed' as const, source: source.label, n: trips.length };
  const audits = rules.flatMap((r) => {
    const a = analysis.audits[r.id];
    return a ? [{ item: r, audit: a }] : [];
  });
  const rec = analysis.reconciliation;

  return (
    <div className="space-y-8">
      <SectionCard label="Next action" title={next.label} icon={Compass}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-[60ch] text-[15px]">{next.reason}</p>
          <ButtonLink href={next.href}>
            {next.label}
            <Icon icon={ArrowRight} />
          </ButtonLink>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Round trips" value={formatCount(trips.length)} provenance={provenance} />
        <Stat label="Net P&L" value={signedMoney(net)} unit="USDT" tone={num(net) > 0 ? 'gain' : num(net) < 0 ? 'loss' : 'neutral'} provenance={provenance} />
        <Stat
          label="Reconciliation"
          value={rec.referenceRows === 0 ? 'not run' : rec.pass ? 'pass' : 'fail'}
          tone={rec.referenceRows === 0 ? 'neutral' : rec.pass ? 'gain' : 'loss'}
          provenance={{ kind: 'observed', source: rec.referenceRows === 0 ? 'no reference positions' : `delta ${money(rec.totalDelta)} USDT`, n: rec.referenceRows }}
        />
        <Stat label="Holdout verdict" value={analysis.holdout ? analysis.holdout.verdict.replace('_', ' ').toLowerCase() : 'paused'} provenance={{ kind: 'observed', source: 'in-browser run', n: trips.length }} />
      </div>

      <SectionCard label="Latest audit" title="Your rules on trial" icon={ListChecks}>
        {rules.length === 0 ? (
          <StateBlock variant="empty" title="No rules on trial" body="Add a rule in plain language and Holdout prices every time you broke it." action={
              <ButtonLink href="/desk/rules" size="sm">
                <Icon icon={Plus} />
                Add rules
              </ButtonLink>
            } />
        ) : audits.length === 0 ? (
          <StateBlock variant="loading" title="Auditing your rules" />
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line">
            {audits.map(({ item, audit }) => {
              const effect = costOfBreaking(audit);
              return (
                <li key={item.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-baseline sm:justify-between">
                  <span className="text-[14px]">{audit.rendered}</span>
                  <span className="num shrink-0 text-[12px] text-muted">
                    {STATUS_LABEL[audit.status]}, broken {audit.breaks}x{effect ? `, cost ${signedMoney(String(effect.value))} USDT` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

export function HomeView() {
  return <DeskGate>{(desk) => <HomeBody desk={desk} />}</DeskGate>;
}
