import type { ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui';

export function SectionCard({ label, title, aside, children }: { label?: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader label={label} title={title} aside={aside} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}
