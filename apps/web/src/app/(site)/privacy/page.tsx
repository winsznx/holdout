import type { Metadata } from 'next';
import { Container, PageHeading } from '@/components/ui';

export const metadata: Metadata = { title: 'Privacy' };

const ROWS = [
  { what: 'Bitget CSV export', where: 'Your browser only', detail: 'Parsed in a Web Worker on your device. The file is never uploaded.' },
  { what: 'API sync, secret key', where: 'Your browser only', detail: 'The browser signs each request with WebCrypto (HMAC-SHA256). The secret never leaves the browser.' },
  { what: 'API sync, key and passphrase', where: 'Our edge function, in memory', detail: 'The signed request goes through /api/sync, which forwards it to Bitget. The access key and passphrase headers pass through in memory. Nothing is logged or stored.' },
  { what: 'Ledger and results', where: 'IndexedDB in your browser', detail: 'Stored locally. Delete my data clears it.' },
  { what: 'Saved rulebooks and aggregates', where: 'Supabase, only if you opt in', detail: 'Rule text and aggregate statistics only, keyed to an anonymous device id. Fills are never stored there.' },
  { what: 'Rule text and aggregates for the AI layer', where: 'The model provider', detail: 'The model sees rule text, the rule schema, aggregates and tool results. It never sees raw fills or keys.' },
] as const;

export default function PrivacyPage() {
  return (
    <Container className="max-w-[860px] py-12 sm:py-16">
      <PageHeading label="Privacy" title="Exactly what moves where" intro="Holdout reads your trade history to test your rules. This page lists every place that data goes." />
      <div className="mt-8 divide-y divide-line rounded-card border border-line bg-surface">
        {ROWS.map((r) => (
          <div key={r.what} className="grid gap-1 px-4 py-4 sm:grid-cols-[14rem_14rem_1fr] sm:gap-4">
            <div className="font-medium">{r.what}</div>
            <div className="num text-[12px] text-signal sm:pt-1">{r.where}</div>
            <div className="text-[14px] text-muted">{r.detail}</div>
          </div>
        ))}
      </div>
      <div className="mt-10 space-y-3 text-[15px]">
        <h2 className="text-[22px]">Read-only keys</h2>
        <p className="max-w-[62ch] text-muted">Use a read-only key. If the Bitget API exposes the key&apos;s permissions, Holdout reads them and refuses a key with trade or withdraw permission. It never attempts anything write-shaped.</p>
        <h2 className="pt-4 text-[22px]">Orders</h2>
        <p className="max-w-[62ch] text-muted">Holdout never places orders. The product has no code path that does.</p>
      </div>
    </Container>
  );
}
