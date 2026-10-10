import type { ReactNode } from 'react';
import { SiteShell } from '@/components/site-shell';
import { DeskProvider } from '@/lib/desk/store';

export default function SampleLayout({ children }: { children: ReactNode }) {
  return (
    <DeskProvider>
      <SiteShell>{children}</SiteShell>
    </DeskProvider>
  );
}
