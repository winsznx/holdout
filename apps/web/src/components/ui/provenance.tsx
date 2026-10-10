import { cn } from '@/lib/cn';

export interface ProvenanceProps {
  kind: 'observed' | 'target' | 'estimated';
  source: string;
  n?: number;
  className?: string;
}

export function ProvenanceBadge({ kind, source, n, className }: ProvenanceProps) {
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-2 font-mono text-[11px] leading-snug text-muted', className)}>
      <span className={cn('uppercase tracking-[0.08em]', kind === 'observed' ? 'text-ink' : kind === 'target' ? 'text-signal' : 'text-muted')}>{kind}</span>
      {n !== undefined ? <span className="num">n={n}</span> : null}
      <span className="break-all">{source}</span>
    </span>
  );
}
