import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';

export function SectionCard({ label, title, aside, icon, children }: { label?: string; title: string; aside?: ReactNode; icon?: LucideIcon; children: ReactNode }) {
  return (
    <Card>
      <CardHeader label={label} title={title} aside={aside} icon={icon} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}
