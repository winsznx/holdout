'use client';

import { useId, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, FlaskConical, KeyRound, ListChecks, RefreshCw, Table2, Trash2, Upload, UploadCloud } from 'lucide-react';
import { Button, ButtonLink, DataTable, Icon, StateBlock } from '@/components/ui';
import { SectionCard } from '@/components/desk/section-card';
import { SourceBanner } from '@/components/desk/gate';
import { productLabel } from '@/lib/desk/display';
import { useDesk } from '@/lib/desk/store';
import type { SyncStep } from '@/lib/desk/sync';
import type { ImportReport } from '@/lib/desk/types';
import { formatCount } from '@/lib/format';
import type { Product } from '@holdout/engine';

const STEP_TEXT: Record<SyncStep, string> = {
  permissions: 'Checking the key is read-only',
  'stock-list': 'Reading the stock futures list',
  fills: 'Reading fills',
  positions: 'Reading positions history',
  funding: 'Reading funding records',
};

function CsvDrop() {
  const desk = useDesk();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const take = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    await desk.loadFromFile(file);
    setBusy(false);
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setOver(false);
    void take(e.dataTransfer.files[0]);
  };

  return (
    <SectionCard label="A / CSV" title="Drop a CSV" icon={Upload}>
      <div className="space-y-3">
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-card border border-dashed px-4 py-6 text-center hover:border-ink ${over ? 'border-signal bg-paper' : 'border-line bg-paper'}`}
        >
          <Icon icon={UploadCloud} size={18} className="mb-1 text-muted" />
          <span className="text-[15px] font-medium">{busy ? 'Reading the file' : 'Drop a CSV here or choose a file'}</span>
          <span className="text-[12px] text-muted">The file is parsed in a worker in this browser. It is never uploaded.</span>
          <input
            ref={input}
            id={inputId}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              void take(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        <ul className="space-y-1.5 text-[13px] text-muted">
          <li>
            Bitget futures export: <span className="rounded-tag border border-dashed border-signal px-1.5 py-0.5 font-mono text-[11px] text-signal">untested against a live Bitget export</span>. The columns follow Bitget documentation, and no real export was available to test against.
          </li>
          <li>money_boys backtest and paper ledger CSVs: detected by header, day-level dates.</li>
        </ul>
        <p className="text-[12px] text-muted">The adapter is chosen from the header row. A file with an unknown header is refused by name.</p>
      </div>
    </SectionCard>
  );
}

function ApiSync() {
  const desk = useDesk();
  const [apiKey, setApiKey] = useState('');
  const [secret, setSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [paper, setPaper] = useState(false);
  const [step, setStep] = useState<SyncStep | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { key: useId(), secret: useId(), pass: useId(), paper: useId() };

  const ready = apiKey.trim() !== '' && secret.trim() !== '' && passphrase.trim() !== '';

  const run = async () => {
    setBusy(true);
    const ok = await desk.loadFromSync({ apiKey: apiKey.trim(), secret: secret.trim(), passphrase: passphrase.trim() }, { paper, onStep: setStep });
    setBusy(false);
    setStep(null);
    if (ok) {
      setApiKey('');
      setSecret('');
      setPassphrase('');
    }
  };

  const field = 'block w-full rounded-control border border-line bg-paper px-3 py-2 font-mono text-[13px] focus-visible:outline-2 focus-visible:outline-signal';

  return (
    <SectionCard label="B / API" title="Sync with a read-only key" icon={KeyRound}>
      <div className="space-y-4">
        <div className="rounded-card border border-line bg-paper p-4 text-[13px] leading-relaxed">
          <p className="label mb-1.5">What moves where</p>
          <p>
            Your secret never leaves this browser. The browser signs each request with WebCrypto and sends our /api/sync route only the method, path, query, timestamp, API key, signature and passphrase. The key and passphrase pass through our edge function in memory while it forwards the signed request to Bitget. It logs nothing and stores nothing. Holdout sends GET requests only, and refuses any key that can trade, transfer or withdraw.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={ids.key} className="label mb-1 block">
              API key
            </label>
            <input id={ids.key} className={field} value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" spellCheck={false} />
          </div>
          <div>
            <label htmlFor={ids.secret} className="label mb-1 block">
              Secret
            </label>
            <input id={ids.secret} type="password" className={field} value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" spellCheck={false} />
          </div>
          <div>
            <label htmlFor={ids.pass} className="label mb-1 block">
              Passphrase
            </label>
            <input id={ids.pass} type="password" className={field} value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoComplete="off" spellCheck={false} />
          </div>
        </div>
        <div className="flex items-center gap-2 text-[14px]">
          <input id={ids.paper} type="checkbox" checked={paper} onChange={(e) => setPaper(e.target.checked)} className="h-4 w-4 accent-[var(--signal)]" />
          <label htmlFor={ids.paper}>This is a Bitget Demo key</label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void run()} disabled={!ready || busy}>
            <Icon icon={RefreshCw} className={busy ? 'motion-safe:animate-spin' : undefined} />
            {busy ? (step ? STEP_TEXT[step] : 'Starting') : 'Sync the last 90 days'}
          </Button>
          <span className="text-[12px] text-muted">Reads USDT futures fills, positions history and funding records. Bitget keeps 90 days of fills.</span>
        </div>
      </div>
    </SectionCard>
  );
}

function OtherExchanges() {
  return (
    <details className="rounded-card border border-line bg-surface">
      <summary className="cursor-pointer list-none px-4 py-3 text-[14px] font-medium hover:bg-paper">Bring your history from Bybit or Binance</summary>
      <div className="space-y-2 border-t border-line px-4 py-4 text-[14px]">
        <p>
          Holdout does not read Bybit or Binance files yet. An adapter is only written against a real export file, so that its columns, time zone and fee fields are checked instead of guessed. No such file has been provided, so the import currently accepts none.
        </p>
        <p className="text-muted">
          If you drop a Bybit or Binance CSV above, it is refused by name and nothing is imported. There is no upload button here on purpose.
        </p>
      </div>
    </details>
  );
}

function Report({ report }: { report: ImportReport }) {
  const productRows = (Object.entries(report.products) as [Product, number][]).map(([product, n]) => ({ product, n }));
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
        {[
          ['Rows read', report.rowsRead],
          ['Fills in', report.fillsIn],
          ['Fills kept', report.fillsOut],
          ['Duplicates dropped', report.duplicatesDropped],
          ['Weak ids', report.weakIdCount],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt className="label">{label}</dt>
            <dd className="num mt-1 text-[22px] leading-none font-medium">{formatCount(Number(value))}</dd>
          </div>
        ))}
      </dl>
      <div>
        <div className="label mb-2">Product classes (fills)</div>
        <DataTable
          caption="Fills by detected product class"
          rows={productRows}
          rowKey={(r) => r.product}
          emptyState={<p className="text-[14px] text-muted">No fills to classify.</p>}
          columns={[
            { key: 'p', header: 'Product', cell: (r) => productLabel(r.product) },
            { key: 'n', header: 'Fills', align: 'right', mono: true, cell: (r) => formatCount(r.n) },
          ]}
        />
      </div>
      {report.weakIdCount > 0 ? <p className="text-[13px] text-muted">A weak id means the row had no exchange execution id, so Holdout hashed order id, time, price, quantity and side. Two genuinely identical fills in one order would merge.</p> : null}
      {report.untestedAgainstLiveExport ? <p className="text-[13px] text-signal">This adapter is untested against a live Bitget export.</p> : null}
      {report.notes.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted">
          {report.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      {report.issues.length > 0 ? (
        <details>
          <summary className="label cursor-pointer select-none hover:text-ink">{report.issues.length} rows were skipped</summary>
          <ul className="mt-2 space-y-1 text-[12px]">
            {report.issues.slice(0, 50).map((i, idx) => (
              <li key={`${i.line}-${idx}`} className="num">
                Line {i.line}: {i.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export function ImportView() {
  const desk = useDesk();
  const { source, history, analysis, status } = desk;
  const emptyAccount = source && history && history.fills.length === 0 && (history.trips?.length ?? 0) === 0;

  return (
    <div className="space-y-8">
      {status.error ? (
        <StateBlock variant="error" surface={status.error.surface} title="That import did not finish" body={status.error.message} />
      ) : null}
      {status.phase === 'loading' || status.phase === 'hydrating' ? <StateBlock variant="loading" title={status.stage ?? 'Reading the saved history'} /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <CsvDrop />
        <ApiSync />
      </div>
      <OtherExchanges />

      <SectionCard label="Import state" title="What is loaded now" icon={Table2}>
        {!source || !history || !analysis ? (
          <StateBlock
            variant="empty"
            title="Nothing is loaded"
            body="Drop a CSV, sync a key, or load a labeled sample that needs no account."
            action={
              <ButtonLink href="/sample" size="sm">
                <Icon icon={FlaskConical} />
                Try the sample
              </ButtonLink>
            }
          />
        ) : emptyAccount ? (
          <div className="space-y-3">
            <SourceBanner source={source} />
            <StateBlock
              variant="empty"
              title="No fills in the last 90 days"
              body="The account answered and has no fills in the window. That is a real empty history, not an error. Place a trade on Bitget and sync again."
            />
          </div>
        ) : (
          <div className="space-y-4">
            <SourceBanner source={source} />
            <Report report={source.report ?? { rowsRead: history.fills.length, fillsIn: analysis.ingest.fillsIn, fillsOut: analysis.ingest.fillsOut, duplicatesDropped: analysis.ingest.duplicatesDropped, weakIdCount: analysis.ingest.weakIdCount, products: analysis.ingest.products, issues: [], untestedAgainstLiveExport: false, notes: source.notes }} />
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/desk/ledger" size="sm">
                Open the ledger
                <Icon icon={ArrowRight} />
              </ButtonLink>
              <ButtonLink href="/desk/rules" variant="secondary" size="sm">
                <Icon icon={ListChecks} />
                Put your rules on trial
              </ButtonLink>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard label="Your data" title="Delete my data" icon={Trash2}>
        <div className="space-y-3 text-[14px]">
          <p className="text-muted">
            Your history, rules, rulebook versions, cached candles and device id live in this browser only. {status.persistenceNote ?? 'They are saved in IndexedDB.'}
          </p>
          <Button variant="secondary" onClick={() => void desk.clearAll()}>
            <Icon icon={Trash2} />
            Delete my data
          </Button>
          <p className="text-[12px] text-muted">
            This clears this browser only. A copy you chose to save to Holdout storage from the{' '}
            <Link href="/desk/rulebook" className="underline underline-offset-4">
              rulebook page
            </Link>{' '}
            is not touched by this button.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
