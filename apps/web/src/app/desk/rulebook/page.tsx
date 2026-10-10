import type { Metadata } from 'next';
import { RulebookView } from '@/components/desk/views/rulebook-view';
import { PageHeading } from '@/components/ui';

export const metadata: Metadata = { title: 'Rulebook' };

export default function Page() {
  return (
    <div className="space-y-8">
      <PageHeading label="Rulebook" title="Your rulebook" intro="Versions, differences, an exported file with its hash, and how to give it to your agent." />
      <RulebookView />
    </div>
  );
}
