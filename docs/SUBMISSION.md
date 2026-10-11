# Submission text

Generated from submission-facts.json (run run-2026-10-11T12-48-28-548Z). Numbers come from the evidence run only.

## 1. Thesis
Traders do not lack rules. Nothing checks them. Holdout turns a Bitget trader's own fills into a rulebook proven in dollars, with each rule tested on trades it never saw, and checks new trade ideas against it. GetAgent 2.0 and journal apps describe the past. None tests a fix out of sample.

## 2. Target user
Bitget retail to VIP3 traders in stock perps, rTokens and crypto futures, accounts of 1k to 50k USDT, 10 or more trades a week, medium-to-high risk appetite, mostly emerging markets. Targets, not measurements.

## 3. Validation (each labeled)
- Observed, Bitget Demo bots: bot-A 117, bot-C 97, bot-R 171, bot-S 94, bot-V 114 closed round trips. 5 Bitget Demo bots, 4 with a planted habit and one disciplined control. The habit occurred in 3 of the 4 (bot-V never showed it). Audit matched against the bots' own logs: bot-A 0 of 2 orders, bot-R 115 of 115 orders, bot-S 94 of 94 orders. False flags: 0. The control returned "NO_RULE_NEEDED", but no candidate rule qualified for any bot, so that is not a discriminating test.
- Observed, holdout test: The "discovered rules help" headline is withdrawn for the bot cohort under the pre-registered kill rule (0 bots had a tested rule, 0 adopt-worthy). The audit headline ships.
- Observed, planted-leak test (P4): recall 100%, cost error 0%.
- Observed, too little data (P3): pass. Duplicates (P6): pass. Gaps (P5): pass.
- Observed, sponsor ablation (P7): 11 rule probes became untestable, 3.0072 USDT of audited cost vanished.
- Rule compiler (P9): 37 of 37 correct (24 of 24 testable rules, 13 of 13 refusals), 0 independent authors, rules written by the builder and by Claude, labels committed before the run.
- Human histories: 0.

## 4. Progress
Built: engine, audit, holdout test with pre-registration and freeze gate, sham and baseline, desk (import, ledger, rules, proposals, sessions, check, chat, rulebook), evidence page and verifier, Skill and MCP server. Not built: Bybit and Binance adapters (no real export arrived), Chainbase AgentKey (S8). Stack and Bitget surfaces S1 to S7 are listed in docs/METHODOLOGY.md.

## 5. Deliverables
Live desk, sample, evidence page and bundle, repo, video, Skill and MCP.

## 6. Take
Agentic accounts cannot read main-account history, so review tools still need manual read-only keys. bitget-signal has no historical endpoint for trade-time tagging. Bitget v3 fill history carries no leverage. See docs/SPONSOR_FINDINGS.md.

## LLM role
The LLM compiles plain-language rules into a typed DSL and refuses what it cannot test, parses trade ideas, narrates engine results through a numbers firewall, and runs the desk chat through tool calls. It never computes a number and never sees raw fills. Models: {"provider":"api.openai.com","model":"gpt-5.5"}.
