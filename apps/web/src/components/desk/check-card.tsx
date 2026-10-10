import { Card, CardHeader, Tag } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatPercent, formatSignedUsdt } from '@/lib/format';
import type { LiveCheck } from '@/lib/check/live';
import { productLabel } from '@/lib/desk/display';

export const DECISION_LINE = 'Holdout never places orders. You decide.';

const STATE_TEXT = { broken: 'Broken', ok: 'Held', not_checkable: 'Not checkable' } as const;

function humanize(value: string): string {
  return value.replaceAll('_', ' ');
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[150px_1fr] sm:gap-4">
      <dt className="label pt-0.5">{label}</dt>
      <dd className="min-w-0 text-[14px]">{children}</dd>
    </div>
  );
}

export function CheckCard({ live, compact = false }: { live: LiveCheck; compact?: boolean }) {
  const { idea, check, earnings, signals } = live;
  const similar = check.similar;
  return (
    <Card>
      <CardHeader
        label="Check a trade"
        title={`${idea.side} ${idea.symbol} ${idea.leverage}x, ${productLabel(idea.product)}, ${idea.time === 'now' ? 'now' : idea.time}`}
        aside={<Tag kind="observed" />}
      />
      <dl>
        <Row label="Rules">
          {check.rules.length === 0 ? (
            <p className="text-muted">The rulebook has no stated or adopted rules, so nothing can be broken.</p>
          ) : (
            <>
              <p className="mb-2 font-medium">
                {check.broken === 0 ? 'No rule broken.' : `${check.broken} of ${check.rules.length} rules broken.`}
              </p>
              <ul className="space-y-2">
                {check.rules.map((r) => (
                  <li key={r.ruleId} className="flex gap-3">
                    <span
                      className={cn(
                        'mt-0.5 inline-flex h-5 shrink-0 items-center rounded-tag border px-1.5 font-mono text-[11px] leading-none',
                        r.state === 'broken' ? 'border-loss text-loss' : r.state === 'ok' ? 'border-line text-ink' : 'border-line border-dashed text-muted',
                      )}
                    >
                      {STATE_TEXT[r.state]}
                    </span>
                    <span className="min-w-0">
                      {r.rendered}
                      <span className="block text-[13px] text-muted">{r.reason}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Row>
        <Row label="Record on similar trades">
          {similar.found && similar.winRate !== null && similar.medianNet !== null && similar.totalNet !== null ? (
            <p className="num">
              {similar.n} similar trades. Win rate {formatPercent(similar.winRate, 0)}. Median net {formatSignedUsdt(similar.medianNet)} USDT. Total net {formatSignedUsdt(similar.totalNet)} USDT.
            </p>
          ) : (
            <p>
              No similar trades in your history.
              {!compact ? <span className="num block text-[12px] text-muted">Bucket: {similar.bucketId}</span> : null}
            </p>
          )}
        </Row>
        <Row label="Session now">
          <p>{humanize(check.sessionNow)}</p>
          <p className="text-[12px] text-muted">US session calendar (S7), America/New_York with daylight saving.</p>
        </Row>
        <Row label="Earnings">
          {earnings.state === 'not_applicable' ? (
            <p className="text-muted">{earnings.note}</p>
          ) : earnings.state === 'unavailable' ? (
            <p>
              <span className="font-medium">bitget-mcp-server (S5) unavailable.</span> <span className="text-muted">{earnings.reason}</span>
            </p>
          ) : earnings.nextDate ? (
            <p>
              Next report {earnings.nextDate}
              {check.earningsHours !== null ? <span className="num text-muted">, in {check.earningsHours.toFixed(1)} hours</span> : null}. <span className="text-muted">Source: S5.</span>
            </p>
          ) : (
            <p>
              S5 lists no upcoming earnings date for {idea.symbol}. <span className="text-muted">That is coverage, not a clear calendar.</span>
            </p>
          )}
        </Row>
        <Row label="Signal tags">
          {signals.state === 'unavailable' ? (
            <p>
              <span className="font-medium">bitget-signal (S6) unavailable.</span> <span className="text-muted">{signals.reason}</span>
            </p>
          ) : (
            <ul className="space-y-2">
              {signals.readings.map((r) => (
                <li key={r.source}>
                  <span className="num text-[12px] text-muted">{r.source}</span>
                  {r.available ? (
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {r.tags.map((t) => (
                        <span key={t.label} className="num rounded-tag border border-line px-1.5 py-0.5 text-[12px]">
                          {t.label}: {t.value}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="block text-[13px]">
                      bitget-signal (S6) unavailable for this tag. <span className="text-muted">{r.reason}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Row>
      </dl>
      <div className="border-t border-line px-4 py-3 text-[14px] font-medium">{DECISION_LINE}</div>
    </Card>
  );
}
