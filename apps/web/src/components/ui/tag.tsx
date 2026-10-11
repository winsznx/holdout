import { Bot, Crosshair, Eye, FlaskConical, Sigma, User, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './icon';

export const STRATEGY_SAMPLE_NOTICE = "Strategy sample: a friend's trading agent (backtest and paper ledger), not live fills.";

export type TagProps =
  | { kind: 'observed' | 'target' | 'estimated'; className?: string }
  | { kind: 'bot'; className?: string }
  | { kind: 'human'; venue: 'demo' | 'live'; className?: string }
  | { kind: 'strategy-sample'; className?: string };

const labels = {
  observed: 'Observed',
  target: 'Target',
  estimated: 'Estimated',
  bot: 'Bitget Demo bot',
  'strategy-sample': 'Strategy sample',
} as const;

function textFor(props: TagProps): string {
  if (props.kind === 'human') return props.venue === 'demo' ? 'human, Bitget Demo' : 'human, live account';
  return labels[props.kind];
}

function iconFor(props: TagProps): LucideIcon {
  switch (props.kind) {
    case 'observed':
      return Eye;
    case 'target':
      return Crosshair;
    case 'estimated':
      return Sigma;
    case 'bot':
      return Bot;
    case 'human':
      return User;
    case 'strategy-sample':
      return FlaskConical;
  }
}

function styleFor(kind: TagProps['kind']): string {
  switch (kind) {
    case 'observed':
      return 'border-ink text-ink';
    case 'target':
      return 'border-signal text-signal border-dashed';
    case 'estimated':
      return 'border-muted text-muted border-dashed';
    default:
      return 'border-line text-ink bg-paper';
  }
}

export function Tag(props: TagProps) {
  return (
    <span
      title={props.kind === 'strategy-sample' ? STRATEGY_SAMPLE_NOTICE : undefined}
      className={cn(
        'inline-flex items-center gap-1 rounded-tag border px-1.5 py-0.5 font-mono text-[11px] leading-none whitespace-nowrap',
        styleFor(props.kind),
        props.className,
      )}
    >
      <Icon icon={iconFor(props)} size={12} />
      {textFor(props)}
    </span>
  );
}

export function tagPropsForKind(kind: 'bot' | 'strategy-sample' | 'human-demo' | 'human-live'): TagProps {
  switch (kind) {
    case 'bot':
      return { kind: 'bot' };
    case 'strategy-sample':
      return { kind: 'strategy-sample' };
    case 'human-demo':
      return { kind: 'human', venue: 'demo' };
    case 'human-live':
      return { kind: 'human', venue: 'live' };
  }
}

export function TagRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
}
