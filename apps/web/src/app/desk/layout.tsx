import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ChatDrawer } from '@/components/desk/chat-drawer';
import { ChatProvider } from '@/components/desk/chat-state';
import { DeskChat } from '@/components/desk/desk-chat';
import { DeskNav } from '@/components/desk/desk-nav';
import { BookOpenCheck, Ban } from 'lucide-react';
import { Icon } from '@/components/ui/icon';
import { Mark } from '@/components/ui/logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { DeskProvider } from '@/lib/desk/store';

export const metadata: Metadata = { title: 'Desk' };

export default function DeskLayout({ children }: { children: ReactNode }) {
  return (
    <DeskProvider>
    <ChatProvider>
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
      <aside className="hidden border-r border-line bg-surface md:flex md:flex-col md:justify-between md:px-3 md:py-4">
        <div>
          <Link href="/" className="mb-6 flex items-center gap-2 px-3 text-[18px] font-bold tracking-tight" aria-label="Holdout home">
            <Mark size={20} />
            Holdout
          </Link>
          <div className="label mb-2 px-3">Desk</div>
          <DeskNav orientation="vertical" />
        </div>
        <div className="space-y-3 px-3">
          <p className="flex items-start gap-2 border-t border-line pt-3 text-[12px] leading-snug text-muted">
            <Icon icon={Ban} className="mt-px" />
            Holdout never places orders.
          </p>
          <div className="flex items-center justify-between">
            <Link href="/evidence" className="inline-flex items-center gap-2 text-[13px] hover:underline underline-offset-4">
              <Icon icon={BookOpenCheck} />
              Evidence
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <div className="sticky top-0 z-30 border-b border-line bg-paper md:hidden">
          <div className="flex h-12 items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-bold tracking-tight" aria-label="Holdout home">
              <Mark size={18} />
              Holdout
            </Link>
            <ThemeToggle />
          </div>
          <DeskNav orientation="horizontal" />
        </div>
        <main id="main" className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-6 md:py-8">
          {children}
        </main>
      </div>
      <ChatDrawer>
        <DeskChat variant="drawer" />
      </ChatDrawer>
    </div>
    </ChatProvider>
    </DeskProvider>
  );
}
