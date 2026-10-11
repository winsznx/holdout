'use client';

import { Calculator, CircleAlert, Database, ListChecks, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useId, useState } from 'react';
import type { Rule, RoundTrip, RuleAudit } from '@holdout/engine';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { RuleCard } from '@/components/ui/rule-card';
import { Skeleton } from '@/components/ui/skeleton';
import { StateBlock } from '@/components/ui/state-block';
import { tagPropsForKind } from '@/components/ui/tag';
import { DeskGate, type ReadyDesk } from '@/components/desk/gate';
import { DeskSummary } from '@/components/desk/desk-summary';
import { SectionCard } from '@/components/desk/section-card';
import { SortableTable, type SortColumn } from '@/components/desk/sortable-table';
import { formatTs, productLabel, signedMoney, toneClass } from '@/lib/desk/display';
import { RULE_EXAMPLES, costOfBreaking, parseCompileResponse, type CompileOutcome } from '@/lib/desk/rule-view';
import type { DeskRule } from '@/lib/desk/types';

type IntakeState = { phase: 'idle' } | { phase: 'compiling' } | { phase: 'done'; text: string; outcome: CompileOutcome };

function Intake({ desk }: { desk: ReadyDesk }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<IntakeState>({ phase: 'idle' });
  const inputId = useId();

  const compile = async () => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setState({ phase: 'compiling' });
    try {
      const res = await fetch('/api/llm/compile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: trimmed }) });
      if (!res.ok) {
        setState({ phase: 'done', text: trimmed, outcome: { kind: 'error', message: `POST /api/llm/compile answered HTTP ${res.status}. Nothing was added.` } });
        return;
      }
      setState({ phase: 'done', text: trimmed, outcome: parseCompileResponse(await res.json()) });
    } catch (e) {
      setState({ phase: 'done', text: trimmed, outcome: { kind: 'error', message: `POST /api/llm/compile failed: ${e instanceof Error ? e.message : 'network error'}.` } });
    }
  };

  const outcome = state.phase === 'done' ? state.outcome : null;

  return (
    <SectionCard label="Say a rule" title="Add a rule in plain language" icon={Sparkles}>
      <div className="space-y-3">
        <label htmlFor={inputId} className="block text-[14px] text-muted">
          Write one rule you try to follow. Holdout turns it into one of eight testable templates and shows you the result before anything is added.
        </label>
        <textarea
          id={inputId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={400}
          className="block w-full rounded-control border border-line bg-paper px-3 py-2 text-[15px] focus-visible:outline-2 focus-visible:outline-signal"
          placeholder="For example: wait an hour after a loss"
        />
        <div className="flex flex-wrap gap-1.5">
          {RULE_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setText(example)}
              className="rounded-tag border border-line px-2 py-1 text-left text-[12px] text-muted hover:border-ink hover:text-ink"
            >
              {example}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={compile} disabled={state.phase === 'compiling' || text.trim().length === 0}>
            <Icon icon={Calculator} />
            {state.phase === 'compiling' ? 'Compiling' : 'Compile rule'}
          </Button>
          <span className="text-[12px] text-muted">The text goes to our compiler route. Your fills do not.</span>
        </div>

        {outcome?.kind === 'rule' ? (
          <div className="space-y-3 rounded-card border border-line bg-paper p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="label mb-1.5">Compiled rule</div>
                <pre className="num overflow-x-auto rounded-control border border-line bg-surface p-3 text-[12px]">{JSON.stringify(outcome.rule, null, 2)}</pre>
              </div>
              <div>
                <div className="label mb-1.5">Canonical English</div>
                <p className="rounded-control border border-line bg-surface p-3 text-[16px] leading-snug font-medium">{outcome.canonical}</p>
                {outcome.rendered !== null && outcome.rendered !== outcome.canonical ? (
                  <p className="mt-1.5 text-[12px] text-muted">The route also returned different wording. The engine wording above is the one that is tested.</p>
                ) : null}
              </div>
            </div>
            <p className="text-[13px] text-muted">If this is not what you meant, discard it and reword. Nothing is tested until you add it.</p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  desk.addRule(outcome.rule, state.phase === 'done' ? state.text : undefined);
                  setText('');
                  setState({ phase: 'idle' });
                }}
              >
                <Icon icon={Plus} />
                Add to my rules
              </Button>
              <Button variant="secondary" onClick={() => setState({ phase: 'idle' })}>
                <Icon icon={X} />
                Discard
              </Button>
            </div>
          </div>
        ) : null}
        {outcome?.kind === 'refused' ? <StateBlock variant="empty" title="This rule cannot be tested against past trades" body={outcome.reason} /> : null}
        {outcome?.kind === 'error' ? (
          <p role="alert" className="flex items-start gap-2 text-[14px] text-loss">
            <Icon icon={CircleAlert} className="mt-0.5" />
            {outcome.message}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

function brokenColumns(dayLevel: boolean): SortColumn<RoundTrip>[] {
  return [
    { key: 'open', header: 'Opened', mono: true, sortValue: (t) => t.openTs, cell: (t) => formatTs(t.openTs, dayLevel) },
    { key: 'symbol', header: 'Symbol', sortValue: (t) => t.symbol, cell: (t) => `${t.symbol} ${t.side}` },
    { key: 'product', header: 'Product', cell: (t) => productLabel(t.product) },
    { key: 'net', header: 'Net P&L', align: 'right', mono: true, sortValue: (t) => Number(t.netPnl), cell: (t) => <span className={toneClass(t.netPnl)}>{signedMoney(t.netPnl)}</span> },
    { key: 'exec', header: 'execIds', cell: (t) => <span className="num break-all text-[11px]">{t.execIds.join(', ')}</span> },
  ];
}

function Drilldown({ desk, audit }: { desk: ReadyDesk; audit: RuleAudit }) {
  const byId = new Map(desk.analysis.ledger.roundTrips.map((t) => [t.id, t]));
  const trips = audit.brokenTripIds.flatMap((id) => {
    const t = byId.get(id);
    return t ? [t] : [];
  });
  return (
    <SortableTable
      caption="Round trips that broke the rule, with execution ids"
      rows={trips}
      rowKey={(t) => t.id}
      columns={brokenColumns(desk.analysis.dayLevel)}
      pageSize={25}
      emptyState={<p className="text-[13px] text-muted">No broken trades.</p>}
    />
  );
}

function RuleItem({ desk, item }: { desk: ReadyDesk; item: DeskRule }) {
  const audit = desk.analysis.audits[item.id];
  if (!audit) {
    return (
      <Card className="p-4">
        <div className="label mb-2">{item.rule.t}</div>
        <Skeleton className="w-3/4" />
        <p className="mt-2 text-[13px] text-muted">Auditing in the worker</p>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      <RuleCard
        rendered={audit.rendered}
        ruleType={item.rule.t}
        status={audit.status}
        breaks={audit.breaks}
        tradesConsidered={audit.tripsConsidered}
        effect={costOfBreaking(audit)}
        untestableReason={audit.untestableReason}
        source={tagPropsForKind(desk.source.kind)}
        sourceLabel={item.sourceText ? `You said: ${item.sourceText}` : item.origin === 'sample' ? 'Stated rule from the sample file' : undefined}
        drilldown={audit.breaks > 0 ? <Drilldown desk={desk} audit={audit} /> : undefined}
      />
      {audit.untestableTrips > 0 && audit.status !== 'untestable' ? (
        <p className="text-[12px] text-muted">
          {audit.untestableTrips} of {audit.tripsConsidered} round trips could not be tested for this rule and are left out of the cost.
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => desk.removeRule(item.id)}>
          <Icon icon={Trash2} />
          Remove rule
        </Button>
      </div>
    </div>
  );
}

function needsCandles(rules: Rule[]): boolean {
  return rules.some((r) => r.t === 'hard_stop');
}

function MarketData({ desk }: { desk: ReadyDesk }) {
  const { analysis, status } = desk;
  const c = analysis.candles;
  const wantsIt = needsCandles(desk.rules.map((r) => r.rule));
  return (
    <SectionCard label="Market data" title="Mark candles for the hard stop replay" icon={Database}>
      <div className="space-y-3 text-[14px]">
        <p className="text-muted">
          A hard stop is tested by replaying Bitget mark candles (S3) from each entry. Without them the hard stop rule is untestable and the holdout skips hard stop candidates.
        </p>
        <p className="num text-[13px]">{c.detail}</p>
        {analysis.dayLevel ? (
          <p className="text-[13px] text-muted">Not in this data: timestamps are day-level, so candles cannot be matched to entries.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant={wantsIt ? 'primary' : 'secondary'} size="sm" onClick={() => void desk.loadMarketCandles()} disabled={status.candles.running}>
              {status.candles.running ? `Fetching ${status.candles.done} of ${status.candles.total || '...'}` : 'Fetch Bitget mark candles'}
            </Button>
            <span className="text-[12px] text-muted">Public data only, through our market route. Cached in this browser.</span>
          </div>
        )}
        {status.candles.error ? (
          <StateBlock variant="error" surface="Bitget market candles and funding history (S3)" title="Candles are unavailable" body={status.candles.error} />
        ) : null}
      </div>
    </SectionCard>
  );
}

function RulesBody({ desk }: { desk: ReadyDesk }) {
  const { rules, unmappedRules } = desk;
  return (
    <div className="space-y-8">
      <DeskSummary desk={desk} />
      <section aria-labelledby="trial-h" className="space-y-4">
        <div className="label flex items-center gap-2">
          <Icon icon={ListChecks} />
          Your rules on trial
        </div>
        <h2 id="trial-h" className="text-[22px]">
          What breaking each rule cost
        </h2>
        {rules.length === 0 ? (
          <StateBlock
            variant="empty"
            title="No rules on trial yet"
            body={desk.source.statedRules ? 'None of the stated rules in this file match a template. Add one below.' : 'This history carries no stated rules. Add the rules you try to follow below and Holdout prices every time you broke them.'}
            action={
              <ButtonLink href="#add-rule" size="sm">
                <Icon icon={Plus} />
                Add a rule
              </ButtonLink>
            }
          />
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              {rules.map((item) => (
                <RuleItem key={item.id} desk={desk} item={item} />
              ))}
            </div>
            <p className="max-w-[70ch] text-[12px] text-muted">
              Cost is the net P&L of the broken trades against what the rule would have left. The interval is a 90% bootstrap over the broken trades with 10,000 resamples. Removing a trade is assumed not to change later trades.
            </p>
          </>
        )}
        {unmappedRules.length > 0 ? (
          <Card>
            <CardHeader label="Not mapped" title="Stated in the file, no template matches" icon={CircleAlert} />
            <CardBody>
              <ul className="space-y-1.5 text-[14px]">
                {unmappedRules.map((u) => (
                  <li key={u.text}>
                    <span className="font-medium">{u.text}</span> <span className="text-muted">{u.reason}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}
      </section>
      <div id="add-rule" className="scroll-mt-20">
        <Intake desk={desk} />
      </div>
      <MarketData desk={desk} />
    </div>
  );
}

export function RulesView() {
  return <DeskGate>{(desk) => <RulesBody desk={desk} />}</DeskGate>;
}
