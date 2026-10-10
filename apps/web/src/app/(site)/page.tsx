import Link from 'next/link';
import { HeroRuleCard } from '@/components/hero-rule-card';
import { EvidenceSummaryView } from '@/components/evidence-summary';
import { ButtonLink, Container, Section, Timeline } from '@/components/ui';
import { loadEvidenceSummary } from '@/lib/evidence';
import { auditSample, loadDefaultSample } from '@/lib/samples';

export const dynamic = 'force-static';

const STEPS = [
  { title: 'Import', text: 'Drop a Bitget CSV or sync with a read-only key. Parsing happens in your browser.' },
  { title: 'Say your rules', text: 'Write them in plain words. Holdout shows the compiled rule back so you can confirm it.' },
  { title: 'See what breaking them cost', text: 'Every break is listed with its trade ids, the dollar cost and an interval.' },
  { title: 'Test proposals on unseen weeks', text: 'A rule is chosen on your earlier trades and tested once on your later ones, against random rules of the same size.' },
  { title: 'Check the next trade', text: 'Describe an idea and get one card with the rules it breaks. You decide.' },
] as const;

const FEATURES = [
  { title: 'Audit', text: 'Stated rules against your real fills, with the cost of each break.' },
  { title: 'Proposals', text: 'New rules tested on trades they never saw, kept only if they beat random.' },
  { title: 'Session lens', text: 'Profit and loss by US session, across the open and the weekend, stock perp against rToken.' },
  { title: 'Check a trade', text: 'A pre-trade card from your rulebook, session state and market tags.' },
  { title: 'Skill for your agent', text: 'Your rulebook inside Claude Code, Codex, OpenClaw or Cursor, read only.' },
] as const;

export default async function Landing() {
  const [sample, evidence] = await Promise.all([loadDefaultSample(), loadEvidenceSummary()]);
  const hero = sample.status === 'ok' ? auditSample(sample.data) : null;

  return (
    <>
      <Container className="grid gap-10 py-12 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-14">
        <div>
          <div className="label mb-5">Trading journal for Bitget traders</div>
          <h1 className="text-[38px] leading-[1.05] sm:text-[56px] sm:leading-[1.02]">A trading journal that proves which rules make you money.</h1>
          <p className="mt-5 max-w-[46ch] text-[17px] text-muted sm:text-[18px]">Your Bitget fills, your rules, tested on trades they never saw.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/sample">Try the sample</ButtonLink>
            <ButtonLink href="/desk/import" variant="secondary">
              Bring your history
            </ButtonLink>
          </div>
          <p className="mt-6 text-[13px] text-muted">Holdout never places orders. The trader makes every decision.</p>
        </div>
        <HeroRuleCard sample={sample} hero={hero} />
      </Container>

      <Section index="01" label="Problem" title="Traders repeat expensive habits. Nothing proves which rule fixes them.">
        <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-2">
          <article className="space-y-3 bg-surface p-5">
            <div className="label">Research</div>
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
            <div className="label">Bitget, July 2026</div>
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
              <div className="num text-[12px] text-signal">{String(i + 1).padStart(2, '0')}</div>
              <h3 className="mt-3 text-[16px] leading-snug">{s.title}</h3>
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

      <Section index="03" label="What it does" title="Five tools on one ledger.">
        <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-surface p-4">
              <h3 className="text-[16px] leading-snug">{f.title}</h3>
              <p className="mt-2 text-[13px] text-muted">{f.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        index="04"
        label="Evidence"
        title="The test results, including the nulls."
        intro="Every rule is compared with random rules of the same size, and a disciplined control is run beside the leaky ones. Results come straight from the published evaluation files."
      >
        <EvidenceSummaryView result={evidence} compact />
      </Section>

      <Section index="05" label="Next step" title="Look at a real history, then bring yours.">
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/sample">Try the sample</ButtonLink>
          <ButtonLink href="/skill" variant="secondary">
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
