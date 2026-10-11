'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Eraser, SendHorizontal } from 'lucide-react';
import { Button, Card, Icon, StateBlock, type Surface } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useDesk } from '@/lib/desk/store';
import type { ChatCardView } from '@/lib/chat/client';
import { CheckCard } from './check-card';
import { useChat, type Turn } from './chat-state';

const SUGGESTIONS = ['What did my audit find?', 'Show my proposals', 'Compare my sessions', 'Check long NVDA 20x now', 'Show the evidence'] as const;

function humanize(key: string): string {
  return key.replaceAll('_', ' ');
}

function EngineCard({ card }: { card: ChatCardView }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="label">{humanize(card.kind)}</span>
        <span className="num text-[11px] text-muted">{card.id}</span>
      </div>
      <div className="px-3 pt-2.5 pb-1 text-[14px] font-medium">{card.title}</div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 px-3 pb-3 text-[13px]">
        {Object.entries(card.slots).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{humanize(k)}</dt>
            <dd className="num min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function surfaceOf(name: string): Surface {
  return name === 'Qwen' ? 'Qwen' : 'OpenAI';
}

function AssistantTurn({ turn }: { turn: Extract<Turn, { role: 'assistant' }> }) {
  return (
    <div className="space-y-3">
      {turn.providerError ? (
        <StateBlock
          variant="error"
          surface={surfaceOf(turn.providerError.surface)}
          title={`${surfaceOf(turn.providerError.surface)} is unavailable`}
          body={`${turn.providerError.message} The answer below comes from fixed templates over your engine data.`}
        />
      ) : null}
      <div className="prose-holdout text-[14px] leading-relaxed [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.text}</ReactMarkdown>
      </div>
      {turn.cards.map((c) => (
        <EngineCard key={c.id} card={c} />
      ))}
      {turn.checks.map((c, i) => (
        <CheckCard key={i} live={c} compact />
      ))}
      {turn.checkErrors.map((m) => (
        <StateBlock key={m} variant="error" surface="Holdout data file" title="The trade idea could not be checked" body={m} />
      ))}
      <p className="num text-[11px] text-muted">
        {turn.firewall
          ? `Numbers firewall: ${turn.firewall.passes} passed, ${turn.firewall.failures} fell back to a template. ${turn.provider ?? ''} ${turn.model ?? ''}`
          : 'Numbers firewall: no model text in this answer.'}
      </p>
    </div>
  );
}

export function DeskChat({ variant }: { variant: 'page' | 'drawer' }) {
  const chat = useChat();
  const desk = useDesk();
  const [draft, setDraft] = useState('');

  function submit() {
    const text = draft;
    setDraft('');
    void chat.send(text);
  }

  return (
    <div className={cn('flex min-h-0 flex-col', variant === 'page' ? 'h-[calc(100dvh-9rem)] min-h-[420px]' : 'h-full')}>
      <div className="flex items-center justify-between gap-3 pb-3">
        <p className="num text-[11px] text-muted">
          Numbers firewall this session: {chat.firewall.passes} passed, {chat.firewall.failures} fell back
        </p>
        {chat.turns.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={chat.clear}>
            <Icon icon={Eraser} />
            Clear
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1" aria-live="polite">
        {chat.turns.length === 0 ? (
          <div className="space-y-4">
            <StateBlock
              variant="empty"
              title="Ask about your own audit"
              body={
                desk.rulebook
                  ? 'Answers come from your rulebook and the engine. Holdout never places orders.'
                  : 'No history is loaded yet, so most answers will say there is nothing to show. Holdout never places orders.'
              }
            />
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="secondary" size="sm" onClick={() => void chat.send(s)} disabled={chat.busy}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {chat.turns.map((t) =>
          t.role === 'user' ? (
            <div key={t.id} className="ml-auto max-w-[85%] rounded-card border border-ink bg-surface px-3 py-2 text-[14px]">
              {t.text}
            </div>
          ) : (
            <AssistantTurn key={t.id} turn={t} />
          ),
        )}
        {chat.busy ? <StateBlock variant="loading" title="Working on it" /> : null}
      </div>
      <form
        className="flex gap-2 border-t border-line pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor={`chat-input-${variant}`} className="sr-only">
          Message
        </label>
        <input
          id={`chat-input-${variant}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={1500}
          placeholder="Ask about your rules or a trade idea"
          className="h-11 min-w-0 flex-1 rounded-control border border-ink bg-surface px-3 text-[15px]"
        />
        <Button type="submit" disabled={chat.busy || draft.trim() === ''}>
          <Icon icon={SendHorizontal} />
          Send
        </Button>
      </form>
    </div>
  );
}
