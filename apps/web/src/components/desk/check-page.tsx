'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, ButtonLink, PageHeading, StateBlock, type Surface } from '@/components/ui';
import { runLiveCheck, type LiveCheck } from '@/lib/check/live';
import { parseIdeaRemote, parseIdeaStrict, type ParseOutcome } from '@/lib/check/parse';
import { useDesk } from '@/lib/desk/store';
import { CheckCard } from './check-card';

type View =
  | { step: 'idle' }
  | { step: 'working'; label: string }
  | { step: 'clarify'; question: string }
  | { step: 'provider'; surface: Surface; message: string; question: string | null }
  | { step: 'error'; message: string }
  | { step: 'done'; live: LiveCheck; note: string | null };

function surfaceOf(name: string): Surface {
  return name === 'Qwen' ? 'Qwen' : 'OpenAI';
}

export function CheckPage() {
  const desk = useDesk();
  const [text, setText] = useState('');
  const [view, setView] = useState<View>({ step: 'idle' });
  const book = desk.rulebook;
  const trips = desk.analysis?.ledger.roundTrips ?? [];

  async function submit() {
    const input = text.trim();
    if (!book || input === '') return;
    setView({ step: 'working', label: 'Reading the trade idea' });
    let parsed: ParseOutcome = await parseIdeaRemote(input);
    let providerError: { surface: Surface; message: string } | null = null;
    if (parsed.kind === 'provider_error') {
      providerError = { surface: surfaceOf(parsed.surface), message: parsed.message };
      parsed = parseIdeaStrict(input, book);
    }
    if (parsed.kind === 'clarify') {
      setView(providerError ? { step: 'provider', ...providerError, question: parsed.question } : { step: 'clarify', question: parsed.question });
      return;
    }
    if (parsed.kind !== 'idea') return;
    setView({ step: 'working', label: 'Checking the rulebook, S5 earnings and S6 signal tags' });
    const result = await runLiveCheck(book, trips, parsed.idea);
    if ('error' in result) {
      setView({ step: 'error', message: result.error });
      return;
    }
    setView({
      step: 'done',
      live: result,
      note: providerError ? `${providerError.surface} was unavailable (${providerError.message}). The idea was read by a strict text parser instead, which never fills in a missing field.` : null,
    });
  }

  const busy = view.step === 'working';

  return (
    <div className="space-y-8">
      <PageHeading
        label="Desk / Check a trade"
        title="Check a trade"
        intro="Say the idea in plain words. Holdout checks it against your rulebook, the session now, earnings and market tags. You make the decision."
      />
      {desk.status.phase === 'hydrating' ? <StateBlock variant="loading" title="Reading your saved desk" /> : null}
      {desk.status.phase !== 'hydrating' && !book ? (
        <StateBlock
          variant="empty"
          title="No rulebook to check against"
          body="Load a history first. The check uses the rules in your rulebook and the record on your similar trades."
          action={
            <>
              <ButtonLink href="/desk/import" size="sm">
                Import a history
              </ButtonLink>
              <ButtonLink href="/sample" variant="secondary" size="sm">
                Try the sample
              </ButtonLink>
            </>
          }
        />
      ) : null}
      {book ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label htmlFor="idea" className="label block">
            Trade idea
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="idea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={300}
              placeholder="long NVDA 20x now"
              className="h-11 min-w-0 flex-1 rounded-control border border-ink bg-surface px-3 text-[15px]"
            />
            <Button type="submit" disabled={busy || text.trim() === ''}>
              Check
            </Button>
          </div>
          <p className="text-[12px] text-muted">
            Rulebook: {book.label}, version {book.version}. If the idea is unclear you get a question, never a guess.
          </p>
        </form>
      ) : null}

      {view.step === 'working' ? <StateBlock variant="loading" title={view.label} /> : null}
      {view.step === 'clarify' ? <StateBlock variant="partial" title={view.question} body="Answer in the box above and check again." /> : null}
      {view.step === 'provider' ? (
        <StateBlock
          variant="error"
          surface={view.surface}
          title={`${view.surface} is unavailable`}
          body={
            <>
              {view.message}
              {view.question ? <span className="mt-2 block text-ink">{view.question}</span> : null}
            </>
          }
        />
      ) : null}
      {view.step === 'error' ? <StateBlock variant="error" surface="Holdout data file" title="The idea could not be checked" body={view.message} /> : null}
      {view.step === 'done' ? (
        <div className="space-y-3">
          {view.note ? <StateBlock variant="partial" title="Parsed without the LLM" body={view.note} /> : null}
          <CheckCard live={view.live} />
          <p className="text-[13px] text-muted">
            Want to talk it through? <Link href="/desk/chat" className="underline underline-offset-4">Open the desk chat</Link>.
          </p>
        </div>
      ) : null}
    </div>
  );
}
