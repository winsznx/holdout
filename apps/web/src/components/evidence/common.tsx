import { Check, CircleDot, Minus, X, type LucideIcon } from 'lucide-react';
import { Icon, Tag, VerdictChip, tagPropsForKind, STRATEGY_SAMPLE_NOTICE } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { CampaignRowStatus, TraderResult } from '@/lib/evidence-data';

export function KindTag({ kind }: { kind: TraderResult['kind'] }) {
  return <Tag {...tagPropsForKind(kind)} />;
}

export function SampleNotice({ kind }: { kind: TraderResult['kind'] }) {
  if (kind !== 'strategy-sample') return null;
  return <p className="text-[12px] text-muted">{STRATEGY_SAMPLE_NOTICE}</p>;
}

export function VerdictLabel({ verdict }: { verdict: TraderResult['outcome']['verdict'] }) {
  return <VerdictChip verdict={verdict} />;
}

const STATUS_TEXT: Record<CampaignRowStatus, string> = { pass: 'Pass', fail: 'Fail', not_run: 'Not run', reported: 'Reported' };

const STATUS_GLYPH: Record<CampaignRowStatus, LucideIcon> = { pass: Check, fail: X, not_run: Minus, reported: CircleDot };

export function StatusLabel({ status }: { status: CampaignRowStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-tag border px-1.5 py-0.5 font-mono text-[11px] leading-none whitespace-nowrap',
        status === 'pass' ? 'border-gain text-gain' : status === 'fail' ? 'border-loss text-loss' : 'border-line text-muted',
      )}
    >
      <Icon icon={STATUS_GLYPH[status]} size={12} />
      {STATUS_TEXT[status]}
    </span>
  );
}
