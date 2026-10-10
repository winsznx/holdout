import type { ReactNode } from 'react';
import { Footer, Header } from '@/components/ui';

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
