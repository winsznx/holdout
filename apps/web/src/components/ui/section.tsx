import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Container({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mx-auto w-full max-w-[1120px] px-4 sm:px-6', className)} {...rest} />;
}

export function Section({ index, label, title, intro, children, className, id }: { index?: string; label?: string; title: string; intro?: ReactNode; children?: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn('border-t border-line py-14 sm:py-20', className)}>
      <Container>
        {label ? (
          <div className="label mb-4">
            {index ? <span className="text-signal">{index}</span> : null}
            {index ? ' / ' : ''}
            {label}
          </div>
        ) : null}
        <h2 className="max-w-[20ch] text-[30px] leading-[1.08] sm:text-[40px]">{title}</h2>
        {intro ? <div className="mt-4 max-w-[60ch] text-[16px] text-muted">{intro}</div> : null}
        {children ? <div className="mt-8 sm:mt-10">{children}</div> : null}
      </Container>
    </section>
  );
}

export function PageHeading({ label, title, intro }: { label: string; title: string; intro?: ReactNode }) {
  return (
    <div className="border-b border-line pb-8">
      <div className="label mb-3">{label}</div>
      <h1 className="max-w-[22ch] text-[34px] leading-[1.05] sm:text-[48px]">{title}</h1>
      {intro ? <div className="mt-4 max-w-[62ch] text-[16px] text-muted">{intro}</div> : null}
    </div>
  );
}
