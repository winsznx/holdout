'use client';

import { ArrowRight, BookOpenCheck, Check, Gavel, Info, ListFilter, Scissors, Split, TestTube2, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  ALPHA,
  MAX_RATE,
  MIN_AFFECTED_TRAIN,
  MIN_RATE,
  MIN_TEST,
  MIN_TRAIN,
  MIN_TRIPS,
  SHAM_DRAWS,
  renderRule,
  ruleId,
  type Candidate,
  type HoldoutOutcome,
} from '@holdout/engine';
import { Button, ButtonLink, DataTable, Icon, ProvenanceBadge, Stat, StateBlock, Timeline, VerdictChip, type TimelineSegment } from '@/components/ui';
import { DeskGate, type ReadyDesk } from '@/components/desk/gate';
import { DeskSummary } from '@/components/desk/desk-summary';
import { SectionCard } from '@/components/desk/section-card';
import { ShamHistogram } from '@/components/desk/sham-histogram';
import { formatTs, signedMoney } from '@/lib/desk/display';
import { formatCount, formatPercent } from '@/lib/format';

const VERDICT_LABEL: Record<HoldoutOutcome['verdict'], string> = {
  ADOPT_WORTHY: 'Adopt-worthy',
  NO_RULE_NEEDED: 'No rule needed',
  INSUFFICIENT: 'Not enough trades',
};

function Thresholds() {
  return (
    <SectionCard label="Thresholds" title="What a proposal needs before it is shown" icon={ListFilter}>
      <ul className="list-disc space-y-1 pl-5 text-[14px]">
        <li>At least {MIN_TRIPS} closed round trips in total.</li>
        <li>
          Train set of at least {MIN_TRAIN} and test set of at least {MIN_TEST}. The first two thirds by close time are train, the last third is test.
        </li>
        <li>A candidate must change at least {MIN_AFFECTED_TRAIN} train trades, and between {formatPercent(MIN_RATE, 0)} and {formatPercent(MAX_RATE, 0)} of them.</li>
        <li>Only the candidate with the best train gain is tested. The other two are shown for reference.</li>
        <li>
          The test gain must be positive and beat {formatCount(SHAM_DRAWS)} same-size random sham draws at p of {ALPHA} or less.
        </li>
      </ul>
    </SectionCard>
  );
}

function CandidateTable({ items, caption }: { items: Candidate[]; caption: string }) {
  return (
    <DataTable
      caption={caption}
      rows={items}
      rowKey={(c) => ruleId(c.rule)}
      emptyState={<p className="text-[14px] text-muted">No candidate passed the filters.</p>}
      columns={[
        { key: 'rule', header: 'Rule', cell: (c) => <span className="whitespace-normal">{renderRule(c.rule)}</span> },
        { key: 'gain', header: 'Train gain', align: 'right', mono: true, cell: (c) => signedMoney(String(c.deltaTrain)) },
        { key: 'n', header: 'Train trades changed', align: 'right', mono: true, cell: (c) => `${c.affectedTrain} (${formatPercent(c.rate, 1)})` },
      ]}
    />
  );
}

