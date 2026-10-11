'use client';

import { ArrowRight, Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Card, ButtonLink, Icon, STRATEGY_SAMPLE_NOTICE, Skeleton, StateBlock, Tag, TagRow, tagPropsForKind } from '@/components/ui';
import { loadCatalog, type CatalogEntry, type SampleCatalog } from '@/lib/desk/samples-client';
import { useDesk } from '@/lib/desk/store';
import { formatCount } from '@/lib/format';
import type { DataResult } from '@/lib/data-result';

const KIND_NOTE: Record<NonNullable<CatalogEntry['kind']>, string> = {
  bot: 'Real fills read back from Bitget Demo. A bot with a planted habit, not a human trader.',
  'strategy-sample': STRATEGY_SAMPLE_NOTICE,
  'human-demo': 'A person trading on Bitget Demo.',
  'human-live': 'A person trading a live account.',
};

export function SamplePicker() {
  const desk = useDesk();
  const router = useRouter();
  const [catalog, setCatalog] = useState<DataResult<SampleCatalog> | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadCatalog().then((c) => {
      if (!cancelled) setCatalog(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = async (id: string) => {
    setLoadingId(id);
    const ok = await desk.loadSample(id);
    setLoadingId(null);
    if (ok) router.push('/desk/rules');
  };

  if (!catalog) {
    return (
      <div className="space-y-6">
        <StateBlock variant="loading" title="Reading the sample list" />
        <ul className="grid gap-4 md:grid-cols-2" aria-hidden="true">
          {[0, 1].map((i) => (
            <li key={i}>
              <Card className="space-y-3 p-4">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="w-full" />
                <Skeleton className="h-11 w-1/2" />
              </Card>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (catalog.status === 'error') {
    return <StateBlock variant="error" surface="Holdout data file" title="The sample list could not be read" body={catalog.message} />;
  }
  if (catalog.status === 'absent' || catalog.data.entries.length === 0) {
    return <StateBlock variant="empty" title="No sample files are published" body="Expected /data/samples/index.json or the known sample files. None answered." />;
  }

  const { entries, defaultId, missing } = catalog.data;
  const ordered = [...entries].sort((a, b) => (a.id === defaultId ? -1 : b.id === defaultId ? 1 : 0));
  const currentId = desk.source?.origin === 'sample' ? desk.source.id : null;

  return (
    <div className="space-y-6">
      {desk.status.error ? <StateBlock variant="error" surface={desk.status.error.surface} title="That sample did not load" body={desk.status.error.message} /> : null}
      {missing.length > 0 ? <StateBlock variant="partial" title={`${missing.length} sample files are missing`} body={`Not found: ${missing.join(', ')}.`} /> : null}
      {currentId ? (
        <StateBlock
          variant="success"
          title={`${desk.source?.label ?? currentId} is loaded`}
          body="Open it, or pick another history below."
          action={
            <ButtonLink href="/desk/rules" size="sm">
              Open the audit
              <Icon icon={ArrowRight} />
            </ButtonLink>
          }
        />
      ) : null}
      <ul className="grid gap-4 md:grid-cols-2">
        {ordered.map((e) => {
          const isDefault = e.id === defaultId;
          return (
            <li key={e.id}>
              <Card className="flex h-full flex-col gap-3 p-4">
                <TagRow>
                  {e.kind ? <Tag {...tagPropsForKind(e.kind)} /> : null}
                  {isDefault ? (
                    <span className="label inline-flex items-center gap-1">
                      <Icon icon={Star} size={12} />
                      Start here
                    </span>
                  ) : null}
                </TagRow>
                <p className="text-[17px] leading-snug font-medium">{e.label ?? e.id}</p>
                {e.kind ? <p className="text-[13px] text-muted">{KIND_NOTE[e.kind]}</p> : null}
                {e.fills !== undefined ? (
                  <p className="num text-[12px] text-muted">
                    {formatCount(e.fills)} fills{e.roundTrips !== undefined ? `, ${formatCount(e.roundTrips)} round trips` : ''}
                  </p>
                ) : null}
                <div className="mt-auto pt-1">
                  <Button variant={isDefault ? 'primary' : 'secondary'} onClick={() => void choose(e.id)} disabled={loadingId !== null}>
                    {loadingId === e.id ? 'Loading' : currentId === e.id ? 'Reload and open the audit' : 'Load and open the audit'}
                    {loadingId === e.id ? null : <Icon icon={ArrowRight} />}
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
