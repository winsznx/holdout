import type { Metadata } from 'next';
import { HomeView } from '@/components/desk/views/home-view';
import { PageHeading } from '@/components/ui/section';

export const metadata: Metadata = { title: 'Desk' };

export default function Page() {
  return (
    <div className="space-y-8">
      <PageHeading label="Desk" title="Home" intro="Your import state, the latest audit and what to do next." />
      <HomeView />
    </div>
  );
}
