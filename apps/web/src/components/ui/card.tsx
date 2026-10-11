import type { LucideIcon } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './icon';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-line bg-surface', className)} {...rest} />;
}

export function CardHeader({ title, label, aside, icon, className }: { title?: ReactNode; label?: ReactNode; aside?: ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-line px-4 py-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <Icon icon={icon} size={18} className="mt-0.5 text-muted" /> : null}
        <div className="min-w-0">
          {label ? <div className="label mb-1">{label}</div> : null}
          {title ? <h3 className="text-[15px] leading-snug">{title}</h3> : null}
        </div>
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-4', className)} {...rest} />;
}
