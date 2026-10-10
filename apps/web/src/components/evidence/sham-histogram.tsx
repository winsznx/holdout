import { binDraws, positionOf } from '@/lib/histogram';
import { formatSignedUsdt } from '@/lib/format';

const W = 320;
const H = 132;
const PAD = { top: 14, right: 8, bottom: 28, left: 8 };
const BINS = 24;

export function ShamHistogram({ draws, observed, label }: { draws: number[]; observed: number; label: string }) {
  const histogram = binDraws(draws, BINS, [observed]);
  if (!histogram) {
    return <p className="text-[13px] text-muted">The sham draws file for this trader is empty, so no distribution is drawn.</p>;
  }
  const maxCount = Math.max(...histogram.bins.map((b) => b.count), 1);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const barW = innerW / histogram.bins.length;
  const x = (v: number) => PAD.left + positionOf(v, histogram) * innerW;
  const ox = x(observed);
  const atLeast = draws.filter((d) => d >= observed).length;
  return (
    <figure>
      <svg
        role="img"
        aria-label={`${label}. ${draws.length} sham draws, ${atLeast} at or above the observed delta of ${formatSignedUsdt(observed)} USDT.`}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-full"
      >
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="var(--line)" />
        {histogram.bins.map((b, i) => {
          const h = (b.count / maxCount) * innerH;
          return <rect key={i} x={PAD.left + i * barW + 0.5} y={H - PAD.bottom - h} width={Math.max(barW - 1, 0.5)} height={h} fill="var(--muted)" opacity={0.55} />;
        })}
        <line x1={ox} x2={ox} y1={PAD.top - 6} y2={H - PAD.bottom} stroke="var(--signal)" strokeWidth={2} />
        <text x={Math.min(Math.max(ox, 30), W - 30)} y={PAD.top - 3} textAnchor="middle" fontSize={10} fill="var(--ink)" fontFamily="var(--font-jbmono), monospace">
          observed
        </text>
        <text x={PAD.left} y={H - 10} fontSize={10} fill="var(--muted)" fontFamily="var(--font-jbmono), monospace">
          {formatSignedUsdt(histogram.min)}
        </text>
        <text x={W - PAD.right} y={H - 10} textAnchor="end" fontSize={10} fill="var(--muted)" fontFamily="var(--font-jbmono), monospace">
          {formatSignedUsdt(histogram.max)}
        </text>
      </svg>
      <figcaption className="num mt-1 text-[11px] text-muted">
        {draws.length} sham draws. Observed {formatSignedUsdt(observed)} USDT. {atLeast} draws at or above it.
      </figcaption>
    </figure>
  );
}
