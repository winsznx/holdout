'use client';

import { MessageSquare, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { StateBlock } from '@/components/ui/state-block';

export function ChatDrawer({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="desk-chat-drawer" className="fixed right-4 bottom-4 z-40 bg-paper">
        <Icon icon={MessageSquare} />
        Ask the desk
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onClick={() => setOpen(false)}>
          <aside
            id="desk-chat-drawer"
            role="dialog"
            aria-label="Desk chat"
            className="flex h-full w-full max-w-[420px] flex-col border-l border-line bg-paper"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="label">Desk chat</span>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                <Icon icon={X} />
                Close
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {children ?? <StateBlock variant="empty" title="Chat is not connected yet" body="The desk chat answers with engine cards from your rulebook. It has not been wired to this page." />}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
