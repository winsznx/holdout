import { cn } from '@/lib/cn';
import { ProvenanceBadge, type ProvenanceProps } from './provenance';

export function Stat({
  label,
  value,
  unit,
  tone = 'neutral',
  provenance,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'neutral' | 'gain' | 'loss' | 'signal';
  provenance: Omit<ProvenanceProps, 'className'>;
  className?: string;
}) {
  const toneClass = tone === 'gain' ? 'text-gain' : tone === 'loss' ? 'text-loss' : tone === 'signal' ? 'text-signal' : 'text-ink';
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="label">{label}</div>
      <div className={cn('num text-[28px] leading-none font-medium sm:text-[32px]', toneClass)}>
        {value}
        {unit ? <span className="ml-1 text-[13px] text-muted">{unit}</span> : null}
      </div>
      <ProvenanceBadge {...provenance} />
    </div>
  );
}
