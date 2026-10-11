'use client';

import { ArrowLeft, Check, Gavel, ListChecks, Scale, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback } from 'react';
import { renderRule } from '@holdout/engine';
import { Card, CardBody, CardHeader, Container, Icon, PageHeading, StateBlock, Stat } from '@/components/ui';
import { formatCount, formatPercent, formatSignedUsdt } from '@/lib/format';
import { EVIDENCE_BASE, loadTraderResult, type TraderResult } from '@/lib/evidence-data';
import { useLoaded } from '@/lib/use-loaded';
import { Block } from './block';
import { KindTag, SampleNotice, VerdictLabel } from './common';
import { HashLine } from './hash-line';
import { AuditCards, CandidateTable } from './trader-sections';
import { ShamHistogram } from './sham-histogram';

function Detail({ result }: { result: TraderResult }) {
  const { outcome, recon } = result;
  const source = `${EVIDENCE_BASE}/${result.id}.json`;
  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-center gap-3">
        <KindTag kind={result.kind} />
        <VerdictLabel verdict={outcome.verdict} />
        <span className="text-[14px] text-muted">{result.blocked ?? outcome.reason}</span>
      </div>
      <SampleNotice kind={result.kind} />

      <Block label="01 / Ledger" icon={Scale} title="Ledger and reconciliation" intro="Our net P&L is compared with the exchange's own figure. A failing ledger stops proposals.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Round trips" value={formatCount(result.nTrips)} provenance={{ kind: 'observed', source, n: result.nTrips }} />
          <Stat label="Our net P&L" value={formatSignedUsdt(Number(recon.totalOurs))} unit="USDT" provenance={{ kind: 'observed', source, n: result.nTrips }} />
          <Stat label="Reference net P&L" value={formatSignedUsdt(Number(recon.totalReference))} unit="USDT" provenance={{ kind: 'observed', source }} />
          <Stat label="Delta" value={formatPercent(recon.totalDeltaPct, 2)} tone={recon.pass ? 'neutral' : 'loss'} provenance={{ kind: 'observed', source }} />
        </div>
        <p className={recon.pass ? 'flex items-center gap-2 text-[14px] text-gain' : 'flex items-center gap-2 text-[14px] text-loss'}>
          <Icon icon={recon.pass ? Check : X} />
          {recon.pass ? 'Reconciliation passed.' : `Reconciliation failed: ${recon.reason ?? 'no reason recorded'}.`}
        </p>
      </Block>

      <Block label="02 / Audit" icon={ListChecks} title="Stated rules" intro="How often each rule was broken and what the broken trades cost, with a 90% interval.">
        <AuditCards result={result} />
      </Block>

      <Block label="03 / Holdout" icon={Gavel} title="Selection on train, one test on unseen trades">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Train trades" value={formatCount(outcome.nTrain)} provenance={{ kind: 'observed', source, n: outcome.nTrain }} />
          <Stat label="Test trades" value={formatCount(outcome.nTest)} provenance={{ kind: 'observed', source, n: outcome.nTest }} />
          <Stat label="Total" value={formatCount(outcome.nTrips)} provenance={{ kind: 'observed', source, n: outcome.nTrips }} />
        </div>
        {outcome.selection ? (
          <CandidateTable candidates={outcome.selection.candidates} />
        ) : (
          <StateBlock variant="empty" title="No selection step was run" body={result.blocked ?? outcome.reason} />
        )}
        {outcome.freeze ? (
          <Card>
            <CardHeader label="Freeze" title={renderRule(outcome.freeze.rule)} />
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-2">
                <HashLine label="Freeze sha256" value={outcome.freeze.sha256} />
                <HashLine label="Code commit" value={outcome.freeze.codeCommit} />
                <HashLine label="Frozen at" value={outcome.freeze.timestamp} />
                <HashLine label="Train gain, affected trades" value={`${formatSignedUsdt(outcome.freeze.trainStats.deltaTrain)} USDT, ${outcome.freeze.trainStats.affectedTrain}`} />
              </dl>
            </CardBody>
          </Card>
        ) : null}
        {outcome.test ? (
          <Card>
            <CardHeader label="Test" title={renderRule(outcome.test.rule)} />
            <CardBody className="space-y-4">
              {outcome.test.untestable ? (
                <p className="text-[14px]">The frozen rule is untestable on the test trades, so no delta is reported.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Stat label="Test delta" value={formatSignedUsdt(outcome.test.deltaTest)} unit="USDT" tone={outcome.test.deltaTest > 0 ? 'gain' : outcome.test.deltaTest < 0 ? 'loss' : 'neutral'} provenance={{ kind: 'observed', source, n: outcome.nTest }} />
                    <Stat label="Trades affected" value={formatCount(outcome.test.affectedTest)} provenance={{ kind: 'observed', source, n: outcome.nTest }} />
                    <Stat label="p against sham" value={outcome.test.p.toFixed(3)} provenance={{ kind: 'observed', source }} />
                    <Stat label="Sham median" value={formatSignedUsdt(outcome.test.shamMedian)} unit="USDT" provenance={{ kind: 'observed', source }} />
                  </div>
                  <ShamHistogram draws={outcome.test.shamDraws} observed={outcome.test.deltaTest} label={`Sham distribution for ${result.label}`} />
                  <p className="text-[14px] text-muted">
                    Baseline that removes the worst train bucket:{' '}
                    {outcome.test.baseline.bucket
                      ? `${outcome.test.baseline.bucket} removed ${outcome.test.baseline.removedTest} test trades for ${formatSignedUsdt(outcome.test.baseline.deltaTest)} USDT.`
                      : 'no train bucket lost money, so nothing was removed.'}
                  </p>
                </>
              )}
            </CardBody>
          </Card>
        ) : (
          <StateBlock variant="empty" title="The test step did not run for this trader" body={outcome.reason} />
        )}
      </Block>
    </div>
  );
}

export function TraderPage({ traderId }: { traderId: string }) {
  const load = useCallback(() => loadTraderResult(traderId), [traderId]);
  const state = useLoaded(load);
  return (
    <Container className="space-y-10 py-10 sm:py-14">
      <div>
        <Link href="/evidence" className="label inline-flex items-center gap-1.5 hover:text-ink">
          <Icon icon={ArrowLeft} />
          Evidence / all traders
        </Link>
      </div>
      <PageHeading label="Evidence / Trader" title={state.status === 'ok' ? state.data.label : traderId} />
      {state.status === 'loading' ? <StateBlock variant="loading" title="Reading the trader file" /> : null}
      {state.status === 'absent' ? (
        <StateBlock
          variant="empty"
          title="No published result for this trader"
          body={`No file exists at ${EVIDENCE_BASE}/${traderId}.json. The evaluation has not been published yet, or this trader id is not in it.`}
        />
      ) : null}
      {state.status === 'error' ? (
        <StateBlock variant="error" surface="Holdout data file" title="The trader file could not be read" body={state.message} />
      ) : null}
      {state.status === 'ok' ? <Detail result={state.data} /> : null}
    </Container>
  );
}
