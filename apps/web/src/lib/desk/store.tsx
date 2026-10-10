'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ruleId, type Rule, type Rulebook } from '@holdout/engine';
import type { Surface } from '@/components/ui';
import { loadMarkCandles } from './market';
import { kvClearAll, kvGet, kvSet, persistenceFailure, randomDeviceId } from './persist';
import { buildDraftRulebook, diffRulebooks } from './rulebook-build';
import { loadSampleFile } from './samples-client';
import { mapStatedRules, toDeskRule } from './stated-rules';
import { SyncError, runSync, type SyncCredentials, type SyncStep } from './sync';
import { EngineError, callEngine } from './worker-client';
import { UnrecognizedCsvError } from './pipeline';
import type {
  Analysis,
  BaseAnalysis,
  CandleStore,
  DeskHistory,
  DeskRule,
  DeskSource,
  ImportReport,
  RulebookDecision,
  UnmappedStatedRule,
} from './types';

export interface DeskError {
  surface: Surface;
  message: string;
}

export type DeskPhase = 'hydrating' | 'empty' | 'loading' | 'ready';

export interface DeskStatus {
  phase: DeskPhase;
  stage: string | null;
  error: DeskError | null;
  persistenceNote: string | null;
  candles: { running: boolean; done: number; total: number; error: string | null };
}

export interface DeskApi {
  source: DeskSource | null;
  history: DeskHistory | null;
  status: DeskStatus;
  analysis: Analysis | null;
  rules: DeskRule[];
  unmappedRules: UnmappedStatedRule[];
  setRules: (next: DeskRule[]) => void;
  addRule: (rule: Rule, sourceText?: string) => void;
  removeRule: (id: string) => void;
  rulebook: Rulebook | null;
  versions: Rulebook[];
  decisions: Record<string, RulebookDecision>;
  saveRulebookVersion: () => Promise<Rulebook | null>;
  decideProposal: (id: string, decision: RulebookDecision) => Promise<Rulebook | null>;
  loadSample: (id: string) => Promise<boolean>;
  loadFromFile: (file: File) => Promise<boolean>;
  loadFromSync: (credentials: SyncCredentials, options: { paper: boolean; onStep?: (step: SyncStep) => void }) => Promise<boolean>;
  loadMarketCandles: () => Promise<void>;
  clearAll: () => Promise<void>;
  getDeviceId: () => Promise<string>;
}

const DeskContext = createContext<DeskApi | null>(null);

const SESSION_KEY = 'session';
const DEVICE_KEY = 'deviceId';
const versionsKey = (id: string) => `versions:${id}`;
const decisionsKey = (id: string) => `decisions:${id}`;

function errorOf(e: unknown, fileName: string): DeskError {
  if (e instanceof SyncError) return { surface: e.surface, message: e.message };
  if (e instanceof UnrecognizedCsvError) {
    return { surface: 'Holdout data file', message: `${fileName}: no adapter matches this header. Holdout reads the Bitget export, the money_boys backtest CSV and the money_boys paper CSV.` };
  }
  if (e instanceof EngineError) return { surface: 'Holdout data file', message: `${fileName}: ${e.message}` };
  return { surface: 'Holdout data file', message: `${fileName}: ${e instanceof Error ? e.message : 'could not be read'}` };
}

