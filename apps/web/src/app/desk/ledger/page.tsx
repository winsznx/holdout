import type { Metadata } from 'next';
import { LedgerView } from '@/components/desk/views/ledger-view';
import { PageHeading } from '@/components/ui/section';

export const metadata: Metadata = { title: 'Ledger' };

export default function Page() {
  return (
    <div className="space-y-8">
      <PageHeading label="Ledger" title="Round trips and reconciliation" intro="Every closed round trip with fees and funding, checked against Bitget." />
      <LedgerView />
    </div>
  );
}
