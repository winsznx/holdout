'use client';

import { useEffect, useState } from 'react';
import { ButtonLink, Card, CardBody, CardHeader, Container, PageHeading, StateBlock, Stat, Tag } from '@/components/ui';
import { Block } from './block';
import { AblationTable, CampaignTable, CompilerEval, FirewallStats, SpecificityMatrix } from './campaign-sections';
import { HashLine } from './hash-line';
import { FreezeTable, NullResults, ShamGrid, TraderVerdictTable } from './trader-sections';
import { formatSignedUsdt } from '@/lib/format';
import {
  BUNDLE_URL,
  EVIDENCE_BASE,
  bundleAvailable,
  campaignRows,
  cohortTitle,
  loadEvidenceData,
  loadFirewall,
  type Cohort,
  type EvidenceData,
} from '@/lib/evidence-data';
import { useLoaded } from '@/lib/use-loaded';
import { STRATEGY_SAMPLE_NOTICE } from '@/components/ui';

const SUMMARY_FILE = `${EVIDENCE_BASE}/summary.json`;

function CohortHeadline({ cohort }: { cohort: Cohort }) {
  const title = cohortTitle(cohort.cohort);
  const noTest = cohort.tested === 0;
  const headline = cohort.headline === 'audit' ? 'The audit is the result.' : 'Discovered rules helped on trades they never saw.';
  const body = noTest
    ? 'No trader in this cohort reached the test step with a testable rule, so the kill rule applies and the audit headline ships.'
    : cohort.headline === 'audit'
      ? 'The median gain on unseen trades did not clear the median of the random sham, or was not above zero. The kill rule withdrew the claim that discovered rules help.'
      : 'The median gain on unseen trades was above zero and above the median of the random sham, so the kill rule did not apply.';
  return (
    <Card>
      <CardHeader
        label={cohort.cohort === 'bitget-demo-bots' ? 'Cohort / Bitget Demo bot' : `Cohort / ${title}`}
        title={title}
        aside={cohort.cohort === 'bitget-demo-bots' ? <Tag kind="bot" /> : cohort.cohort === 'strategy-sample' ? <Tag kind="strategy-sample" /> : null}
      />
      <CardBody className="space-y-4">
        <p className="text-[22px] leading-snug font-medium">{headline}</p>
        <p className="max-w-[64ch] text-[14px] text-muted">{body}</p>
        {cohort.cohort === 'strategy-sample' ? <p className="text-[12px] text-muted">{STRATEGY_SAMPLE_NOTICE}</p> : null}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Traders" value={String(cohort.traders)} provenance={{ kind: 'observed', source: SUMMARY_FILE, n: cohort.traders }} />
          <Stat label="Tested" value={String(cohort.tested)} provenance={{ kind: 'observed', source: SUMMARY_FILE, n: cohort.tested }} />
          <Stat
            label="Median test delta"
            value={cohort.medianDeltaTest === null ? 'none' : formatSignedUsdt(cohort.medianDeltaTest)}
            unit={cohort.medianDeltaTest === null ? undefined : 'USDT'}
            provenance={{ kind: 'observed', source: SUMMARY_FILE, n: cohort.tested }}
          />
          <Stat
            label="Median sham median"
            value={cohort.medianShamMedian === null ? 'none' : formatSignedUsdt(cohort.medianShamMedian)}
            unit={cohort.medianShamMedian === null ? undefined : 'USDT'}
            provenance={{ kind: 'observed', source: SUMMARY_FILE, n: cohort.tested }}
          />
        </div>
        <p className="num text-[12px] text-muted">
          Adopt worthy: {cohort.adoptWorthy} of {cohort.traders}. Kill rule applied: {cohort.killRuleApplied ? 'yes' : 'no'}.
        </p>
      </CardBody>
    </Card>
  );
}