export function DeskProvider({ children }: { children: ReactNode }) {
  const [source, setSource] = useState<DeskSource | null>(null);
  const [history, setHistory] = useState<DeskHistory | null>(null);
  const [base, setBase] = useState<BaseAnalysis | null>(null);
  const [audits, setAudits] = useState<Analysis['audits']>({});
  const [rules, setRulesState] = useState<DeskRule[]>([]);
  const [unmapped, setUnmapped] = useState<UnmappedStatedRule[]>([]);
  const [versions, setVersions] = useState<Rulebook[]>([]);
  const [decisions, setDecisions] = useState<Record<string, RulebookDecision>>({});
  const [phase, setPhase] = useState<DeskPhase>('hydrating');
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<DeskError | null>(null);
  const [persistenceNote, setPersistenceNote] = useState<string | null>(null);
  const [candleState, setCandleState] = useState<DeskStatus['candles']>({ running: false, done: 0, total: 0, error: null });

  const seq = useRef(0);
  const auditSeq = useRef(0);
  const candles = useRef<CandleStore>({});
  const candleAbort = useRef<AbortController | null>(null);
  const live = useRef({ source, history, rules });
  useEffect(() => {
    live.current = { source, history, rules };
  }, [source, history, rules]);

  const refreshNote = useCallback(() => setPersistenceNote(persistenceFailure()), []);

  const runAudit = useCallback(async (next: DeskRule[]) => {
    const mine = ++auditSeq.current;
    if (next.length === 0) {
      setAudits({});
      return;
    }
    try {
      const result = await callEngine({ type: 'audit', rules: next.map((r) => r.rule) });
      if (mine === auditSeq.current) setAudits(result);
    } catch (e) {
      if (mine === auditSeq.current) setError({ surface: 'Holdout data file', message: e instanceof Error ? e.message : 'Audit failed' });
    }
  }, []);

  const commit = useCallback(
    async (nextSource: DeskSource, nextHistory: DeskHistory, nextRules: DeskRule[], nextUnmapped: UnmappedStatedRule[], mine: number): Promise<boolean> => {
      setStage('Building the ledger and running the holdout');
      const [vers, decs] = await Promise.all([
        kvGet<Rulebook[]>(versionsKey(nextSource.id)),
        kvGet<Record<string, RulebookDecision>>(decisionsKey(nextSource.id)),
      ]);
      const analysis = await callEngine({ type: 'analyze', traderId: nextSource.id, history: nextHistory, candles: candles.current });
      if (mine !== seq.current) return false;
      setSource(nextSource);
      setHistory(nextHistory);
      setBase(analysis);
      setRulesState(nextRules);
      setUnmapped(nextUnmapped);
      setVersions(vers ?? []);
      setDecisions(decs ?? {});
      setAudits({});
      setPhase('ready');
      setStage(null);
      setError(null);
      await kvSet(SESSION_KEY, { source: nextSource, history: nextHistory, rules: nextRules, unmapped: nextUnmapped });
      refreshNote();
      void runAudit(nextRules);
      return true;
    },
    [refreshNote, runAudit],
  );

  useEffect(() => {
    const mine = seq.current;
    let cancelled = false;
    void (async () => {
      const saved = await kvGet<{ source: DeskSource; history: DeskHistory; rules: DeskRule[]; unmapped: UnmappedStatedRule[] }>(SESSION_KEY);
      if (cancelled || mine !== seq.current) return;
      if (!saved) {
        setPhase('empty');
        refreshNote();
        return;
      }
      try {
        await commit(saved.source, saved.history, saved.rules, saved.unmapped, mine);
      } catch (e) {
        if (cancelled) return;
        setPhase('empty');
        setError({ surface: 'Holdout data file', message: `The saved history could not be re-analyzed: ${e instanceof Error ? e.message : 'unknown error'}` });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [commit, refreshNote]);

  const begin = useCallback((message: string): number => {
    seq.current += 1;
    candles.current = {};
    candleAbort.current?.abort();
    setStage(message);
    setError(null);
    setPhase((p) => (p === 'ready' ? 'ready' : 'loading'));
    return seq.current;
  }, []);

  const fail = useCallback((e: DeskError, mine: number) => {
    if (mine !== seq.current) return;
    setError(e);
    setStage(null);
    setPhase((p) => (p === 'loading' ? 'empty' : p));
  }, []);

  const loadSample = useCallback(
    async (id: string): Promise<boolean> => {
      const mine = begin(`Loading ${id}`);
      const result = await loadSampleFile(id);
      if (result.status !== 'ok') {
        fail(
          { surface: 'Holdout data file', message: result.status === 'absent' ? `/data/samples/${id}.json was not found.` : `/data/samples/${id}.json could not be read: ${result.message}` },
          mine,
        );
        return false;
      }
      const { meta, history: h } = result.data;
      const nextSource: DeskSource = {
        id: meta.id,
        label: meta.label,
        kind: meta.kind,
        origin: 'sample',
        detail: meta.source,
        notes: meta.notes,
        statedRules: meta.statedRules,
        untestedAgainstLiveExport: false,
        loadedAt: Date.now(),
      };
      const mapped = mapStatedRules(meta.statedRules ?? []);
      try {
        return await commit(nextSource, h, mapped.mapped, mapped.unmapped, mine);
      } catch (e) {
        fail(errorOf(e, `${id}.json`), mine);
        return false;
      }
    },
    [begin, commit, fail],
  );

  const keepIntakeRules = useCallback(() => live.current.rules.filter((r) => r.origin === 'intake'), []);

  const loadFromFile = useCallback(
    async (file: File): Promise<boolean> => {
      const mine = begin(`Reading ${file.name}`);
      try {
        const text = await file.text();
        const parsed = await callEngine({ type: 'parse-csv', text });
        const report: ImportReport = parsed.report;
        const kind = parsed.adapter === 'bitget-export' ? 'human-live' : 'strategy-sample';
        const nextSource: DeskSource = {
          id: `csv-${parsed.adapter ?? 'file'}`,
          label: `CSV import: ${file.name}`,
          kind,
          origin: 'csv',
          detail: `${file.name}, read in this browser with the ${parsed.adapter ?? 'detected'} adapter`,
          notes: report.notes,
          adapter: parsed.adapter,
          untestedAgainstLiveExport: report.untestedAgainstLiveExport,
          loadedAt: Date.now(),
          report,
        };
        return await commit(nextSource, parsed.history, keepIntakeRules(), [], mine);
      } catch (e) {
        fail(errorOf(e, file.name), mine);
        return false;
      }
    },
    [begin, commit, fail, keepIntakeRules],
  );

  const loadFromSync = useCallback<DeskApi['loadFromSync']>(
    async (credentials, options) => {
      const mine = begin('Syncing from Bitget');
      try {
        const run = await runSync(credentials, {
          paper: options.paper,
          onStep: (step) => {
            options.onStep?.(step);
            if (mine === seq.current) setStage(`Sync step: ${step}`);
          },
        });
        const parsed = await callEngine({ type: 'normalize-sync', payload: run.payload });
        const report: ImportReport = { ...parsed.report, notes: run.permission.warning ? [...parsed.report.notes, run.permission.warning] : parsed.report.notes };
        const nextSource: DeskSource = {
          id: options.paper ? 'sync-bitget-demo' : 'sync-bitget',
          label: options.paper ? 'Bitget Demo account sync, last 90 days' : 'Bitget account sync, last 90 days',
          kind: options.paper ? 'human-demo' : 'human-live',
          origin: 'sync',
          detail: 'Read-only API, signed in this browser',
          notes: report.notes,
          untestedAgainstLiveExport: false,
          loadedAt: Date.now(),
          report,
        };
        return await commit(nextSource, parsed.history, keepIntakeRules(), [], mine);
      } catch (e) {
        fail(errorOf(e, 'Bitget sync'), mine);
        return false;
      }
    },
    [begin, commit, fail, keepIntakeRules],
  );

  const setRules = useCallback(
    (next: DeskRule[]) => {
      setRulesState(next);
      live.current = { ...live.current, rules: next };
      void runAudit(next);
      const { source: s, history: h } = live.current;
      if (s && h) void kvSet(SESSION_KEY, { source: s, history: h, rules: next, unmapped }).then(refreshNote);
    },
    [refreshNote, runAudit, unmapped],
  );

  const addRule = useCallback(
    (rule: Rule, sourceText?: string) => {
      const id = ruleId(rule);
      const current = live.current.rules;
      if (current.some((r) => r.id === id)) return;
      setRules([...current, toDeskRule(rule, 'intake', sourceText)]);
    },
    [setRules],
  );

  const removeRule = useCallback(
    (id: string) => {
      setRules(live.current.rules.filter((r) => r.id !== id));
    },
    [setRules],
  );

  const analysis = useMemo<Analysis | null>(() => (base ? { ...base, audits } : null), [base, audits]);

  const draft = useMemo<Rulebook | null>(() => {
    if (!source || !analysis) return null;
    return buildDraftRulebook({ source, analysis, rules, decisions, version: versions.length + 1, createdAt: new Date(analysis.computedAt).toISOString() });
  }, [source, analysis, rules, decisions, versions.length]);

  const saveWith = useCallback(
    async (nextDecisions: Record<string, RulebookDecision>): Promise<Rulebook | null> => {
      if (!source || !analysis) return null;
      const book = buildDraftRulebook({ source, analysis, rules, decisions: nextDecisions, version: versions.length + 1, createdAt: new Date().toISOString() });
      const last = versions[versions.length - 1];
      if (last) {
        const d = diffRulebooks(last, book);
        if (d.added.length === 0 && d.removed.length === 0 && d.changed.length === 0) return last;
      }
      const next = [...versions, book];
      setVersions(next);
      await kvSet(versionsKey(source.id), next);
      refreshNote();
      return book;
    },
    [source, analysis, rules, versions, refreshNote],
  );

  const saveRulebookVersion = useCallback(() => saveWith(decisions), [saveWith, decisions]);

  const decideProposal = useCallback<DeskApi['decideProposal']>(
    async (id, decision) => {
      if (!source) return null;
      const next = { ...decisions, [id]: decision };
      setDecisions(next);
      await kvSet(decisionsKey(source.id), next);
      return saveWith(next);
    },
    [source, decisions, saveWith],
  );

  const loadMarketCandles = useCallback(async () => {
    const { source: s, history: h } = live.current;
    if (!s || !h || !base) return;
    const mine = seq.current;
    const controller = new AbortController();
    candleAbort.current?.abort();
    candleAbort.current = controller;
    setCandleState({ running: true, done: 0, total: 0, error: null });
    const result = await loadMarkCandles(base.ledger.roundTrips, (done, total) => setCandleState({ running: true, done, total, error: null }), controller.signal);
    if (mine !== seq.current || controller.signal.aborted) return;
    candles.current = result.store;
    const detail =
      Object.keys(result.store).length === 0
        ? `Bitget market candles (S3) did not return data${result.firstError ? `: ${result.firstError}` : ''}.`
        : result.failed > 0
          ? `${result.failed} of ${result.windows} candle windows failed${result.firstError ? `: ${result.firstError}` : ''}.`
          : null;
    setCandleState({ running: false, done: result.windows, total: result.windows, error: detail });
    if (Object.keys(result.store).length === 0) return;
    try {
      const next = await callEngine({ type: 'analyze', traderId: s.id, history: h, candles: result.store });
      if (mine !== seq.current) return;
      setBase(next);
      void runAudit(live.current.rules);
    } catch (e) {
      setCandleState({ running: false, done: result.windows, total: result.windows, error: e instanceof Error ? e.message : 'Re-analysis failed' });
    }
  }, [base, runAudit]);

  const clearAll = useCallback(async () => {
    seq.current += 1;
    candleAbort.current?.abort();
    candles.current = {};
    await kvClearAll();
    setSource(null);
    setHistory(null);
    setBase(null);
    setAudits({});
    setRulesState([]);
    setUnmapped([]);
    setVersions([]);
    setDecisions({});
    setError(null);
    setStage(null);
    setPhase('empty');
    setCandleState({ running: false, done: 0, total: 0, error: null });
    refreshNote();
  }, [refreshNote]);

  const getDeviceId = useCallback(async (): Promise<string> => {
    const existing = await kvGet<string>(DEVICE_KEY);
    if (existing) return existing;
    const created = randomDeviceId();
    await kvSet(DEVICE_KEY, created);
    return created;
  }, []);

  const value = useMemo<DeskApi>(
    () => ({
      source,
      history,
      status: { phase, stage, error, persistenceNote, candles: candleState },
      analysis,
      rules,
      unmappedRules: unmapped,
      setRules,
      addRule,
      removeRule,
      rulebook: draft,
      versions,
      decisions,
      saveRulebookVersion,
      decideProposal,
      loadSample,
      loadFromFile,
      loadFromSync,
      loadMarketCandles,
      clearAll,
      getDeviceId,
    }),
    [source, history, phase, stage, error, persistenceNote, candleState, analysis, rules, unmapped, setRules, addRule, removeRule, draft, versions, decisions, saveRulebookVersion, decideProposal, loadSample, loadFromFile, loadFromSync, loadMarketCandles, clearAll, getDeviceId],
  );

  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>;
}

export function useDesk(): DeskApi {
  const ctx = useContext(DeskContext);
  if (!ctx) throw new Error('useDesk must be used inside DeskProvider');
  return ctx;
}
