import { cn } from '@/lib/cn';

export function CodeBlock({ children, label, className }: { children: string; label?: string; className?: string }) {
  return (
    <figure className={cn('overflow-hidden rounded-card border border-line bg-surface', className)}>
      {label ? <figcaption className="label border-b border-line px-3 py-2">{label}</figcaption> : null}
      <pre className="num overflow-x-auto px-3 py-3 text-[12.5px] leading-relaxed">
        <code>{children}</code>
      </pre>
    </figure>
  );
}
