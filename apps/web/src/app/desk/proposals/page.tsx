import type { Metadata } from 'next';
import { ProposalsView } from '@/components/desk/views/proposals-view';
import { PageHeading } from '@/components/ui/section';

export const metadata: Metadata = { title: 'Proposals' };

export default function Page() {
  return (
    <div className="space-y-8">
      <PageHeading label="Proposals" title="Rules tested on unseen trades" intro="One candidate chosen on the first two thirds of your history, tested on the last third." />
      <ProposalsView />
    </div>
  );
}
