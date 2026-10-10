import type {
  BucketStats,
  Fill,
  FundingRecord,
  HoldoutOutcome,
  Ledger,
  Product,
  ReferencePosition,
  Reconciliation,
  Rule,
  RuleAudit,
  Rulebook,
  RoundTrip,
  TripTags,
} from '@holdout/engine';

export type HistoryKind = 'bot' | 'strategy-sample' | 'human-demo' | 'human-live';
export type SourceOrigin = 'sample' | 'csv' | 'sync';
export type CsvAdapter = 'money-boys-backtest' | 'money-boys-paper' | 'bitget-export';

export interface DeskHistory {
  fills: Fill[];
  funding: FundingRecord[];
  reference: ReferencePosition[];
  fundingSettlements?: Record<string, number[]>;
  dayLevel?: boolean;
  trips?: RoundTrip[];
}

export interface ImportReport {
  rowsRead: number;
  fillsIn: number;
  fillsOut: number;
  duplicatesDropped: number;
  weakIdCount: number;
  products: Partial<Record<Product, number>>;
  issues: { line: number; reason: string }[];
  adapter?: CsvAdapter;
  untestedAgainstLiveExport: boolean;
  notes: string[];
}

export interface DeskSource {
  id: string;
  label: string;
  kind: HistoryKind;
  origin: SourceOrigin;
  detail: string;
  notes: string[];
  statedRules?: string[];
  adapter?: CsvAdapter;
  untestedAgainstLiveExport: boolean;
  loadedAt: number;
  report?: ImportReport;
}

export interface DeskRule {
  id: string;
  rule: Rule;
  origin: 'sample' | 'intake';
  sourceText?: string;
}

export interface UnmappedStatedRule {
  text: string;
  reason: string;
}

export interface GroupStats {
  n: number;
  net: string;
  fees: string;
  funding: string;
  winRate: number | null;
}

export interface LabeledGroup extends GroupStats {
  key: string;
  label: string;
}

export interface FundingLens {
  records: number;
  total: string | null;
  tripsWithFunding: number;
  unavailableReason?: string;
}

export interface SessionLens {
  unavailableReason?: string;
  bySession: LabeledGroup[];
  holds: LabeledGroup[];
  productCompare: { stockPerp: GroupStats | null; rtoken: GroupStats | null; missing: string[] };
  funding: FundingLens;
  premium: { available: false; reason: string };
}

export interface IngestSummary {
  fillsIn: number;
  fillsOut: number;
  duplicatesDropped: number;
  weakIdCount: number;
  products: Partial<Record<Product, number>>;
}

export type CandleCoverage = 'none' | 'loading' | 'partial' | 'loaded' | 'unavailable';

export interface CandleStatus {
  coverage: CandleCoverage;
  symbols: number;
  tripsCovered: number;
  tripsTotal: number;
  detail: string;
}

export interface BaseAnalysis {
  computedAt: number;
  dayLevel: boolean;
  ledger: Ledger;
  ingest: IngestSummary;
  reconciliation: Reconciliation;
  tags: Record<string, TripTags>;
  holdout: HoldoutOutcome | null;
  holdoutBlockedReason: string | null;
  sessionLens: SessionLens;
  buckets: BucketStats[];
  candles: CandleStatus;
}

export interface Analysis extends BaseAnalysis {
  audits: Record<string, RuleAudit>;
}

export interface CandleBar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type CandleStore = Record<string, CandleBar[]>;

export type RulebookDecision = 'adopted' | 'rejected';

export interface PersistedSession {
  source: DeskSource;
  history: DeskHistory;
  rules: DeskRule[];
  unmapped: UnmappedStatedRule[];
}

export interface DeskVersionDiff {
  added: Rulebook['rules'];
  removed: Rulebook['rules'];
  changed: { id: string; rendered: string; from: string; to: string }[];
  unchanged: number;
}
