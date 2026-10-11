import type { ReactNode } from 'react';
import { Footer } from '@/components/ui/footer';
import { Header } from '@/components/ui/header';

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