function Selection({ outcome }: { outcome: HoldoutOutcome }) {
  const sel = outcome.selection;
  if (!sel) return null;
  const skipped = sel.candidates.filter((c) => !c.eligible);
  return (
    <SectionCard label="Train only" title="Top 3 train candidates" icon={Scissors}>
      <div className="space-y-4">
        <p className="text-[13px] text-muted">
          Selection saw the train trades only. Filters: changes at least {MIN_AFFECTED_TRAIN} train trades, between {formatPercent(MIN_RATE, 0)} and {formatPercent(MAX_RATE, 0)} of them, positive train gain.{' '}
          {sel.candidates.length} candidates were tried, {sel.candidates.length - skipped.length} passed the filters.
        </p>
        <CandidateTable items={sel.top3} caption="Top three train candidates by train gain" />
        {skipped.length > 0 ? (
          <details>
            <summary className="label cursor-pointer select-none hover:text-ink">Show the {skipped.length} skipped candidates and why</summary>
            <ul className="mt-3 space-y-1.5 text-[13px]">
              {skipped.map((c) => (
                <li key={ruleId(c.rule)}>
                  <span>{renderRule(c.rule)}</span> <span className="text-muted">Skipped: {c.skippedReason}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </SectionCard>
  );
}

function Decision({ desk, outcome }: { desk: ReadyDesk; outcome: HoldoutOutcome }) {
  const freeze = outcome.freeze;
  const [busy, setBusy] = useState(false);
  if (!freeze) return null;
  const id = ruleId(freeze.rule);
  const decided = desk.decisions[id];
  const canAdopt = outcome.verdict === 'ADOPT_WORTHY';
  const act = async (d: 'adopted' | 'rejected') => {
    setBusy(true);
    await desk.decideProposal(id, d);
    setBusy(false);
  };
  return (
    <SectionCard label="Your call" title="Adopt or reject this rule" icon={Gavel}>
      <div className="space-y-3">
        <p className="text-[16px] font-medium">{renderRule(freeze.rule)}</p>
        {decided ? (
          <p className="text-[14px]">
            You {decided === 'adopted' ? 'adopted' : 'rejected'} this rule. It is saved in rulebook version {desk.versions.length}.{' '}
            <Link href="/desk/rulebook" className="underline underline-offset-4">
              Open the rulebook
            </Link>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void act('adopted')} disabled={busy || !canAdopt || decided === 'adopted'}>
            <Icon icon={Check} />
            Adopt
          </Button>
          <Button variant="secondary" onClick={() => void act('rejected')} disabled={busy || decided === 'rejected'}>
            <Icon icon={X} />
            Reject
          </Button>
        </div>
        {!canAdopt ? <p className="text-[13px] text-muted">Adopt is off because the verdict is {VERDICT_LABEL[outcome.verdict].toLowerCase()}. You can still reject it so the rulebook records the decision.</p> : null}
        <p className="text-[12px] text-muted">Holdout never places orders. Adopting writes a rulebook version in this browser.</p>
      </div>
    </SectionCard>
  );
}

function Result({ desk, outcome }: { desk: ReadyDesk; outcome: HoldoutOutcome }) {
  const t = outcome.test;
  const source = `in-browser run on ${desk.source.label}`;
  const trips = desk.analysis.ledger.roundTrips;
  const sorted = [...trips].sort((a, b) => a.closeTs - b.closeTs);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const dayLevel = desk.analysis.dayLevel;
  const segments: TimelineSegment[] =
    first && last
      ? [
          { id: 'train', label: 'Train', start: first.closeTs, end: outcome.splitTs, variant: 'train', caption: `${outcome.nTrain} trades, ${formatTs(first.closeTs, dayLevel)} to ${formatTs(outcome.splitTs, dayLevel)}` },
          { id: 'test', label: 'Test (held out)', start: outcome.splitTs, end: Math.max(last.closeTs, outcome.splitTs + 1), variant: 'test', caption: `${outcome.nTest} trades, to ${formatTs(last.closeTs, dayLevel)}` },
        ]
      : [];
  return (
    <>
      {segments.length > 0 ? (
        <SectionCard label="Split" title="Train and held-out test" icon={Split}>
          <Timeline segments={segments} label={`Timeline: ${outcome.nTrain} train trades then ${outcome.nTest} held-out test trades`} />
        </SectionCard>
      ) : null}

      <Selection outcome={outcome} />

      {t ? (
        <SectionCard label="Test" title="Did it help on trades it never saw" icon={TestTube2}>
          <div className="space-y-6">
            <p className="text-[16px] font-medium">{renderRule(t.rule)}</p>
            <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Gain on test" value={signedMoney(String(t.deltaTest))} unit="USDT" tone={t.deltaTest > 0 ? 'gain' : t.deltaTest < 0 ? 'loss' : 'neutral'} provenance={{ kind: 'observed', source, n: outcome.nTest }} />
              <Stat label="p-value" value={t.p.toFixed(3)} tone={t.p <= ALPHA ? 'gain' : 'neutral'} provenance={{ kind: 'observed', source: `${formatCount(SHAM_DRAWS)} sham draws` }} />
              <Stat label="Median sham gain" value={signedMoney(String(t.shamMedian))} unit="USDT" provenance={{ kind: 'observed', source: `random ${t.affectedTest} trades` }} />
              <Stat label="Test trades changed" value={formatCount(t.affectedTest)} provenance={{ kind: 'observed', source, n: outcome.nTest }} />
            </div>
            {t.untestable ? (
              <StateBlock variant="partial" title="The selected rule is untestable on the test trades" body={outcome.reason} />
            ) : (
              <>
                <div>
                  <div className="label mb-2">Sham distribution</div>
                  <p className="mb-2 max-w-[70ch] text-[13px] text-muted">
                    {t.shamDesign === 'remove_k_random'
                      ? `Each draw removes ${t.affectedTest} random test trades, the same number the rule removed, and records the gain.`
                      : `Each draw applies the same change to ${t.affectedTest} random test trades.`}{' '}
                    p is the share of draws, counted with one extra, that did at least as well as the rule.
                  </p>
                  <ShamHistogram draws={t.shamDraws} observed={t.deltaTest} median={t.shamMedian} />
                </div>
                <div>
                  <div className="label mb-2">Baseline</div>
                  {t.baseline.bucket ? (
                    <p className="text-[14px]">
                      Removing the worst train bucket, <span className="num">{t.baseline.bucket}</span> (train total {signedMoney(String(t.baseline.trainTotal))} USDT), would have changed the test by{' '}
                      <span className="num">{signedMoney(String(t.baseline.deltaTest))} USDT</span> across {t.baseline.removedTest} trades. The rule above changed it by{' '}
                      <span className="num">{signedMoney(String(t.deltaTest))} USDT</span>.
                    </p>
                  ) : (
                    <p className="text-[14px] text-muted">No train bucket had a negative total, so the baseline removes nothing.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </SectionCard>
      ) : null}
    </>
  );
}

function ProposalsBody({ desk }: { desk: ReadyDesk }) {
  const { analysis } = desk;
  const outcome = analysis.holdout;

  return (
    <div className="space-y-8">
      <DeskSummary desk={desk} />
      <div className="flex items-start gap-3 rounded-card border border-signal bg-surface px-4 py-3 text-[14px]">
        <Icon icon={Info} size={18} className="mt-0.5 text-signal" />
        <p>
          This is an in-browser run on your loaded history. It is not the pre-registered run. The pre-registered cohort result, with frozen rules and published seeds, is on the{' '}
          <Link href="/evidence" className="underline underline-offset-4">
            evidence page
          </Link>
          .
        </p>
      </div>

      {analysis.holdoutBlockedReason ? (
        <StateBlock
          variant="error"
          surface="Bitget positions history and financial records (S2)"
          title="Proposals are paused"
          body={
            <>
              {analysis.holdoutBlockedReason} Fix the ledger first, then come back.{' '}
              <Link href="/desk/ledger" className="underline underline-offset-4">
                Open the ledger
              </Link>
            </>
          }
        />
      ) : null}

      {outcome ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="label">Verdict</span>
            <VerdictChip verdict={outcome.verdict} />
            <ProvenanceBadge kind="observed" source={`${outcome.nTrips} closed round trips`} />
          </div>
          {outcome.verdict === 'INSUFFICIENT' ? (
            <StateBlock variant="empty" title="Not enough trades to propose a rule" body={`${outcome.reason}.`} />
          ) : (
            <p className="max-w-[70ch] text-[15px]">{outcome.reason[0]?.toUpperCase()}{outcome.reason.slice(1)}.</p>
          )}
          {outcome.verdict !== 'INSUFFICIENT' ? <Result desk={desk} outcome={outcome} /> : null}
          {outcome.verdict !== 'INSUFFICIENT' ? <Decision desk={desk} outcome={outcome} /> : null}
        </>
      ) : null}

      <Thresholds />

      {desk.analysis.dayLevel ? (
        <p className="text-[13px] text-muted">
          This history has day-level dates. Cooldown, session, earnings and leverage candidates are untestable here and are skipped by name above. They are not in this data.
        </p>
      ) : null}

      <ButtonLink href="/evidence" variant="secondary" size="sm">
        <Icon icon={BookOpenCheck} />
        See the pre-registered cohort result
        <Icon icon={ArrowRight} />
      </ButtonLink>
    </div>
  );
}

export function ProposalsView() {
  return <DeskGate>{(desk) => <ProposalsBody desk={desk} />}</DeskGate>;
}
