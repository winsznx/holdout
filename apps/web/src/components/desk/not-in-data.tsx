import { StateBlock } from '@/components/ui';

export function NotInData({ reason, title = 'Not in this data' }: { reason: string; title?: string }) {
  const body = reason.replace(/^not in this data:\s*/i, '');
  return <StateBlock variant="empty" title={title} body={body.charAt(0).toUpperCase() + body.slice(1)} />;
}
