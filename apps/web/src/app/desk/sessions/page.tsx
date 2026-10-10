import type { Metadata } from 'next';
import { SessionsView } from '@/components/desk/views/sessions-view';
import { PageHeading } from '@/components/ui';

export const metadata: Metadata = { title: 'Sessions' };

export default function Page() {
  return (
    <div className="space-y-8">
      <PageHeading label="Sessions" title="Session lens" intro="How your trades did by US session, across the open and the weekend, and what they cost to hold." />
      <SessionsView />
    </div>
  );
}
