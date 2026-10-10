import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Skeleton } from './skeleton';

export const BITGET_SURFACES = [
  'Bitget fills (S1)',
  'Bitget positions history and financial records (S2)',
  'Bitget market candles and funding history (S3)',
  'Bitget rToken spot candles (S4)',
  'bitget-mcp-server (S5)',
  'bitget-signal (S6)',
  'US session calendar (S7)',
  'Chainbase AgentKey (S8)',
  'Holdout data file',
  'OpenAI',
  'Qwen',
] as const;

export type Surface = (typeof BITGET_SURFACES)[number];

interface Common {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export type StateBlockProps =
  | (Common & { variant: 'empty' | 'loading' | 'partial' | 'success' })
  | (Common & { variant: 'error'; surface: Surface });

const marker: Record<StateBlockProps['variant'], string> = {
  empty: 'border-line',
  loading: 'border-line',
  partial: 'border-signal',
  success: 'border-gain',
  error: 'border-loss',
};

const kicker: Record<StateBlockProps['variant'], string> = {
  empty: 'Empty',
  loading: 'Loading',
  partial: 'Partial',
  success: 'Done',
  error: 'Error',
};

export function StateBlock(props: StateBlockProps) {
  const { variant, title, body, action, className } = props;
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-busy={variant === 'loading' || undefined}
      className={cn('rounded-card border border-dashed bg-surface px-4 py-6 sm:px-6', marker[variant], className)}
    >
      <div className="label flex items-center gap-2">
        <span className={cn('inline-block h-2 w-2 rounded-[2px]', variant === 'error' ? 'bg-loss' : variant === 'success' ? 'bg-gain' : variant === 'partial' ? 'bg-signal' : 'bg-line')} />
        {kicker[variant]}
        {props.variant === 'error' ? <span className="text-ink normal-case tracking-normal">{props.surface}</span> : null}
      </div>
      <p className="mt-2 text-[17px] leading-snug font-medium">{title}</p>
      {body ? <div className="mt-1.5 max-w-[62ch] text-[14px] text-muted">{body}</div> : null}
      {variant === 'loading' ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="w-2/3" />
          <Skeleton className="w-1/2" />
        </div>
      ) : null}
      {action ? <div className="mt-4 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
