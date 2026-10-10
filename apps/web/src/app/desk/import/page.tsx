import type { Metadata } from 'next';
import { ImportView } from '@/components/desk/views/import-view';
import { PageHeading } from '@/components/ui';

export const metadata: Metadata = { title: 'Import' };

export default function Page() {
  return (
    <div className="space-y-8">
      <PageHeading label="Import" title="Bring your history" intro="Drop a CSV or sync a read-only key. Your fills are read in this browser." />
      <ImportView />
    </div>
  );
}
