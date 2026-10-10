import { cn } from '@/lib/cn';

const SOLID = 'M10 0H35a3 3 0 0 1 3 3V57a3 3 0 0 1-3 3H10A10 10 0 0 1 0 50V10A10 10 0 0 1 10 0Z';
const HELD = 'M45 2H50a8 8 0 0 1 8 8V50a8 8 0 0 1-8 8H45a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z';

export function Mark({ size = 24, className, accent = false }: { size?: number; className?: string; accent?: boolean }) {
  return (
    <svg viewBox="0 0 60 60" width={size} height={size} className={cn('shrink-0', className)} aria-hidden="true">
      <path d={SOLID} fill="var(--ink)" />
      <path d={HELD} fill="none" stroke={accent ? 'var(--signal)' : 'var(--ink)'} strokeWidth={4} />
    </svg>
  );
}

export function Wordmark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-bold tracking-tight', className)} style={{ fontSize: size }}>
      <Mark size={size} />
      <span className="leading-none">Holdout</span>
    </span>
  );
}
