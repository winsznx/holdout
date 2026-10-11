import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui';

export function Block({ label, title, intro, icon, children }: { label: string; title: string; intro?: ReactNode; icon?: LucideIcon; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3 border-b border-line pb-4">
        {icon ? (
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-line bg-surface">
            <Icon icon={icon} size={18} />
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="label mb-1.5">{label}</div>
          <h2 className="text-[24px] leading-tight">{title}</h2>
          {intro ? <div className="mt-2 max-w-[66ch] text-[14px] text-muted">{intro}</div> : null}
        </div>
      </div>
      {children}
    </section>
  );
}
