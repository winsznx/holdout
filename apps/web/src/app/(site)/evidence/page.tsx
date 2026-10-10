import type { Metadata } from 'next';
import { EvidencePage } from '@/components/evidence/evidence-page';

export const metadata: Metadata = {
  title: 'Evidence',
  description: 'Cohort results, per trader verdicts, freeze hashes, sham distributions and null results for Holdout.',
};

export default function Page() {
  return <EvidencePage />;
}
