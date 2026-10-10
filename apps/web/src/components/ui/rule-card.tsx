import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatCount, formatSignedUsdt, pnlTone } from '@/lib/format';
import { Card } from './card';
import { Tag, type TagProps } from './tag';

export type RuleCardStatus = 'priced' | 'not_enough_breaks' | 'no_breaks' | 'untestable';

const statusText: Record<RuleCardStatus, string> = {
  priced: 'Priced',
  not_enough_breaks: 'Not enough breaks to price',
  no_breaks: 'Never broken',
  untestable: 'Untestable',
};

export interface RuleCardProps {
  rendered: string;
  ruleType: string;
  status: RuleCardStatus;
  breaks: number;
  tradesConsidered: number;
  effect: { value: number; lo: number; hi: number } | null;
  intervalLevel?: number;
  intervalNote?: string;
  untestableReason?: string;
  source: TagProps;
  sourceLabel?: string;
  intervalIntro?: string;
  drilldown?: ReactNode;
  className?: string;
}

export function RuleCard(props: RuleCardProps) {
  const { rendered, ruleType, status, breaks, tradesConsidered, effect, intervalLevel = 90, untestableReason, source, sourceLabel, drilldown, className } = props;
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <span className="label">{ruleType}</span>
        <Tag {...source} />
      </div>
      <div className="px-4 pt-4 pb-3">
        <p className="text-[19px] leading-snug font-medium">{rendered}</p>
        {sourceLabel ? <p className="mt-1 text-[12px] text-muted">{sourceLabel}</p> : null}
      </div>
      <dl className="grid grid-cols-2 border-y border-line">
        <div className="border-r border-line px-4 py-3">
          <dt className="label">Times broken</dt>
          <dd className="num mt-1 text-[24px] leading-none font-medium">{formatCount(breaks)}</dd>
          <dd className="num mt-1 text-[11px] text-muted">of {formatCount(tradesConsidered)} round trips</dd>
        </div>
        <div className="px-4 py-3">
          <dt className="label">Effect on net P&amp;L</dt>
          {effect ? (
            <>
              <dd
                className={cn(
                  'num mt-1 text-[24px] leading-none font-medium',
                  pnlTone(effect.value) === 'gain' ? 'text-gain' : pnlTone(effect.value) === 'loss' ? 'text-loss' : 'text-ink',
                )}
              >
                {formatSignedUsdt(effect.value)}
              </dd>
              <dd className="num mt-1 text-[11px] text-muted">
                {intervalLevel}% interval {formatSignedUsdt(effect.lo)} to {formatSignedUsdt(effect.hi)} USDT
              </dd>
            </>
          ) : (
            <dd className="mt-1 text-[14px] text-muted">{status === 'untestable' ? (untestableReason ?? statusText[status]) : statusText[status]}</dd>
          )}
        </div>
      </dl>
      {drilldown ? (
        <details className="group px-4 py-3">
          <summary className="label cursor-pointer list-none select-none hover:text-ink">
            <span className="group-open:hidden">Show broken trades</span>
            <span className="hidden group-open:inline">Hide broken trades</span>
          </summary>
          <div className="mt-3">{drilldown}</div>
        </details>
      ) : null}
    </Card>
  );
}
