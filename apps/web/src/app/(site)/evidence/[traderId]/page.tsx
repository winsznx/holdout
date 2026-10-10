import type { Metadata } from 'next';
import { TraderPage } from '@/components/evidence/trader-page';

export const metadata: Metadata = { title: 'Evidence by trader' };

export default async function Page({ params }: { params: Promise<{ traderId: string }> }) {
  const { traderId } = await params;
  return <TraderPage key={traderId} traderId={decodeURIComponent(traderId)} />;
}
