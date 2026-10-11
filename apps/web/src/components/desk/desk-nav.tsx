'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { DESK_NAV } from './nav';

export function DeskNav({ orientation }: { orientation: 'vertical' | 'horizontal' }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Desk" className={orientation === 'vertical' ? 'flex flex-col gap-0.5' : 'flex gap-1 overflow-x-auto px-3 py-2'}>
      {DESK_NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 whitespace-nowrap rounded-control border text-[14px]',
              orientation === 'vertical' ? 'px-3 py-2' : 'px-3 py-1.5',
              active ? 'border-ink bg-ink text-paper' : 'border-transparent text-ink hover:border-line hover:bg-paper',
            )}
          >
            <Icon icon={item.icon} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
