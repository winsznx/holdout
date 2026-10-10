import Link from 'next/link';
import { ButtonLink, Card, CardBody, CardHeader, StateBlock, Stat } from '@/components/ui';
import { EVIDENCE_SUMMARY_PATH, humanizeKey, scalarEntries, structuredEntries, type EvidenceSummary } from '@/lib/evidence';
import type { DataResult } from '@/lib/data-result';

const SOURCE = '/data/evidence/summary.json';

export function EvidenceSummaryView({ result, compact = false }: { result: DataResult<EvidenceSummary>; compact?: boolean }) {
  if (result.status === 'absent') {
    return (
      <StateBlock
        variant="empty"
        title="The evaluation has not been published yet"
        body={`No file exists at ${SOURCE}. Nothing is shown here until the evaluation script writes it. Failed runs and null results will be published with the rest.`}
        action={compact ? <ButtonLink href="/evidence" variant="secondary" size="sm">Open the evidence page</ButtonLink> : null}
      />
    );
  }
  if (result.status === 'error') {
    return <StateBlock variant="error" surface="Holdout data file" title="The evidence summary could not be read" body={`${EVIDENCE_SUMMARY_PATH}: ${result.message}`} />;
  }
  const scalars = scalarEntries(result.data);
  const structured = structuredEntries(result.data);
  if (scalars.length === 0 && structured.length === 0) {
    return <StateBlock variant="partial" title="The evidence summary file is empty" body={`${SOURCE} has no fields yet.`} />;
  }
  const shown = compact ? scalars.slice(0, 4) : scalars;
  return (
    <div className="space-y-6">
      {shown.length > 0 ? (
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((s) => (
            <div key={s.key} className="bg-surface p-4">
              <Stat label={s.label} value={s.value} provenance={{ kind: 'observed', source: SOURCE }} />
            </div>
          ))}
        </div>
      ) : null}
      {!compact
        ? structured.map((s) => (
            <Card key={s.key}>
              <CardHeader label="Field" title={humanizeKey(s.key)} />
              <CardBody>
                <pre className="num max-h-96 overflow-auto text-[12px] leading-relaxed">{s.json}</pre>
              </CardBody>
            </Card>
          ))
        : null}
      {compact ? (
        <p className="text-[14px]">
          <Link href="/evidence" className="underline underline-offset-4">
            Read the full evidence page
          </Link>
        </p>
      ) : null}
    </div>
  );
}
