import { RuleCard } from '@/components/ui/rule-card';
import { STRATEGY_SAMPLE_NOTICE, tagPropsForKind } from '@/components/ui/tag';
import { StateBlock } from '@/components/ui/state-block';
import type { HeroRule, SampleFile } from '@/lib/samples';
import type { DataResult } from '@/lib/data-result';

export interface HeroData {
  sample: DataResult<SampleFile>;
  hero: HeroRule | null;
}

export function HeroRuleCard({ sample, hero }: HeroData) {
  if (sample.status === 'absent') {
    return <StateBlock variant="empty" title="No sample history is published yet" body="This card renders a real rule audit from /data/samples/default.json. The file does not exist yet, so nothing is shown." />;
  }
  if (sample.status === 'error') {
    return <StateBlock variant="error" surface="Holdout data file" title="The sample history could not be read" body={sample.message} />;
  }
  if (!hero) {
    return <StateBlock variant="partial" title="The sample has no closed round trips" body={`${sample.data.meta.label} loaded, but no round trip closed, so no rule can be audited.`} />;
  }
  const { audit, effect } = hero;
  return (
    <div className="space-y-2">
    <RuleCard
      ruleType={audit.rule.t.replaceAll('_', ' ')}
      rendered={audit.rendered}
      status={audit.status}
      breaks={audit.breaks}
      tradesConsidered={audit.tripsConsidered}
      effect={effect}
      untestableReason={audit.untestableReason}
      source={tagPropsForKind(sample.data.meta.kind)}
      sourceLabel={sample.data.meta.label}
    />
    {sample.data.meta.kind === 'strategy-sample' ? <p className="text-[12px] text-muted">{STRATEGY_SAMPLE_NOTICE}</p> : null}
    </div>
  );
}
