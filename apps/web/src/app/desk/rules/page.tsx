import type { Metadata } from 'next';
import { RulesView } from '@/components/desk/views/rules-view';
import { PageHeading } from '@/components/ui/section';

export const metadata: Metadata = { title: 'Rules' };

export default function Page() {
  return (
    <div className="space-y-8">
      <PageHeading label="Rules" title="Your rules on trial" intro="Each rule you try to follow, how often you broke it, and what that cost." />
      <RulesView />
    </div>
  );
}
