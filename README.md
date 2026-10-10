# Holdout

A trading journal that proves which rules make you money.

Holdout takes a Bitget trader's own fills, audits the rules they say they follow, tests candidate rules on trades they never saw, keeps a rule only if it beats a same-size random rule, and checks new trade ideas against the result. The trader makes every decision. Holdout never places orders.

Built for the Bitget AI Base Camp S2 hackathon, Track 3 (AI Trading Desk), Review and Self-Evolution.

Live: https://holdout.timjosh507.workers.dev

<!-- evidence:start -->
Evidence is published at https://holdout.timjosh507.workers.dev/evidence once the pre-registered evaluation has run.
<!-- evidence:end -->

## How it works

1. Import fills from a read-only Bitget key or a CSV. A CSV is parsed in your browser and never uploaded.
2. Fills are deduped and grouped into round trips, then reconciled against Bitget's own positions history. A ledger that does not reconcile stops proposals.
3. State your rules in plain words. An LLM compiles each one into one of eight typed templates, shows it back, and refuses rules it cannot test. The engine prices each time you broke a rule, with a 90% bootstrap interval.
4. Holdout proposes rules chosen on the first two thirds of your history and tests them on the last third against a 1,000 draw sham and a GetAgent-style baseline. The selection step cannot see the test trades by construction.
5. Check a trade idea against the rulebook before you place it. The Holdout Skill and MCP server do the same inside Claude Code, Codex, OpenClaw and Cursor.

The engine computes every number. The LLM never sees raw fills, and any digit in LLM text must come from an engine-filled slot (the numbers firewall).

## Repository

| Path | What it is |
|---|---|
| `apps/web` | Next.js app on Cloudflare Workers: landing, desk, evidence, methodology |
| `packages/engine` | Pure TypeScript: ledger, round trips, sessions, rules, replay, holdout, stats |
| `packages/bitget` | Typed Bitget UTA v3 clients, signing, S5 and S6 MCP clients |
| `packages/llm` | Rule compiler, idea parser, narrator, numbers firewall, chat |
| `packages/skill` | Holdout Agent Skill (`SKILL.md`) and MCP server (stdio and HTTP) |
| `harness` | Test-subject bots that trade on Bitget Demo only. Not part of the product |
| `scripts` | Evaluation, verification, export and submission scripts |
| `evidence` | Pre-registration, raw data, freeze files, runs |
| `docs` | Methodology, math, decisions, Day-0 findings, sponsor findings |
| `supabase` | Migration for the opt-in tables |

## Develop

Requires Node 24 and pnpm 11.

```
pnpm install
pnpm typecheck
pnpm test
pnpm --filter @holdout/web dev
```

Copy `.env.example` to `.env` and `harness/.env.example` to `harness/.env`. Real keys are git-ignored.

## Verify the evidence

```
pnpm verify
```

This recomputes every published number from `evidence/raw` with no network and no keys, prints PASS or FAIL per number, and runs a tamper test that flips one digit in one fill and must fail.

## Privacy and limits

Fills stay in your browser. A read-only key is signed in the browser and only the signature headers pass through the edge function, in memory. See `/privacy`. Bitget Demo bots test detection power and false positives and are not evidence about human traders. The Bitget CSV adapter is untested against a live export. More in `docs/DECISIONS.md` and `docs/SPONSOR_FINDINGS.md`.

## License

MIT. See `LICENSE`.
