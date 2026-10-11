'use client';

import { BookMarked, Copy, Check, Download, FileJson, History, Plug, Save, ShieldCheck, TriangleAlert, Cloud } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { verifyRulebook, type Rulebook } from '@holdout/engine';
import { Button, ButtonLink, Card, CardBody, Icon, StateBlock } from '@/components/ui';
import { DeskGate, type ReadyDesk } from '@/components/desk/gate';
import { DeskSummary } from '@/components/desk/desk-summary';
import { SectionCard } from '@/components/desk/section-card';
import { diffRulebooks } from '@/lib/desk/rulebook-build';
import { rulebookFileName, rulebookJson, saveRequest } from '@/lib/desk/rulebook-export';

const STATUS_TEXT: Record<string, string> = { stated: 'Stated', adopted: 'Adopted', rejected: 'Rejected', proposed: 'Proposed' };

function RuleList({ book }: { book: Rulebook }) {
  if (book.rules.length === 0) return <p className="text-[14px] text-muted">This version has no rules.</p>;
  return (
    <ul className="divide-y divide-line rounded-card border border-line">
      {book.rules.map((r) => (
        <li key={r.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-baseline sm:justify-between">
          <span className="text-[14px]">{r.rendered}</span>
          <span className="num shrink-0 text-[11px] uppercase tracking-[0.08em] text-muted">
            {STATUS_TEXT[r.status] ?? r.status} <span className="normal-case tracking-normal">{r.id}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Diff({ from, to }: { from: Rulebook; to: Rulebook }) {
  const d = diffRulebooks(from, to);
  if (d.added.length === 0 && d.removed.length === 0 && d.changed.length === 0) {
    return <p className="text-[14px] text-muted">No rule differences between version {from.version} and version {to.version}. {d.unchanged} rules are the same.</p>;
  }
  return (
    <ul className="space-y-1.5 text-[14px]">
      {d.added.map((r) => (
        <li key={`a${r.id}`}>
          <span className="num mr-2 text-gain">added</span>
          {r.rendered} <span className="text-muted">as {STATUS_TEXT[r.status]?.toLowerCase()}</span>
        </li>
      ))}
      {d.removed.map((r) => (
        <li key={`r${r.id}`}>
          <span className="num mr-2 text-loss">removed</span>
          {r.rendered}
        </li>
      ))}
      {d.changed.map((c) => (
        <li key={`c${c.id}`}>
          <span className="num mr-2 text-signal">changed</span>
          {c.rendered} <span className="text-muted">from {c.from} to {c.to}</span>
        </li>
      ))}
      <li className="text-muted">{d.unchanged} unchanged.</li>
    </ul>
  );
}

type SaveState = { phase: 'idle' } | { phase: 'saving' } | { phase: 'saved' } | { phase: 'error'; message: string };

function CloudSave({ desk, book }: { desk: ReadyDesk; book: Rulebook }) {
  const [optIn, setOptIn] = useState(false);
  const [state, setState] = useState<SaveState>({ phase: 'idle' });
  const id = useId();

  const save = async () => {
    setState({ phase: 'saving' });
    try {
      const deviceId = await desk.getDeviceId();
      const req = saveRequest(book, deviceId);
      const res = await fetch('/api/rulebooks', { method: 'POST', headers: req.headers, body: req.body });
      if (!res.ok) {
        setState({ phase: 'error', message: `POST /api/rulebooks answered HTTP ${res.status}. Nothing was saved.` });
        return;
      }
      setState({ phase: 'saved' });
    } catch (e) {
      setState({ phase: 'error', message: `POST /api/rulebooks failed: ${e instanceof Error ? e.message : 'network error'}.` });
    }
  };

  return (
    <SectionCard label="Optional" title="Save a copy to Holdout" icon={Cloud}>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <input id={id} type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--signal)]" />
          <label htmlFor={id} className="text-[14px]">
            Save this rulebook version to Holdout storage. This is off by default.
          </label>
        </div>
        <p className="max-w-[70ch] text-[13px] text-muted">
          What is stored: the rule definitions and their status, the aggregate numbers behind each rule, the similar-trade aggregates (symbol, side, session and leverage bucket with counts, win rate and totals), the ledger counts, and a random device id made in this browser. No fills, no order ids, no API keys. The device id is the only key to the saved copy.
        </p>
        <Button variant="secondary" onClick={() => void save()} disabled={!optIn || state.phase === 'saving'}>
          <Icon icon={Cloud} />
          {state.phase === 'saving' ? 'Saving' : 'Save version'}
        </Button>
        {state.phase === 'saved' ? <p className="text-[14px] text-gain">Saved version {book.version}.</p> : null}
        {state.phase === 'error' ? (
          <p role="alert" className="text-[14px] text-loss">
            {state.message}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

function RulebookBody({ desk }: { desk: ReadyDesk }) {
  const { rulebook: draft, versions } = desk;
  const [pick, setPick] = useState<string>('draft');
  const [diffFrom, setDiffFrom] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const fromId = useId();
  const pickId = useId();

  if (!draft) return <StateBlock variant="empty" title="No rulebook yet" body="Load a history first." />;

  const books: { key: string; label: string; book: Rulebook }[] = [
    ...versions.map((b) => ({ key: `v${b.version}`, label: `Version ${b.version}, ${b.createdAt.slice(0, 16).replace('T', ' ')} UTC`, book: b })),
    { key: 'draft', label: 'Current draft, not saved', book: draft },
  ];
  const chosen = books.find((b) => b.key === pick) ?? books[books.length - 1];
  const fromBook = books.find((b) => b.key === diffFrom) ?? (books.length > 1 ? books[books.length - 2] : undefined);
  if (!chosen) return null;
  const verified = verifyRulebook(chosen.book);

  const download = () => {
    const blob = new Blob([rulebookJson(chosen.book)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = rulebookFileName(chosen.book);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(rulebookJson(chosen.book));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-8">
      <DeskSummary desk={desk} />
      <SectionCard
        label="01 / Draft"
        title={`Current rulebook, would be version ${versions.length + 1}`}
        icon={BookMarked}
        aside={
          <Button size="sm" onClick={() => void desk.saveRulebookVersion()}>
            <Icon icon={Save} />
            Save as version {versions.length + 1}
          </Button>
        }
      >
        <div className="space-y-3">
          <RuleList book={draft} />
          <p className="num break-all text-[11px] text-muted">sha256 {draft.sha256}</p>
          <p className="text-[13px] text-muted">
            Stated rules come from your rules page. Adopted and rejected rules come from the proposals page. Only stated and adopted rules are checked against a new trade idea.
          </p>
        </div>
      </SectionCard>

      <SectionCard label="02 / Versions" title="Saved versions and what changed" icon={History}>
        {versions.length === 0 ? (
          <StateBlock
            variant="empty"
            title="No saved versions"
            body="Save the draft, or adopt or reject a proposal, to write version 1."
            action={
              <>
                <Button size="sm" onClick={() => void desk.saveRulebookVersion()}>
                  <Icon icon={Save} />
                  Save version 1
                </Button>
                <ButtonLink href="/desk/proposals" variant="secondary" size="sm">
                  Review proposals
                </ButtonLink>
              </>
            }
          />
        ) : (
          <div className="space-y-4">
            <ul className="divide-y divide-line rounded-card border border-line text-[14px]">
              {versions.map((b) => (
                <li key={b.version} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
                  <span>Version {b.version}</span>
                  <span className="num text-[12px] text-muted">
                    {b.rules.length} rules, {b.createdAt.slice(0, 16).replace('T', ' ')} UTC, {b.sha256.slice(0, 12)}
                  </span>
                </li>
              ))}
            </ul>
            {books.length > 1 && fromBook ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-[14px]">
                  <label htmlFor={fromId} className="text-muted">
                    Compare
                  </label>
                  <select id={fromId} value={fromBook.key} onChange={(e) => setDiffFrom(e.target.value)} className="rounded-control border border-line bg-paper px-2 py-1">
                    {books.slice(0, -1).map((b) => (
                      <option key={b.key} value={b.key}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-muted">with the current draft</span>
                </div>
                <Diff from={fromBook.book} to={draft} />
              </div>
            ) : null}
          </div>
        )}
      </SectionCard>

      <SectionCard label="03 / Export" title="Export JSON with its hash" icon={FileJson}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            <label htmlFor={pickId} className="text-muted">
              Version
            </label>
            <select id={pickId} value={chosen.key} onChange={(e) => setPick(e.target.value)} className="max-w-full rounded-control border border-line bg-paper px-2 py-1">
              {books.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <p className="num break-all text-[12px]">sha256 {chosen.book.sha256}</p>
          <p className={verified ? 'flex items-center gap-2 text-[13px] text-gain' : 'flex items-center gap-2 text-[13px] text-loss'}>
            <Icon icon={verified ? ShieldCheck : TriangleAlert} />
            {verified ? 'The hash matches the file contents.' : 'The hash does not match the contents.'}
          </p>
          <p className="num break-all text-[12px] text-muted">{rulebookFileName(chosen.book)}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={download}>
              <Icon icon={Download} />
              Download JSON
            </Button>
            <Button variant="secondary" onClick={() => void copy()}>
              <Icon icon={copied ? Check : Copy} />
              {copied ? 'Copied' : 'Copy JSON'}
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard label="04 / Skill" title="Install the Skill with this rulebook" icon={Plug}>
        <div className="space-y-3 text-[14px]">
          <p>
            Install the Holdout Skill for your agent from the{' '}
            <Link href="/skill" className="underline underline-offset-4">
              Skill page
            </Link>
            . Then point it at the file you just downloaded.
          </p>
          <Card>
            <CardBody>
              <pre className="num overflow-x-auto text-[12px] leading-relaxed">{`mkdir -p ~/.holdout
mv ~/Downloads/${rulebookFileName(chosen.book)} ~/.holdout/rulebook.json
export HOLDOUT_RULEBOOK=~/.holdout/rulebook.json`}</pre>
            </CardBody>
          </Card>
          <p className="text-[13px] text-muted">
            The Skill reads HOLDOUT_RULEBOOK, checks the hash, and answers check-a-trade questions from this file. It never places orders. If you keep your shell profile elsewhere, set the variable there so every session sees it.
          </p>
        </div>
      </SectionCard>

      <CloudSave desk={desk} book={chosen.book} />
    </div>
  );
}

export function RulebookView() {
  return <DeskGate>{(desk) => <RulebookBody desk={desk} />}</DeskGate>;
}
