import { CircleAlert, CircleCheck, CircleDashed, Inbox, LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './icon';
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

const glyph: Record<StateBlockProps['variant'], LucideIcon> = {
  empty: Inbox,
  loading: LoaderCircle,
  partial: CircleDashed,
  success: CircleCheck,
  error: CircleAlert,
};

const glyphTone: Record<StateBlockProps['variant'], string> = {
  empty: 'text-muted',
  loading: 'text-muted',
  partial: 'text-signal',
  success: 'text-gain',
  error: 'text-loss',
};

export function StateBlock(props: StateBlockProps) {
  const { variant, title, body, action, className } = props;
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-busy={variant === 'loading' || undefined}
      className={cn('rounded-card border border-dashed bg-surface px-4 py-6 sm:px-6', marker[variant], className)}
    >
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-line bg-paper', glyphTone[variant])}>
          <Icon icon={glyph[variant]} size={18} className={variant === 'loading' ? 'motion-safe:animate-spin' : undefined} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="label flex flex-wrap items-center gap-x-2">
            {kicker[variant]}
            {props.variant === 'error' ? <span className="text-ink normal-case tracking-normal">{props.surface}</span> : null}
          </div>
          <p className="mt-1 text-[17px] leading-snug font-medium">{title}</p>
          {body ? <div className="mt-1.5 max-w-[62ch] text-[14px] text-muted">{body}</div> : null}
          {variant === 'loading' ? (
            <div className="mt-4 space-y-2">
              <Skeleton className="w-2/3" />
              <Skeleton className="w-1/2" />
            </div>
          ) : null}
          {action ? <div className="mt-4 flex flex-wrap gap-2">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
