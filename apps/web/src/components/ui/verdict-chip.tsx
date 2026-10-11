import { BadgeCheck, CircleSlash, Scale, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Icon } from './icon';

export type Verdict = 'ADOPT_WORTHY' | 'NO_RULE_NEEDED' | 'INSUFFICIENT';

const TEXT: Record<Verdict, string> = {
  ADOPT_WORTHY: 'Adopt worthy',
  NO_RULE_NEEDED: 'No rule needed',
  INSUFFICIENT: 'Insufficient data',
};

const GLYPH: Record<Verdict, LucideIcon> = {
  ADOPT_WORTHY: BadgeCheck,
  NO_RULE_NEEDED: CircleSlash,
  INSUFFICIENT: Scale,
};

export function verdictText(verdict: Verdict): string {
  return TEXT[verdict];
}

export function VerdictChip({ verdict, className }: { verdict: Verdict; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-tag border px-1.5 py-0.5 font-mono text-[11px] leading-none whitespace-nowrap',
        verdict === 'ADOPT_WORTHY' ? 'border-gain text-gain' : verdict === 'INSUFFICIENT' ? 'border-line border-dashed text-muted' : 'border-line text-ink',
        className,
      )}
    >
      <Icon icon={GLYPH[verdict]} size={12} />
      {TEXT[verdict]}
    </span>
  );
}
