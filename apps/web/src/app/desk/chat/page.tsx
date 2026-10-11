import { DeskChat } from '@/components/desk/desk-chat';
import { PageHeading } from '@/components/ui/section';

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeading label="Desk / Chat" title="Chat" intro="Ask about your audit, proposals, rules, sessions or the evidence. Answers show engine cards. Holdout cannot place orders." />
      <DeskChat variant="page" />
    </div>
  );
}
