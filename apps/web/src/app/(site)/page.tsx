import {
  ArrowRight,
  Ban,
  BookMarked,
  Calculator,
  Clock,
  FileCheck,
  GraduationCap,
  FlaskConical,
  KeyRound,
  Lightbulb,
  ListChecks,
  Lock,
  MessageSquareText,
  Plug,
  Receipt,
  ScanSearch,
  Scale,
  Split,
  Table2,
  TrendingUp,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { HeroRuleCard } from '@/components/hero-rule-card';
import { EvidenceSummaryView } from '@/components/evidence-summary';
import { Scoreboard } from '@/components/evidence/scoreboard';
import { ButtonLink, Container, Icon, IconBox, Section, Stat, Timeline } from '@/components/ui';
import { loadEvidenceSummary } from '@/lib/evidence';
import { EvidenceSummarySchema } from '@/lib/evidence-data';
import { formatCount, formatSignedUsdt } from '@/lib/format';
import { auditSample, loadDefaultSample, sampleFacts, type SampleFacts } from '@/lib/samples';

export const dynamic = 'force-static';

interface Tile {
  title: string;
  text: string;
  icon: LucideIcon;
}

const STEPS: readonly Tile[] = [
  { title: 'Import', text: 'Drop a Bitget CSV or sync with a read-only key. Parsing happens in your browser.', icon: Upload },
  { title: 'Say your rules', text: 'Write them in plain words. Holdout shows the compiled rule back so you can confirm it.', icon: MessageSquareText },
  { title: 'See what breaking them cost', text: 'Every break is listed with its trade ids, the dollar cost and an interval.', icon: Receipt },
  { title: 'Test proposals on unseen weeks', text: 'A rule is chosen on your earlier trades and tested once on your later ones, against random rules of the same size.', icon: Split },
  { title: 'Check the next trade', text: 'Describe an idea and get one card with the rules it breaks. You decide.', icon: ScanSearch },
];

const FEATURES: readonly Tile[] = [
  { title: 'Audit', text: 'Stated rules against your real fills, with the cost of each break.', icon: ListChecks },
  { title: 'Proposals', text: 'New rules tested on trades they never saw, kept only if they beat random.', icon: Lightbulb },
  { title: 'Session lens', text: 'Profit and loss by US session, across the open and the weekend, stock perp against rToken.', icon: Clock },
  { title: 'Check a trade', text: 'A pre-trade card from your rulebook, session state and market tags.', icon: ScanSearch },
  { title: 'Skill for your agent', text: 'Your rulebook inside Claude Code, Codex, OpenClaw or Cursor, read only.', icon: Plug },
];

const DELIVERABLES: readonly Tile[] = [
  { title: 'A ledger that reconciles', text: 'Round trips built from your fills and compared with the exchange figure. A ledger that fails the check stops proposals.', icon: Scale },
  { title: 'A price on every break', text: 'Each stated rule shows how often it was broken and what those trades cost, with a 90% interval.', icon: Calculator },
  { title: 'A verdict on unseen trades', text: 'One frozen rule, tested once on the held-out third, against a random sham. Null results are shown.', icon: FlaskConical },
  { title: 'A rulebook file with a hash', text: 'Export the rulebook as JSON with its sha256, then hand it to your agent through the Skill.', icon: BookMarked },
];

const TRUST: readonly Tile[] = [
  { title: 'Holdout never places orders', text: 'The product has no code path that does.', icon: Ban },
  { title: 'CSV stays in your browser', text: 'Parsed in a Web Worker on your device.', icon: Lock },
  { title: 'Read-only keys', text: 'A key with trade or withdraw permission is refused when Bitget exposes it.', icon: KeyRound },
  { title: 'Every number recomputed by pnpm verify', text: 'Offline, no keys, PASS or FAIL for each result.', icon: FileCheck },
];

function GlanceStrip({ facts, published }: { facts: SampleFacts | null; published: { traders: number; cohorts: number } | null }) {
  const rec = facts?.reconciliation ?? null;
  const sampleSource = '/data/samples/default.json';
  const evidenceSource = '/data/evidence/summary.json';
  return (
    <section aria-label="At a glance" className="space-y-3">
      <div className="label flex items-center gap-2">
        <Icon icon={Table2} />
        At a glance{facts ? `, ${facts.label}` : ''}
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-4 [&>*]:bg-surface [&>*]:p-4">
        <div>
          <Stat
            label="Closed round trips"
            value={facts ? formatCount(facts.closedTrips) : 'not published'}
            provenance={{ kind: 'observed', source: sampleSource, n: facts?.fills }}
          />
        </div>
        <div>
          <Stat
            label="Reconciliation delta"
            value={rec ? formatSignedUsdt(Number(rec.totalDelta)) : 'not run'}
            unit={rec ? 'USDT' : undefined}
            tone={rec ? (rec.pass ? 'gain' : 'loss') : 'neutral'}
            provenance={{ kind: 'observed', source: rec ? (rec.pass ? 'pass, ledger against reference' : 'fail, over the limit') : 'no reference positions in this sample', n: rec?.referenceRows }}
          />
        </div>
        <div>
          <Stat
            label="Traders in the evaluation"
            value={published ? formatCount(published.traders) : 'not published'}
            provenance={{ kind: 'observed', source: evidenceSource, n: published?.cohorts }}
          />
        </div>
        <div>
          <Stat label="Fills read" value={facts ? formatCount(facts.fills) : 'not published'} provenance={{ kind: 'observed', source: sampleSource }} />
        </div>
      </div>
    </section>
  );
}

function TrustRow() {
  return (
    <ul aria-label="What Holdout promises" className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
      {TRUST.map((t) => (
        <li key={t.title} className="flex items-start gap-3 bg-surface p-4">
          <Icon icon={t.icon} size={18} className="mt-0.5 text-signal" />
          <div className="min-w-0">
            <p className="text-[14px] leading-snug font-medium">{t.title}</p>
            <p className="mt-1 text-[12px] text-muted">{t.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function Landing() {
  const [sample, evidence] = await Promise.all([loadDefaultSample(), loadEvidenceSummary()]);
  const hero = sample.status === 'ok' ? auditSample(sample.data) : null;
  const facts = sample.status === 'ok' ? sampleFacts(sample.data) : null;
  const parsed = evidence.status === 'ok' ? EvidenceSummarySchema.safeParse(evidence.data) : null;
  const published = parsed?.success ? { traders: parsed.data.cohorts.reduce((n, c) => n + c.traders, 0), cohorts: parsed.data.cohorts.length } : null;

  return (
    <>
      <Container className="grid gap-10 py-12 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-14">
        <div>
          <div className="label mb-5">Trading journal for Bitget traders</div>
          <h1 className="text-[38px] leading-[1.05] sm:text-[56px] sm:leading-[1.02]">A trading journal that proves which rules make you money.</h1>
          <p className="mt-5 max-w-[46ch] text-[17px] text-muted sm:text-[18px]">Your Bitget fills, your rules, tested on trades they never saw.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/sample">
              Try the sample
              <Icon icon={ArrowRight} />
            </ButtonLink>
            <ButtonLink href="/desk/import" variant="secondary">
              <Icon icon={Upload} />
              Bring your history
            </ButtonLink>
          </div>
          <p className="mt-6 flex items-center gap-2 text-[13px] text-muted">
            <Icon icon={Ban} />
            Holdout never places orders. The trader makes every decision.
          </p>
        </div>
        <HeroRuleCard sample={sample} hero={hero} />
      </Container>

      <Container className="space-y-6 pb-14 sm:pb-20">
        <GlanceStrip facts={facts} published={published} />
        <TrustRow />
      </Container>

      <Section index="01" label="Problem" title="Traders repeat expensive habits. Nothing proves which rule fixes them.">
        <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-2">
          <article className="space-y-3 bg-surface p-5">
            <div className="label flex items-center gap-2">
              <Icon icon={GraduationCap} />
              Research
            </div>
            <p className="text-[16px]">
              In a study of day traders on the Taiwan stock market from 1992 to 2006, Barber, Lee, Liu and Odean found that less than 1% of day traders predictably and reliably earned positive abnormal returns net of fees.
            </p>
            <a
              className="num block text-[12px] text-muted underline underline-offset-4 hover:text-ink"
              href="https://escholarship.org/uc/item/7k75v0qx"
            >
              Barber, Lee, Liu and Odean (2014), The cross-section of speculator skill: Evidence from day trading, Journal of Financial Markets 18(1)
            </a>
          </article>
          <article className="space-y-3 bg-surface p-5">
            <div className="label flex items-center gap-2">
              <Icon icon={TrendingUp} />
              Bitget, July 2026
            </div>
            <p className="text-[16px]">
              Bitget reported more than 100,000 users trading rTokens in July 2026, and that 42.87% of first-time rToken buyers increased their positions within seven days.
            </p>
            <a
              className="num block text-[12px] text-muted underline underline-offset-4 hover:text-ink"
              href="https://www.bitget.com/blog/articles/july-2026-transparency-report-tokenized-market-adoption"
            >
              Bitget, July 2026 transparency report (published August 10, 2026)
            </a>
          </article>
        </div>
      </Section>

      <Section index="02" label="Workflow" title="From fills to a tested rulebook in five steps.">
        <ol className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="bg-surface p-4">
              <div className="flex items-center justify-between">
                <IconBox icon={s.icon} />
                <span className="num text-[12px] text-signal">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <h3 className="mt-4 text-[16px] leading-snug">{s.title}</h3>
              <p className="mt-2 text-[13px] text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 max-w-[560px]">
          <Timeline
            label="History split in two parts. The earlier two thirds are used to choose a rule. The later third is held out."
            segments={[
              { id: 'train', label: 'Earlier two thirds', start: 0, end: 2, variant: 'train', caption: 'choose the rule here' },
              { id: 'test', label: 'Held-out third', start: 2, end: 3, variant: 'test', caption: 'tested once, never seen' },
            ]}
          />
        </div>
      </Section>

      <Section index="03" label="What you get" title="Four things you can check.">
        <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
          {DELIVERABLES.map((d) => (
            <article key={d.title} className="flex items-start gap-4 bg-surface p-5">
              <IconBox icon={d.icon} />
              <div className="min-w-0">
                <h3 className="text-[16px] leading-snug">{d.title}</h3>
                <p className="mt-1.5 text-[13px] text-muted">{d.text}</p>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section index="04" label="What it does" title="Five tools on one ledger.">
        <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-surface p-4">
              <IconBox icon={f.icon} />
              <h3 className="mt-4 text-[16px] leading-snug">{f.title}</h3>
              <p className="mt-2 text-[13px] text-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        index="05"
        label="Evidence"
        title="The test results, including the nulls."
        intro="Every rule is compared with random rules of the same size, and a disciplined control is run beside the leaky ones. Results come straight from the published evaluation files."
      >
        {parsed?.success ? (
          <div className="space-y-4">
            <Scoreboard data={parsed.data} />
            <Link href="/evidence" className="press inline-flex items-center gap-1.5 text-[14px] underline underline-offset-4">
              Read the full evidence page
              <Icon icon={ArrowRight} />
            </Link>
          </div>
        ) : (
          <EvidenceSummaryView result={evidence} compact />
        )}
      </Section>

      <Section index="06" label="Next step" title="Look at a real history, then bring yours.">
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/sample">
            Try the sample
            <Icon icon={ArrowRight} />
          </ButtonLink>
          <ButtonLink href="/skill" variant="secondary">
            <Icon icon={Plug} />
            Install the Skill
          </ButtonLink>
        </div>
        <p className="mt-5 text-[13px] text-muted">
          Read what moves where in the <Link href="/privacy" className="underline underline-offset-4">privacy notes</Link>.
        </p>
      </Section>
    </>
  );
}
