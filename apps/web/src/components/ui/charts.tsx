import { cn } from '@/lib/cn';

export function Sparkline({
  values,
  width = 120,
  height = 32,
  tone = 'ink',
  label,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: 'ink' | 'gain' | 'loss' | 'signal';
  label: string;
  className?: string;
}) {
  const color = `var(--${tone})`;
  if (values.length < 2) {
    return (
      <svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={cn('max-w-full', className)}>
        <line x1="0" x2={width} y1={height / 2} y2={height / 2} stroke="var(--line)" strokeDasharray="3 3" />
      </svg>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (width - pad * 2) + pad;
      const y = height - pad - ((v - min) / span) * (height - pad * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={cn('max-w-full', className)}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export interface BarItem {
  id: string;
  label: string;
  value: number;
  display: string;
  tone?: 'ink' | 'gain' | 'loss' | 'signal';
}

export function Bar({ items, label, className }: { items: BarItem[]; label: string; className?: string }) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 0) || 1;
  const hasNegative = items.some((i) => i.value < 0);
  return (
    <ul aria-label={label} className={cn('space-y-2', className)}>
      {items.map((item) => {
        const pct = (Math.abs(item.value) / max) * (hasNegative ? 50 : 100);
        const left = hasNegative ? (item.value < 0 ? 50 - pct : 50) : 0;
        return (
          <li key={item.id} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-[13px] sm:grid-cols-[minmax(0,10rem)_1fr_auto]">
            <span className="truncate">{item.label}</span>
            <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="h-2 w-full" aria-hidden="true">
              <rect x="0" y="3.5" width="100" height="1" fill="var(--line)" />
              <rect x={left} y="0" width={Math.max(pct, 0.6)} height="8" fill={`var(--${item.tone ?? 'ink'})`} />
              {hasNegative ? <rect x="49.8" y="0" width="0.4" height="8" fill="var(--muted)" /> : null}
            </svg>
            <span className="num text-right">{item.display}</span>
          </li>
        );
      })}
    </ul>
  );
}

export interface TimelineSegment {
  id: string;
  label: string;
  start: number;
  end: number;
  variant: 'train' | 'test' | 'neutral';
  caption: string;
}

export function Timeline({ segments, label, className }: { segments: TimelineSegment[]; label: string; className?: string }) {
  if (segments.length === 0) return null;
  const min = Math.min(...segments.map((s) => s.start));
  const max = Math.max(...segments.map((s) => s.end));
  const span = max - min || 1;
  const x = (v: number) => ((v - min) / span) * 100;
  return (
    <figure className={className}>
      <svg role="img" aria-label={label} viewBox="0 0 100 14" preserveAspectRatio="none" className="h-8 w-full">
        {segments.map((s) => {
          const x0 = x(s.start);
          const w = Math.max(x(s.end) - x0 - 0.6, 0.4);
          if (s.variant === 'test') {
            return <rect key={s.id} x={x0 + 0.6} y="1" width={Math.max(w - 0.6, 0.2)} height="12" rx="0.8" fill="none" stroke="var(--signal)" strokeWidth="2" vectorEffect="non-scaling-stroke" />;
          }
          return <rect key={s.id} x={x0} y="1" width={w} height="12" rx="0.8" fill={s.variant === 'train' ? 'var(--ink)' : 'var(--line)'} />;
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
        {segments.map((s) => (
          <span key={s.id}>
            <span className={s.variant === 'test' ? 'text-signal' : 'text-ink'}>{s.label}</span> {s.caption}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
