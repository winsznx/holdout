'use client';

import type { ReactNode } from 'react';
import { ButtonLink, STRATEGY_SAMPLE_NOTICE, StateBlock, Tag, TagRow, tagPropsForKind } from '@/components/ui';
import { useDesk, type DeskApi } from '@/lib/desk/store';
import type { Analysis, DeskHistory, DeskSource } from '@/lib/desk/types';

export type ReadyDesk = DeskApi & { source: DeskSource; history: DeskHistory; analysis: Analysis };

function sourceNotice(source: DeskSource): string | null {
  if (source.kind === 'strategy-sample') return STRATEGY_SAMPLE_NOTICE;
  if (source.kind === 'bot') return 'Bitget Demo bot: real fills read back from Bitget Demo, not a human trader.';
  return null;
}

export function SourceBanner({ source }: { source: DeskSource }) {
  const notice = sourceNotice(source);
  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-line bg-surface px-4 py-3">
      <TagRow>
        <Tag {...tagPropsForKind(source.kind)} />
        <span className="text-[14px] font-medium">{source.label}</span>
      </TagRow>
      {notice ? <p className="text-[13px] text-muted">{notice}</p> : null}
      <p className="font-mono text-[11px] text-muted break-all">{source.detail}</p>
    </div>
  );
}

export function DeskGate({ children, banner = true }: { children: (desk: ReadyDesk) => ReactNode; banner?: boolean }) {
  const desk = useDesk();
  const { status, source, history, analysis } = desk;

  if (!source || !history || !analysis) {
    if (status.phase === 'hydrating' || status.phase === 'loading') {
      return <StateBlock variant="loading" title={status.stage ?? 'Reading the saved history in this browser'} body="The engine runs in a worker, so the page stays usable." />;
    }
    if (status.error) {
      return (
        <StateBlock
          variant="error"
          surface={status.error.surface}
          title="The history could not be loaded"
          body={status.error.message}
          action={
            <>
              <ButtonLink href="/desk/import" size="sm">
                Try the import page
              </ButtonLink>
              <ButtonLink href="/sample" variant="secondary" size="sm">
                Load a sample
              </ButtonLink>
            </>
          }
        />
      );
    }
    return (
      <StateBlock
        variant="empty"
        title="No history is loaded"
        body="Load a sample, drop a CSV or sync a read-only key. Everything stays in this browser."
        action={
          <>
            <ButtonLink href="/sample" size="sm">
              Try the sample
            </ButtonLink>
            <ButtonLink href="/desk/import" variant="secondary" size="sm">
              Import history
            </ButtonLink>
          </>
        }
      />
    );
  }

  const ready: ReadyDesk = { ...desk, source, history, analysis };
  return (
    <div className="space-y-6">
      {status.error ? <StateBlock variant="error" surface={status.error.surface} title="The last load did not finish" body={status.error.message} /> : null}
      {status.phase === 'loading' ? <StateBlock variant="loading" title={status.stage ?? 'Loading'} /> : null}
      {banner ? <SourceBanner source={source} /> : null}
      {children(ready)}
    </div>
  );
}
