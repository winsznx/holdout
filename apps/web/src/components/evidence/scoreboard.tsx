import { BadgeCheck, ClipboardCheck, FlaskConical, Users, XCircle, type LucideIcon } from 'lucide-react';
import { Icon, Stat } from '@/components/ui';
import { campaignRows, type EvidenceData } from '@/lib/evidence-data';
import { formatCount } from '@/lib/format';

const SOURCE = '/data/evidence/summary.json';

function Cell({ icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="relative bg-surface p-4 max-lg:[&:last-child:nth-child(odd)]:col-span-2">
      <Icon icon={icon} size={18} className="absolute top-4 right-4 text-muted" />
      {children}
    </div>
  );
}

export function Scoreboard({ data }: { data: EvidenceData }) {
  const traders = data.cohorts.reduce((n, c) => n + c.traders, 0);
  const tested = data.cohorts.reduce((n, c) => n + c.tested, 0);
  const adopt = data.cohorts.reduce((n, c) => n + c.adoptWorthy, 0);
  const rows = campaignRows(data);
  const pass = rows.filter((r) => r.status === 'pass').length;
  const fail = rows.filter((r) => r.status === 'fail').length;
  const notRun = rows.filter((r) => r.status === 'not_run').length;
  const provenance = { kind: 'observed' as const, source: SOURCE };

  return (
    <section aria-label="Scoreboard" className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-5">
      <Cell icon={Users}>
        <Stat label="Traders" value={formatCount(traders)} provenance={{ ...provenance, n: traders }} />
      </Cell>
      <Cell icon={FlaskConical}>
        <Stat label="Reached the test" value={formatCount(tested)} provenance={{ ...provenance, n: traders }} />
      </Cell>
      <Cell icon={BadgeCheck}>
        <Stat label="Adopt worthy" value={formatCount(adopt)} provenance={{ ...provenance, n: traders }} />
      </Cell>
      <Cell icon={ClipboardCheck}>
        <Stat label="Tests passed" value={formatCount(pass)} tone={pass > 0 ? 'gain' : 'neutral'} provenance={{ ...provenance, n: rows.length }} />
      </Cell>
      <Cell icon={XCircle}>
        <Stat label="Tests failed" value={formatCount(fail)} tone={fail > 0 ? 'loss' : 'neutral'} provenance={{ kind: 'observed', source: `${notRun} not run, ${SOURCE}`, n: rows.length }} />
      </Cell>
    </section>
  );
}
