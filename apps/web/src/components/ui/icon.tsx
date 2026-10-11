import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export const ICON_STROKE = 1.5;

export function Icon({ icon: Glyph, size = 16, className }: { icon: LucideIcon; size?: 12 | 16 | 18; className?: string }) {
  return <Glyph size={size} strokeWidth={ICON_STROKE} absoluteStrokeWidth aria-hidden="true" focusable="false" className={cn('shrink-0', className)} />;
}

export function IconBox({ icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cn('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-line bg-paper text-ink', className)}>
      <Icon icon={icon} size={18} />
    </span>
  );
}
