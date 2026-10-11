import { cn } from '@/lib/cn';
import { CopyButton } from './copy-button';

export function CodeBlock({ children, label, className }: { children: string; label?: string; className?: string }) {
  return (
    <figure className={cn('overflow-hidden rounded-card border border-line bg-surface', className)}>
      <figcaption className="flex items-center justify-between gap-2 border-b border-line py-1 pr-1 pl-3">
        <span className="label min-w-0 truncate">{label ?? 'Command'}</span>
        <CopyButton text={children} />
      </figcaption>
      <pre className="num overflow-x-auto px-3 py-3 text-[12.5px] leading-relaxed">
        <code>{children}</code>
      </pre>
    </figure>
  );
}
