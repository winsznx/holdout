import type { ReactNode } from 'react';
import { PageHeading, StateBlock } from '@/components/ui';

export function DeskEmpty({ label, heading, intro, title, body, action }: { label: string; heading: string; intro?: string; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="space-y-8">
      <PageHeading label={label} title={heading} intro={intro} />
      <StateBlock variant="empty" title={title} body={body} action={action} />
    </div>
  );
}
