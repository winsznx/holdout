# Claim ledger

Each public claim, where it is backed, and its status. Numbers from the evaluation are filled in only from `submission-facts.json` after the run.

| Claim | Backed by | Status |
|---|---|---|
| Holdout never places orders | No order endpoint appears in `apps/web`, `packages/*`. A test in `packages/skill` scans for order paths. `/api/sync` refuses non-GET and non-allowlisted paths. | Verified in code |
| The engine computes every number | `packages/engine`. LLM calls go through `packages/llm`, which only receives aggregates and slot tokens. | Verified in code |
| Ledger conserves P&L | Lemma L1, fast-check, 1,000 runs | Test passes |
| Ingest is idempotent and order independent | Lemma L2 | Test passes |
| Null rule returns the ledger exactly | Lemma L3 | Test passes |
| Removal rules decompose exactly | Lemma L4 | Test passes |
| Sham p-values are valid | Lemma L5, 200-seed uniformity check | Test passes |
| Tags have no look-ahead | Lemma L6 | Test passes |
| Selection cannot see test trades | Lemma L8, and the function signature takes train only | Test passes |
| Ledger reconciles to Bitget's positions history | `reconcile.ts`, run on Demo bot fills | Delta about 2e-8 USDT on early data. Final figure in the evidence run |
| Every published number is recomputable offline | `pnpm verify` | Run after each evaluation |
| The test step cannot run before the freeze is committed | `scripts/eval.ts` checks `git log` and `git status` for the PREREG and freeze files | Verified in code |
| Rule compiler handles all eight templates | Live test against gpt-5.5 | 8 of 8 compile, one untestable rule refused |
| Numbers firewall rejects injected digits | `packages/llm` tests | Test passes |
| Detection power on planted habits | P1b matrix on `/evidence` | Pending evaluation run |
| Healthy control gets "no rule needed" | P2 on `/evidence` | Pending evaluation run |
| Rules chosen on earlier trades beat random rules on later ones | Cohort result and kill rule on `/evidence` | Pending evaluation run. Withdrawn automatically if the kill rule fires |
| Holdout helps human traders | Not claimed | No human histories yet |
