export type Slots = Readonly<Record<string, string>>;

export interface FirewallStats {
  passes: number;
  failures: number;
}

export type Violation =
  | { kind: 'digit'; value: string }
  | { kind: 'unknown_slot'; token: string };

export type NarrationCheck =
  | { ok: true; text: string }
  | { ok: false; violations: Violation[] };

const TOKEN = /\{([a-zA-Z_][a-zA-Z0-9_.]*)\}/g;
const DIGIT_RUN = /\p{Nd}+/gu;

export function narrate(template: string, slots: Slots): string {
  return template.replace(TOKEN, (match, name: string) => {
    const value = slots[name];
    return value === undefined ? match : value;
  });
}

/**
 * Validates LLM text that refers to numbers only through {slot} tokens.
 * Every slot token must exist, and no digit may appear outside a token.
 * Digits that happen to equal a slot value are still rejected, so echoes of
 * rule JSON or recalled figures cannot pass. The returned text has the slots filled.
 */
export function validateNarration(llmText: string, slots: Slots): NarrationCheck {
  const violations: Violation[] = [];
  for (const match of llmText.matchAll(TOKEN)) {
    const name = match[1];
    if (name === undefined || slots[name] === undefined) violations.push({ kind: 'unknown_slot', token: match[0] });
  }
  const outsideTokens = llmText.replace(TOKEN, ' ');
  for (const run of outsideTokens.match(DIGIT_RUN) ?? []) {
    violations.push({ kind: 'digit', value: run });
  }
  if (violations.length > 0) return { ok: false, violations };
  return { ok: true, text: narrate(llmText, slots) };
}

export class Firewall {
  private passes = 0;
  private failures = 0;

  constructor(initial?: FirewallStats) {
    if (initial) {
      this.passes = initial.passes;
      this.failures = initial.failures;
    }
  }

  /** Returns filled LLM text when it passes, otherwise the filled deterministic fallback. */
  guard(llmText: string | null, slots: Slots, fallbackTemplate: string): { text: string; usedFallback: boolean } {
    const check = llmText === null ? null : validateNarration(llmText, slots);
    if (check?.ok) {
      this.passes += 1;
      return { text: check.text, usedFallback: false };
    }
    this.failures += 1;
    return { text: narrate(fallbackTemplate, slots), usedFallback: true };
  }

  stats(): FirewallStats {
    return { passes: this.passes, failures: this.failures };
  }
}
