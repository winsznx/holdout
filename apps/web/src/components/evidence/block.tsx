import type { ReactNode } from 'react';

export function Block({ label, title, intro, children }: { label: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <div className="label mb-2">{label}</div>
        <h2 className="text-[24px] leading-tight">{title}</h2>
        {intro ? <div className="mt-2 max-w-[66ch] text-[14px] text-muted">{intro}</div> : null}
      </div>
      {children}
    </section>
  );
}
