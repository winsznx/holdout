import type { Metadata } from 'next';
import { SamplePicker } from '@/components/desk/sample-picker';
import { Container, PageHeading } from '@/components/ui';

export const metadata: Metadata = { title: 'Sample' };

export default function SamplePage() {
  return (
    <Container className="py-12">
      <div className="space-y-8">
        <PageHeading
          label="Sample"
          title="Try a history without an account"
          intro="One click loads a labeled history into this browser and opens the audit. Then try a proposal and a trade check. No account, no key, and nothing leaves your browser."
        />
        <SamplePicker />
      </div>
    </Container>
  );
}
