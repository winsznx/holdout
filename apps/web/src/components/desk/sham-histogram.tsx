import { histogram, xPosition } from '@/lib/desk/histogram';
import { signedMoney } from '@/lib/desk/display';

export function ShamHistogram({ draws, observed, median }: { draws: number[]; observed: number; median: number }) {
  const h = histogram(draws, [observed, median]);
  if (!h) return null;
  const barW = 100 / h.bins.length;
  const obsX = xPosition(observed, h);
  const medX = xPosition(median, h);
  const asText = (v: number) => signedMoney(String(v));
  return (
    <figure>
      <svg
        role="img"
        aria-label={`Histogram of ${draws.length} same-size random draws on the test trades. Median draw ${asText(median)} USDT. The rule's test gain is ${asText(observed)} USDT.`}
        viewBox="0 0 100 44"
        preserveAspectRatio="none"
        className="h-40 w-full"
      >
        <rect x="0" y="0" width="100" height="40" fill="none" />
        {h.bins.map((b, i) => {
          const height = (b.count / h.maxCount) * 36;
          return <rect key={i} x={i * barW + 0.15} y={40 - height} width={barW - 0.3} height={height} fill="var(--line)" stroke="var(--muted)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />;
        })}
        <line x1="0" x2="100" y1="40" y2="40" stroke="var(--muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1={medX} x2={medX} y1="2" y2="40" stroke="var(--muted)" strokeDasharray="2 2" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <line x1={obsX} x2={obsX} y1="0" y2="40" stroke="var(--signal)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
        <span className="num">{asText(h.min)}</span>
        <span>
          <span className="text-signal">solid line</span> rule on test {asText(observed)}, dashed line median sham {asText(median)}
        </span>
        <span className="num">{asText(h.max)}</span>
      </figcaption>
    </figure>
  );
}
