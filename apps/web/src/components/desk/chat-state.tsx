'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { runLiveCheck, type LiveCheck } from '@/lib/check/live';
import { answerLocally, buildContext, chatRemote, type ChatCardView, type FirewallCount, type WireMessage } from '@/lib/chat/client';
import { useDesk } from '@/lib/desk/store';
import { loadEvidenceData, loadFirewall } from '@/lib/evidence-data';

export interface ProviderFailure {
  surface: string;
  message: string;
}

export type Turn =
  | { id: string; role: 'user'; text: string }
  | {
      id: string;
      role: 'assistant';
      text: string;
      cards: ChatCardView[];
      checks: LiveCheck[];
      checkErrors: string[];
      firewall: FirewallCount | null;
      provider: string | null;
      model: string | null;
      providerError: ProviderFailure | null;
    };

export interface ChatApi {
  turns: Turn[];
  busy: boolean;
  firewall: FirewallCount;
  send: (text: string) => Promise<void>;
  clear: () => void;
}

const ChatContext = createContext<ChatApi | null>(null);

const MAX_HISTORY = 11;

export function ChatProvider({ children }: { children: ReactNode }) {
  const desk = useDesk();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [firewall, setFirewall] = useState<FirewallCount>({ passes: 0, failures: 0 });
  const counter = useRef(0);
  const turnsRef = useRef<Turn[]>([]);

  const push = useCallback((turn: Turn) => {
    turnsRef.current = [...turnsRef.current, turn];
    setTurns(turnsRef.current);
  }, []);

  const nextId = () => `t${(counter.current += 1)}`;

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (text === '' || busy) return;
      const prior: WireMessage[] = turnsRef.current.slice(-MAX_HISTORY).map((t) => ({ role: t.role, content: t.text.slice(0, 2000) }));
      push({ id: nextId(), role: 'user', text });
      setBusy(true);
      const snapshot = { rules: desk.rules, analysis: desk.analysis, rulebook: desk.rulebook };
      const trips = desk.analysis?.ledger.roundTrips ?? [];
      try {
        const [evidence, firewallFile] = await Promise.all([loadEvidenceData(), loadFirewall()]);
        const evidenceData = evidence.status === 'ok' ? evidence.data : null;
        const firewallData = firewallFile.status === 'ok' ? firewallFile.data : null;
        const remote = await chatRemote([...prior, { role: 'user', content: text }], buildContext(snapshot, evidenceData, firewallData));

        const checkIdeas = remote.kind === 'ok' ? remote.ideas : [];
        const local = remote.kind === 'error' ? answerLocally(text, snapshot, evidenceData, firewallData) : null;
        if (local?.idea) checkIdeas.push(local.idea);

        const checks: LiveCheck[] = [];
        const checkErrors: string[] = [];
        for (const idea of checkIdeas) {
          if (!desk.rulebook) {
            checkErrors.push('No rulebook is loaded, so the trade idea could not be checked.');
            continue;
          }
          const result = await runLiveCheck(desk.rulebook, trips, idea);
          if ('error' in result) checkErrors.push(result.error);
          else checks.push(result);
        }

        if (remote.kind === 'ok') {
          setFirewall((f) => ({ passes: f.passes + remote.firewall.passes, failures: f.failures + remote.firewall.failures }));
          push({ id: nextId(), role: 'assistant', text: remote.text, cards: remote.cards, checks, checkErrors, firewall: remote.firewall, provider: remote.provider, model: remote.model, providerError: null });
        } else if (local) {
          push({
            id: nextId(),
            role: 'assistant',
            text: local.text,
            cards: local.cards,
            checks,
            checkErrors,
            firewall: null,
            provider: null,
            model: null,
            providerError: { surface: remote.surface, message: remote.message },
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, desk.rules, desk.analysis, desk.rulebook, push],
  );

  const clear = useCallback(() => {
    turnsRef.current = [];
    setTurns([]);
  }, []);

  const value = useMemo<ChatApi>(() => ({ turns, busy, firewall, send, clear }), [turns, busy, firewall, send, clear]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatApi {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside ChatProvider');
  return ctx;
}
