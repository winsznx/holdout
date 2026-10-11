import type { Metadata } from 'next';
import { Markdown } from '@/components/markdown';
import { Container, PageHeading } from '@/components/ui/section';
import { StateBlock } from '@/components/ui/state-block';
import { readRepoDoc } from '@/lib/data';
import { LEMMAS } from '@/lib/lemmas';

export const metadata: Metadata = { title: 'Methodology' };
export const dynamic = 'force-static';

export default async function MethodologyPage() {
  const [methodology, math] = await Promise.all([readRepoDoc('METHODOLOGY.md'), readRepoDoc('MATH.md')]);
  return (
    <Container className="max-w-[860px] py-12 sm:py-16">
      <PageHeading
        label="Methodology"
        title="How Holdout counts"
        intro="Counterfactual semantics, assumptions and the lemmas each backed by a property-based test."
      />
      <div className="mt-8 space-y-12">
        {methodology ? (
          <Markdown source={methodology} />
        ) : (
          <StateBlock variant="empty" title="The methodology document is not published yet" body="docs/METHODOLOGY.md was not found when this page was built." />
        )}
        {math ? (
          <Markdown source={math} />
        ) : (
          <section>
            <h2 className="text-[26px] leading-tight">Lemmas</h2>
            <p className="mt-2 max-w-[62ch] text-[14px] text-muted">The full proofs in docs/MATH.md are not published yet. These are the statements, each with a property-based test of 1,000 runs.</p>
            <ol className="mt-6 divide-y divide-line rounded-card border border-line bg-surface">
              {LEMMAS.map((l) => (
                <li key={l.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[3rem_14rem_1fr] sm:gap-4">
                  <span className="num text-[12px] text-signal">{l.id}</span>
                  <span className="font-medium">{l.name}</span>
                  <span className="text-[14px] text-muted">{l.statement}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </Container>
  );
}