function EvidenceBody({ data }: { data: EvidenceData }) {
  const firewall = useLoaded(loadFirewall);
  const [bundle, setBundle] = useState<boolean | null>(null);
  useEffect(() => {
    let current = true;
    void bundleAvailable().then((ok) => {
      if (current) setBundle(ok);
    });
    return () => {
      current = false;
    };
  }, []);
  const { manifest } = data;
  const dataHashes = Object.entries(manifest.dataHashes);
  return (
    <div className="space-y-14">
      <section className="space-y-4" aria-label="Cohort results">
        <p className="max-w-[66ch] text-[14px] text-muted">
          Each cohort is judged on its own and never merged with another. Bitget Demo bots test detection power and false positive control. They are not evidence about human traders.
        </p>
        {data.cohorts.length === 0 ? (
          <StateBlock variant="empty" title="No cohort summary in the evaluation file" body="cohorts[] is empty." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.cohorts.map((c) => (
              <CohortHeadline key={c.cohort} cohort={c} />
            ))}
          </div>
        )}
      </section>

      <Block label="01 / Verdicts" title="Per trader verdicts" intro="One row per trader. Open a trader for the audit, every candidate considered and the full holdout record.">
        <TraderVerdictTable results={data.results} />
      </Block>

      <Block
        label="02 / Freeze"
        title="Freeze hashes and pre-registration"
        intro="The selected rule is hashed and committed before the test step runs. The pre-registration file is hashed in the run manifest."
      >
        <Card>
          <CardBody>
            <dl className="grid gap-4 sm:grid-cols-2">
              <HashLine label="PREREG.md sha256" value={manifest.preregSha256} />
              <HashLine label="Code commit" value={manifest.commit} />
              <HashLine label="Run id" value={manifest.runId} />
              <HashLine label="Published at" value={manifest.createdAt} />
              <HashLine label="Runtime" value={`${manifest.node}, ${manifest.pnpm}`} />
              <HashLine label="Seeds" value={manifest.seeds} />
            </dl>
          </CardBody>
        </Card>
        <FreezeTable results={data.results} />
        <details className="rounded-card border border-line bg-surface">
          <summary className="label cursor-pointer px-4 py-3 select-none">Raw data hashes ({dataHashes.length})</summary>
          <dl className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
            {dataHashes.map(([name, hash]) => (
              <HashLine key={name} label={name} value={hash} />
            ))}
          </dl>
        </details>
      </Block>

      <Block
        label="03 / Sham"
        title="Sham distributions"
        intro="Each bar chart shows the gain from 1,000 random rules of the same size on the same unseen trades. The orange line is the frozen rule."
      >
        <ShamGrid results={data.results} />
      </Block>

      <Block label="04 / Campaign" title="Tests P1 to P9" intro="Every test is listed with its status and reason. A test that did not run says so.">
        <CampaignTable rows={campaignRows(data)} />
      </Block>

      <Block label="05 / Specificity" title="Bot by rule matrix" intro="Bitget Demo bots with a planted leak. A flag outside the outlined cell is a false positive.">
        <SpecificityMatrix p1b={data.campaign.p1b} />
      </Block>

      <Block label="06 / Ablation" title="What the sponsor data adds (P7)" intro="The same probes rerun with market and calendar sources switched off.">
        <AblationTable p7={data.campaign.p7} />
      </Block>

      <Block label="07 / Firewall" title="Numbers firewall" intro="Every digit in model written text must come from an engine slot. A failed message is replaced by a fixed template and counted here.">
        <FirewallStats state={firewall} />
      </Block>

      <Block label="08 / Nulls" title="Null results and rejected candidates" intro="Traders where no rule was adopted, and every candidate the selection step skipped, with the reason.">
        <NullResults results={data.results} />
      </Block>

      <Block label="09 / Compiler" title="Rule compiler (P9)">
        <CompilerEval p9={data.campaign.p9} />
      </Block>

      <Block label="10 / Verify" title="Check it yourself" intro="The bundle holds the raw fills, market data, freeze files and outputs. The command below recomputes every number on this page offline.">
        <div className="space-y-4">
          {bundle === false ? (
            <StateBlock variant="empty" title="The evidence bundle is not published yet" body={`${BUNDLE_URL} does not exist yet. It is produced by a separate script after the run.`} />
          ) : bundle === null ? (
            <StateBlock variant="loading" title="Checking for the evidence bundle" />
          ) : (
            <ButtonLink href={BUNDLE_URL} download variant="secondary">
              Download evidence/bundle.zip
            </ButtonLink>
          )}
          <pre className="num overflow-x-auto rounded-card border border-line bg-surface p-4 text-[13px] leading-relaxed">{`git clone <repo> && cd holdout
pnpm install
pnpm verify`}</pre>
          <p className="max-w-[66ch] text-[14px] text-muted">
            pnpm verify needs no network and no keys. It prints PASS or FAIL for the published results hash, the PREREG hash, every raw data hash, and each trader result, cohort summary and campaign test. It ends with a tamper test that changes one digit in one fill and must fail.
          </p>
        </div>
      </Block>
    </div>
  );
}

export function EvidencePage() {
  const state = useLoaded(loadEvidenceData);
  return (
    <Container className="space-y-10 py-10 sm:py-14">
      <PageHeading
        label="Evidence"
        title="Proof, including what did not work"
        intro="Every number here is read from the evaluation file. Nothing is typed in by hand. Null results and failed checks are shown with the rest."
      />
      {state.status === 'loading' ? <StateBlock variant="loading" title="Reading the evaluation file" /> : null}
      {state.status === 'absent' ? (
        <StateBlock
          variant="empty"
          title="The evaluation has not been published yet"
          body={`No file exists at ${SUMMARY_FILE}. Nothing is shown until the evaluation script writes it, and no placeholder numbers are used.`}
        />
      ) : null}
      {state.status === 'error' ? (
        <StateBlock variant="error" surface="Holdout data file" title="The evaluation file could not be read" body={`${SUMMARY_FILE}: ${state.message}`} />
      ) : null}
      {state.status === 'ok' ? <EvidenceBody data={state.data} /> : null}
    </Container>
  );
}
