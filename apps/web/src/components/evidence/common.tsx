import { Tag, tagPropsForKind, STRATEGY_SAMPLE_NOTICE } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { CampaignRowStatus, TraderResult } from '@/lib/evidence-data';

export function KindTag({ kind }: { kind: TraderResult['kind'] }) {
  return <Tag {...tagPropsForKind(kind)} />;
}

export function SampleNotice({ kind }: { kind: TraderResult['kind'] }) {
  if (kind !== 'strategy-sample') return null;
  return <p className="text-[12px] text-muted">{STRATEGY_SAMPLE_NOTICE}</p>;
}

const VERDICT_TEXT: Record<TraderResult['outcome']['verdict'], string> = {
  ADOPT_WORTHY: 'Adopt worthy',
  NO_RULE_NEEDED: 'No rule needed',
  INSUFFICIENT: 'Insufficient data',
};

export function VerdictLabel({ verdict }: { verdict: TraderResult['outcome']['verdict'] }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-tag border px-1.5 py-0.5 font-mono text-[11px] leading-none whitespace-nowrap',
        verdict === 'ADOPT_WORTHY' ? 'border-gain text-gain' : 'border-line text-ink',
      )}
    >
      {VERDICT_TEXT[verdict]}
    </span>
  );
}

const STATUS_TEXT: Record<CampaignRowStatus, string> = { pass: 'Pass', fail: 'Fail', not_run: 'Not run', reported: 'Reported' };

export function StatusLabel({ status }: { status: CampaignRowStatus }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-tag border px-1.5 py-0.5 font-mono text-[11px] leading-none whitespace-nowrap',
        status === 'pass' ? 'border-gain text-gain' : status === 'fail' ? 'border-loss text-loss' : 'border-line text-muted',
      )}
    >
      {STATUS_TEXT[status]}
    </span>
  );
}
