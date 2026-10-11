import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import { THEME_INIT_SCRIPT } from '@/components/ui/theme-script';
import './globals.css';

const grotesk = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-grotesk', display: 'swap' });
const jbmono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-jbmono', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL('https://holdout.timjosh507.workers.dev'),
  title: { default: 'Holdout', template: '%s | Holdout' },
  description: 'A trading journal that proves which rules make you money. Your Bitget fills, your rules, tested on trades they never saw.',
  openGraph: { title: 'Holdout', description: 'A trading journal that proves which rules make you money.', siteName: 'Holdout', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Holdout', description: 'A trading journal that proves which rules make you money.' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3F0E8' },
    { media: '(prefers-color-scheme: dark)', color: '#121110' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${jbmono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
