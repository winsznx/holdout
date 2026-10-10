# Holdout · Final PRD (v1.0, build-ready)

Bitget AI Base Camp S2 · Track 3 AI Trading Desk · Sub-theme: Review & Self-Evolution
Builder: Tim (@winsznx) · Solo
Build window: Thu Oct 8 2026, 01:15 to 16:59 Lagos (deadline is Oct 8 23:59 UTC+8 = 16:59 WAT = 15:59 UTC)
Hard internal cutoff for form submission: 16:15 Lagos

This file is the source of truth. If a real API, SDK or data observation contradicts something here, the observation wins, and the correction gets written into `docs/DECISIONS.md` the same hour.

---

## 0. One-line product

Holdout turns a Bitget trader's own fills into a rulebook proven in dollars. Every rule is tested on trades it never saw, kept only if it beats a same-size random rule, and then every new trade idea is checked against it. The trader makes every decision. Holdout never places an order.

Judge-note sentence we are building toward:
"A Bitget trader can now see which of their own rules actually make them money, because Holdout replays their real fills on Bitget market data and tests each rule on trades it never saw."

Familiar-first framing for the landing page: "A trading journal that proves which rules make you money."

---

## 1. Non-negotiables (build contract)

1. No mocks. No fabricated fills, P&L, users, metrics, candles, earnings dates, transactions or LLM outputs. Every number on screen comes from a computed artifact with a denominator and provenance.
2. No feature from this PRD gets cut. Order of work can change. Scope can't.
3. The engine computes every number. The LLM never computes, never sees raw fills, and any digit in LLM-written text must come from an engine-filled slot (the numbers firewall, section 9.4).
4. Holdout never places orders. The only code that places orders is the test-subject harness in `harness/`, which runs on Bitget Demo only and is not part of the product.
5. No silent fallback. If a Bitget surface is unavailable, the UI says so by name and the affected rule is marked untestable. It never swaps in a generic source while keeping the Bitget claim.
6. Targets are labeled targets until measured. Observed numbers are labeled observed.
7. Failed runs, null results and rejected candidates are kept in `evidence/` and shown on the evidence page.
8. Private fills: CSV is parsed in the browser and never uploaded. API sync signs requests in the browser; the API secret never leaves the browser (section 6.3).

---

## 2. Competition facts that shape the build

- Track 3 is pure judge scoring. Focus areas: feature depth (data sources, Skill integration count and effectiveness), research quality, LUI fluency, personalized thesis. No published weights; treat them as equal.
- Must ship or the entry is invalid: accessible demo, one complete research task from question to actionable insight, compliant X post (quote https://x.com/Bitget_AI/status/2100519318824055159 with #BitgetHackathon and @Bitget_AI, introducing Holdout).
- Form description has six parts. Parts 1 to 3 (thesis, target user, validation data) weigh most. Validation for tools means test users, task completion, usage data, each labeled observed, estimated or target.
- Track data requirement: Track 3 does not require a backtest. It does require that the research task be real. Holdout's own validation is optional for validity but decisive for the research-quality score, so we run it and prove it statistically (section 8).
- Named S2 judge clusters on X: Alibaba Cloud x Qwen, Chainbase x Kaito, Arbitrum. Qwen is both judge and model sponsor, so the LLM layer is provider-agnostic and runs on Qwen when a key exists (section 9.1).
- University field: Federal University of Technology, Akure. Demo Day: Yes. K3 subsidy: Yes.

---

## 3. Users and actors

Primary user: Bitget retail to VIP3 trader in stock perps, rTokens and crypto futures. $1k to $50k account, 10+ trades a week, medium-to-high risk appetite, mostly emerging markets. They have rules in their head, break them, and nothing prices the breakage.

| Role | Who | Contributes | Gets back |
|---|---|---|---|
| Flow originator / beneficiary / payer | The trader | Fills (CSV or read-only key), stated rules | Cost of each broken rule, proven new rules, pre-trade check |
| Distribution owner | Bitget (Agent Hub skills, GetAgent memory) | Distribution to agent users | Retention: traders who blow up less keep trading |
| Agent user | Trader using Claude Code / Codex / OpenClaw with `bgc` | Calls Holdout Skill before an order preview | Rulebook check inside their existing agent |

First-unit value: one trader with 30+ closed round trips gets a full stated-vs-actual audit on first run. Proposals need 45+ (30 train minimum is too thin; see 8.2 thresholds).

---

## 4. Data sources and what each one does causally

Every source below is used in a code path that changes a number or a verdict. If one is missing at runtime, its dependents are marked untestable, never faked.

| # | Surface | Used for | Dependent features |
|---|---|---|---|
| S1 | Bitget fills (UTA v3 `getFillHistory` or v2 mix fill history; CSV export) | Core ledger: price, qty, side, tradeSide open/close, maker/taker, fee detail, execPnl, execId | Everything |
| S2 | Bitget positions history + financial records (funding, fees) | Independent readback to reconcile our ledger | Reconciliation gate, evidence |
| S3 | Bitget market candles: market, mark, index, premium; funding rate history | Stop replay, leverage/liquidation re-check, premium cost, funding cost | Rules 2, 4, 6, 8; session lens |
| S4 | Bitget rToken spot candles (`rTICKERUSDT`) | Product-switch counterfactual (rToken vs perp over off-hours) | Rule 8, session lens |
| S5 | bitget-mcp-server `https://agent.bitget.com/mcp` | US stock quotes, K-lines, earnings calendar, fundamentals | Rule 7 earnings blackout, Check-a-trade "earnings state now", underlying session price |
| S6 | bitget-signal (5 research skills) | Live market-state tags (sentiment, macro, funding, technical) for Check-a-trade | Check-a-trade card |
| S7 | US exchange session calendar (NYSE published 2026 hours and holidays, IANA America/New_York with DST) | Session tag per fill, as of trade time | Rule 6, session lens, similar-trade index |
| S8 | Chainbase AgentKey (sponsored partner data, not a Bitget product; Chainbase x Kaito are named judges) | Live news and social context for the symbol in a trade idea | Check-a-trade card "context" row, desk chat `get_context` tool |

Note on S6: bitget-signal gives current state, not history. It is used for the live Check-a-trade card only. Historical session and market-state tags come from S3 and S7, which are reproducible.

Agentic account OAuth is not used for review: an isolated agent sub-account can't see main-account history. This goes in form part 6 as a sponsor finding.

---

## 5. Day-0 checks (first 45 minutes, each has a fallback)

Record each result in `docs/DAY0.md` with the exact request, response shape and timestamp.

| Check | How | If it fails |
|---|---|---|
| D1 Bitget Demo API works for futures orders | Harness places and closes one demo order (`paptrading: 1` header on v2, or `bitget-agent-sdk` paperTrading mode). Confirm exact demo symbols and productType from the response | Fall back to whichever demo product type works; log it |
| D2 Stock perps (e.g. NVDA) tradable on Demo | Query demo contracts list | Harness runs crypto futures only; session lens uses Tim's real history (D5) and is labeled accordingly |
| D3 UTA v3 vs classic on Tim's real account | Read-only key, call fill history | Use v2 mix adapter; both adapters ship anyway |
| D4 rToken fills appear in fill history | Same key, filter spot `r*USDT` | CSV import covers rTokens |
| D5 Tim's own closed round trips in last 90 days | Count from D3 | Resolved: Tim has no trading history. The real account key is used only to prove the sync path works (empty result handled with a named empty state). Human data comes from 8.6 |
| D6 bitget-mcp-server tool list, especially earnings calendar range | MCP `tools/list`, then one call per tool we use | If historical earnings are unavailable, rule 7 runs only on dates the server returns, and coverage is shown |
| D7 bitget-signal endpoint and tools | Agent Hub docs, `tools/list` | Check-a-trade card shows "signal unavailable" by name |
| D8 Qwen key via `https://hackathon.bitgetops.com/v1` | One chat completion | OpenAI as primary |
| D9 Google Form allows editing after submit | Open the form, check for "edit after submit" note | If not, single submission at 16:00 |
| D10 CORS on Bitget public market endpoints from browser | One fetch | All public market calls go through `/api/market/*` proxy regardless |
| D11 Chainbase AgentKey callable from a server (API or MCP endpoint, not only an agent plugin) | Sign up at agentkey.app, find the server-usable endpoint, make one NVDA news call | If agent-only, wire it into the Holdout Skill path (Claude Code demo) instead of the web card, and say so on /skill |

| D12 Playbook / GetAgent Studio paper fills are readable by API or export (per-fill price, qty, side, fees, timestamps) | Install GetAgent Skill, publish one simple Playbook, enable Paper Trading in Studio, look for a fills API or export | If readable: add it as a sixth cohort member "Playbook paper bot" and list Playbook + GetAgent Skill as sponsor surfaces. If UI-only: skip, note in SPONSOR_FINDINGS.md. Demo API bots stay primary either way |

Qwen note: Qwen credits require Bitget KYC (reviewed every 24 hours) and a manual claim on Telegram, so they will not arrive inside this window. OpenAI is the primary provider. The Qwen path stays configurable.

Exact endpoint paths come from the `bitget-agent-sdk` 3.3.1 OpenAPI spec and Bitget docs. The agent must read them, not guess.

---

## 6. System architecture

### 6.1 Repo layout (pnpm workspace)

```
holdout/
  apps/web/                 Next.js (App Router), Tailwind, deployed on Vercel
  packages/engine/          Pure TypeScript. Ledger, sessions, rules, replay, holdout, stats. No I/O.
  packages/bitget/          Typed clients: public market (S3, S4), private read-only (S1, S2), signing, MCP clients (S5, S6)
  packages/llm/             Provider-agnostic client, rule compiler, idea parser, narrator, chat tools, numbers firewall
  packages/skill/           Holdout Agent Skill (SKILL.md) + Holdout MCP server (stdio and HTTP)
  harness/                  Demo-only test-subject bots (not product). Places orders on Bitget Demo.
  evidence/                 raw/, freeze/, runs/, bundle/ (committed)
  scripts/                  eval.ts, verify.ts, ablation.ts, compiler-eval.ts
  docs/                     THESIS, MATH, METHODOLOGY, DECISIONS, DAY0, CLAIM_LEDGER, SPONSOR_FINDINGS, SUBMISSION, RUBRIC_ARTIFACT_MAP
  internal/                 PRD, brand skill, reference images (read-only inputs for the build agent)
```

### 6.2 Data flow

```
Trader's device (private)                         Bitget (public)
  CSV export ──┐                                    candles: market/mark/index/premium
  read-only    │  signed in browser                 funding history, rToken candles
  key ─────────┼─> /api/sync (forwards signed       bitget-mcp-server, bitget-signal
               │    request, stores nothing)            │
               v                                        v
        packages/engine (runs in browser)  <──  /api/market/* proxy (public data only, cached)
          1 dedupe on execId
          2 FIFO round trips with fees + funding
          3 reconcile vs positions history (S2)
          4 session + product tags as of trade time
          5 audit stated rules, replay on candles
          6 holdout selection, freeze, test vs sham + baseline
               │                      ^
               v                      │ rule text / aggregates only
          Rulebook (versioned)    packages/llm  (compile, parse, narrate, chat)
               │
     ┌─────────┼──────────────┬───────────────────┐
     v         v              v                   v
  Desk UI   Rulebook export  Holdout Skill+MCP   Evidence bundle
            (JSON, signed    (check_trade,       (pnpm verify)
             hash)            get_rulebook)
```

### 6.3 Privacy and key handling

- CSV: parsed with PapaParse in a Web Worker. Never sent anywhere.
- API sync: the trader pastes a read-only key, secret and passphrase. The browser computes the HMAC-SHA256 signature with WebCrypto. The browser sends `/api/sync` only the method, path, query, timestamp, ACCESS-KEY, ACCESS-SIGN and ACCESS-PASSPHRASE headers. The secret never leaves the browser. `/api/sync` forwards the exact signed request to Bitget, streams the response back, logs nothing, and stores nothing. The UI states this plainly, including that key and passphrase transit our edge function in memory.
- The UI checks the key is read-only by attempting nothing write-shaped; it reads the key's permission info if the API exposes it and refuses keys with trade or withdraw permission.
- Engine state lives in IndexedDB in the trader's browser (wrapped in try/catch). "Delete my data" clears it.
- Supabase stores only: saved rulebooks (opt-in, rule DSL + aggregate stats, no fills) and opt-in per-rule aggregates for the cohort. Row-level security on an anonymous device id.

### 6.4 Stack

Next.js App Router with pnpm, TypeScript strict, Tailwind, Vitest + fast-check, Zod, Recharts or visx for charts, `vercel.json`, `@vercel/og` for share images, `app/icon.tsx`. Supabase (fresh project). LLM via OpenAI SDK pointed at a configurable base URL. MCP via `@modelcontextprotocol/sdk`.

---

## 7. Engine specification (packages/engine)

All functions pure and deterministic. Money in USDT as decimal strings internally (use `decimal.js`), converted to number only for display.

### 7.1 Ingest and dedupe
- Normalize API and CSV rows into `Fill { execId, orderId, symbol, product: 'perp'|'stock_perp'|'rtoken'|'stock_plus'|'spot', side, tradeSide: 'open'|'close', qty, price, fee, feeCoin, execPnl?, maker: bool, ts, leverage?, marginMode? }`.
- Product classification from symbol and productType (stock perps by Bitget's stock-futures symbol list from the contracts endpoint, rTokens by `r*USDT` spot pairs).
- Dedupe key: `execId`. When a CSV lacks execId, key = hash(orderId, ts, price, qty, side) and the row is flagged `weak_id`.
- Primary source for Tim's history is the read-only API (fills, positions history, financial records over the last 90 days; tax records for up to 366 days). No CSV is needed for P1.
- CSV parser: if a real Bitget export exists in `internal/samples/`, build and test against it. If none exists, build to Bitget's documented export columns, label the CSV path "untested against a live export" in the UI and README, and never create a sample CSV by hand.

### 7.2 Round trips
- FIFO per (symbol, positionSide). Partial closes split lots. Overlapping positions supported.
- RoundTrip { id, symbol, product, side, entries[], exits[], openTs, closeTs, qty, avgEntry, avgExit, grossPnl, fees, funding, netPnl, maxLeverage, addedWhileLosing: bool, liquidated: bool, execIds[] }.
- Funding attached from financial records (S2) by symbol and time window. Missing funding window marks the ledger `incomplete` (P5).

### 7.3 Reconciliation
- Compare Σ netPnl per symbol with Bitget positions history netProfit (API path) or the CSV's realized P&L column (CSV path).
- Pass if total delta ≤ 1% of Σ|netPnl| and every symbol ≤ 2%. Show the delta on screen. Fail stops proposals for that trader and says why.

### 7.4 Session and product tags (as of trade time)
- US session per timestamp: pre-market 04:00–09:30 ET, regular 09:30–16:00, after-hours 16:00–20:00, overnight 20:00–04:00, weekend, NYSE holiday, early close. Calendar data from NYSE's published 2026 schedule, committed as `engine/data/nyse-2026.json` with source URL.
- Tags: `session`, `holdsAcrossOpen` (position open across 09:30 ET), `holdsAcrossWeekend`, `intoFridayClose` (opened within 60 min before Fri 16:00 ET), `earningsWindowHours` (hours to next earnings for the underlying, from S5).
- No look-ahead: tag functions accept only (timestamp, calendar, earnings dates known as of that timestamp).

### 7.5 Rule DSL (the pre-registered eight templates)

```ts
type Rule =
 | { t:'cooldown_after_loss', minutes:number }
 | { t:'max_leverage', x:number }
 | { t:'no_add_to_loser' }
 | { t:'hard_stop', pct:number }
 | { t:'daily_loss_limit', usdt:number }
 | { t:'session_filter', block: ('overnight'|'weekend'|'holiday'|'friday_close'|'pre_market'|'after_hours')[], products: ('stock_perp'|'rtoken')[] }
 | { t:'earnings_blackout', hoursBefore:number }
 | { t:'product_switch_weekend', from:'stock_perp', to:'rtoken' }
```

Each rule has `scope?: { symbols?, products?, sides? }`.

### 7.6 Counterfactual semantics (documented in docs/METHODOLOGY.md)
- Removal rules (cooldown, session filter, earnings blackout, daily loss limit, no-add-to-loser): violating trades are removed. For no-add, only the added lots are removed. Counterfactual P&L = actual minus removed net P&L. Assumption stated on screen: removing a trade does not change later trades (path independence).
- Hard stop: replay mark candles (1m if within 90-day window, else 5m) from entry. If adverse move reaches X% before actual exit, exit at the worst price inside that bar (bar low for longs, bar high for shorts), plus taker fee. Otherwise actual result.
- Max leverage: scale position size by cap/actual, P&L and fees scale linearly. If the actual trade was liquidated, recompute the liquidation price at capped leverage on mark candles. If not hit, exit at the mark price at the actual liquidation timestamp.
- Product switch: for stock-perp exposure held across weekend or overnight, replace that segment with equal-notional rToken spot at 1x: entry and exit at rToken candle close plus spread proxy (rToken high-low within the bar / 2), no funding. Actual perp funding and any gap liquidation are removed.
- Null rule identity: applying no rule returns exactly the actual ledger (tested, Lemma 3).

### 7.7 Stated-vs-actual audit
For each stated rule: times broken, broken trade list (execIds), cost = actual − counterfactual net P&L, 90% bootstrap interval (10,000 resamples of the broken-trade set, seed published). Under 5 breaks shows "not enough breaks to price".

### 7.8 Similar-trade index
Buckets by (symbol, product, side, session, leverage bucket [1–3, 3–5, 5–10, 10–20, 20+], holdsAcrossOpen). Each bucket: n, win rate, median net P&L, total net P&L. Exported in the rulebook as aggregates only.

---

## 8. Holdout test, statistics and mathematical proofs

### 8.1 Pre-registration (committed before any test data is read)
`evidence/PREREG.md` lists: templates, parameter grid, split rule, selection criterion, primary metric, sham design, baseline, thresholds, seed rule, kill rule. Committed first. Its hash goes on the evidence page.

Parameter grid (~26 candidates):
- cooldown minutes {15, 30, 45, 60, 120}
- max leverage {3, 5, 10, 20}
- hard stop % {1, 2, 3, 5}
- daily loss limit {2, 3, 5} × median |trade net P&L| on train
- session filter {overnight}, {weekend}, {friday_close}, {overnight, weekend, holiday}, each on stock_perp+rtoken
- earnings blackout hours {12, 24, 48}
- no_add_to_loser, product_switch_weekend

### 8.2 Procedure per trader
1. Sort closed round trips by closeTs. Split point = closeTs of trade at index ⌈2n/3⌉. Train = before, test = after.
2. Thresholds: n < 30 → audit only, "not enough trades". Train < 30 or test < 15 → audit only for proposals.
3. Selection sees train only (enforced by type: `selectRule(train: RoundTrip[])` has no access to test). Choose the candidate maximizing Δ_train subject to: affects ≥ 5 train trades and removal/modification rate between 2% and 50%. Keep top 3 for display; only top 1 is tested.
4. Freeze: write `evidence/freeze/<traderId>.json` {selected rule, train stats, code commit, timestamp, sha256}. `scripts/eval.ts` refuses to run step 5 unless the freeze file is committed to git (checks `git log -- <file>`).
5. Test: Δ_test(rule) = counterfactual net P&L − actual net P&L on test, after fees and funding.
6. Sham: 1,000 draws. For removal rules, remove k random test trades where k equals the number the rule removed on test. For modifying rules, apply the same modification to k random test trades. Seed = first 8 bytes of the freeze sha256. p = (1 + #{Δ_sham ≥ Δ_test}) / 1001.
7. Baseline (GetAgent-style): on train, find the worst bucket by total net P&L among (symbol, side) and (product, session). On test, remove that bucket. Report Δ_baseline.
8. Verdict per trader: ADOPT-WORTHY if Δ_test > 0 and p ≤ 0.10. NO RULE NEEDED if no candidate passes step 3 or p > 0.10. INSUFFICIENT if thresholds fail.

Cohort kill rule: if median Δ_test ≤ median of per-trader sham medians, or median Δ_test ≤ 0, the "discovered rules help" headline is withdrawn in writing and the audit headline ships. This is published either way.

### 8.3 docs/MATH.md: lemmas, each with a property-based test (fast-check, 1,000 runs)
- L1 Ledger conservation: Σ_roundtrips netPnl = Σ_fills execPnl − Σ fees + Σ funding, for any valid fill sequence including partial closes.
- L2 Idempotent ingest: ingest(A ∪ A) = ingest(A); ingest(A ∪ B) is order-independent.
- L3 Null rule identity: counterfactual(ledger, ∅) = ledger exactly.
- L4 Removal decomposition: for removal rules under path independence, Δ = −Σ_{t∈R} netPnl(t).
- L5 Sham p-value validity: under H0 that test trades are exchangeable with respect to the rule, P(p ≤ α) ≤ α. Proof sketch: the observed statistic is one draw from the same randomization distribution; the +1 correction makes the test exact (standard Monte Carlo permutation argument, Phipson and Smyth 2010). Empirical check: run the pipeline with a rule chosen at random (not by selection) on 200 seeds and show the p-value histogram is approximately uniform.
- L6 No look-ahead: session and earnings tags are invariant to appending or deleting any data after the trade timestamp.
- L7 Bootstrap interval coverage: on known-distribution draws, the 90% interval covers the true sum in ≈90% of 1,000 trials (reported number, not asserted).
- L8 Selection blindness: mutating any test-period trade leaves the frozen selection output byte-identical.

### 8.4 Evaluation campaign (P1–P9)

| Case | Data | Pass rule |
|---|---|---|
| P1 Positive | Each leaky bot (known leak), plus any human Demo or real history from 8.6 | Audit prices the planted broken rule with interval; every count traceable to execIds |
| P1b Specificity matrix | All five bots | 5x5 matrix of bot vs proposed rule: each leaky bot's top proposal targets its own planted leak, and no bot gets a proposal targeting a leak it doesn't have. Report precision and recall |
| P2 Healthy control | Harness bot C (disciplined) on Bitget Demo | No candidate beats sham at p ≤ 0.10; output "no rule needed" |
| P3 Too little data | Any real history trimmed to < 30 trades | "Not enough trades" for proposals; audit still runs |
| P4 Planted leak | Labeled copy of a real history with injected post-loss re-entries (ground truth known, file named `planted-*`, never shown as real) | Recall ≥ 90% of injected trades; cost within 5% of the injected net P&L |
| P5 Gaps | Real history with a funding window removed | Ledger flagged incomplete; proposals blocked |
| P6 Duplicates | Same trader via API and CSV | Ledger byte-identical after merge (L2) |
| P7 Sponsor ablation | All traders | Rerun with S3 premium/index, S4, S5, S7 disabled. Report: number of rules that become untestable and dollars of audited cost that vanish |
| P8 More traders | Every consenting trader + bots L and C | Same frozen pipeline; every result published, failures included |
| P9 Rule compiler | 50 plain-language rules written by people other than Tim (ask 3 to 5 friends on X/WhatsApp in hour 1; if fewer arrive, use what arrives and report n) | Correct DSL or explicit refusal; blind-scored by a script against hand labels made before running the compiler |

### 8.5 The test-subject harness (harness/, Bitget Demo only)
Purpose: produce real Bitget fills with known behavior, since 5 human histories are not reachable in 15 hours. These are labeled "Bitget Demo bot" everywhere. They test the pipeline's detection power and false-positive control. They are not evidence about human traders.

- Base signal: 1-minute EMA(9)/EMA(21) cross on demo futures (BTC and ETH, plus NVDA stock perp if D2 passes), hold 3 to 15 minutes, market orders, 5x default leverage, small fixed notional.
Five bots, one planted leak each, all sharing the same base signal and the same stated rules file (`cooldown 30 min after a loss`, `never add to a loser`, `max 10x`, `no new stock-perp risk overnight`):
- Bot R (revenge): after a losing close, 50% chance to re-enter within 2 minutes at 2x size. Breaks the cooldown rule.
- Bot A (adds to losers): if a position is down 0.4%, 40% chance to add once. Breaks no-add.
- Bot V (leverage creep): after 3 wins in a row, leverage steps up 5x per win to a 25x cap; resets after a loss. Breaks max leverage.
- Bot S (session): if D2 passes, opens NVDA stock-perp positions in the US overnight session and holds across the 09:30 ET open (14:30 Lagos). If D2 fails, replaced by Bot D (daily loss limit breaker: keeps trading after a -X daily loss) on crypto futures, and the session lens is labeled "no stock-perp data on Demo".
- Bot C (control): follows every stated rule exactly.
- One Demo sub-account per bot if Demo allows it; otherwise distinct symbols per bot so fills separate cleanly. Record which in DAY0.md.
- All start in the first hour and run until 13:30 Lagos. Target 150+ round trips each. Each bot logs every decision with reason codes to `evidence/raw/harness/` so ground truth is checkable. Evidence uses fills pulled back from the Bitget Demo API, not the bot's own logs.

### 8.6 Human data (parallel, best effort, never faked)
- Builder's own Demo history: Tim trades manually on Bitget Demo from about 03:00 to 12:00 Lagos in gaps while the build runs, targeting 50+ closed round trips. Rules written first and committed as `evidence/raw/tim-demo/RULES.md` before the first trade. No deliberate rule-breaking (bots cover planted leaks). Labeled "human, Bitget Demo (builder's own account)" everywhere. Fills pulled via a read-only Demo key. Becomes the default `/sample` history if it reaches 30+ closed trades, with Bot R one click away.
- Human Demo traders: 3 to 5 friends trade on Bitget Demo for a few hours today, write 2 to 3 rules first in a shared form, then send a read-only Demo key. Labeled "human, Bitget Demo".
- Real Bitget traders: CSV or read-only key requests posted on X and Bitget Telegram from hour 1. Labeled "human, live account".
- Expected: short histories, so the audit runs and proposals return "not enough trades". Show exactly that.
- Headline rule: with no human histories, the public headline is detection-power only: "On five Bitget Demo bots with one planted habit each, Holdout found each habit and priced it within X%, and found nothing on the disciplined control." Never claim Holdout improved real traders unless 8.2 passes on human data.
- `/sample` loads Bot R by default (clearly labeled bot), with a switcher for every other available history.
- Keys: separate Demo API key in `harness/.env`, never imported by apps/web.

### 8.6b Jason's strategy files (start-now data, labeled honestly)
- `internal/samples/money_boys_89d_trades.csv` (150 trades from a friend's strategy backtest, Jul 8 to Oct 2, daily dates only) and `money_boys_paper_trades.csv` (42 decisions from the same friend's agent, 29 filled, 21 days) are used from hour one as development fixtures and as a labeled sample on `/sample`.
- Label everywhere: "Strategy sample: a friend's trading agent (backtest and paper ledger), not live fills." Never call it a human or live account.
- Build a `money-boys` CSV adapter for these exact columns. Map tradeId as the trade key, entryDate/exitDate as day-level timestamps, pnlUsd and feesUsd as given. Reconciliation runs against the file's own pnlUsd.
- What it can and can't exercise: daily loss limit, cooldown measured in days, and the holdout vs sham test all run. Leverage, adds, intraday session and hard-stop rules show "not in this data". The paper ledger has no losing fills, so the audit says that plainly instead of inventing a leak.
- Do not show the two files' prices side by side: the paper ledger's rToken fills don't match the backtest's prices for the same month. Treat them as separate samples.
- Never generate synthetic trades to fill gaps. Bot and Demo fills from 8.5 and 8.6 replace this sample as the default the moment they reach 30 closed trades.

### 8.7 Real human histories from Bybit and Binance (method evidence, not Bitget evidence)
Local traders use Bybit and Binance. Their real, months-long histories are the best available test of the core claim (a rule chosen on a trader's earlier trades beats a same-size random rule on their later trades). Bitget stays the product's home; these histories prove the method.
- Intake: each trader's own CSV export (Bybit closed P&L / trade history; Binance futures trade history), or a read-only key. Build an adapter only against a real export file that arrives. Never hand-write one.
- Rules that run: removal rules only (cooldown, no-add-to-loser, daily loss limit, max leverage as a removal filter on trades above the cap). Hard stop, session filter, earnings blackout and product switch are marked "Bitget-only" and not run, because they need Bitget candles or Bitget products.
- No reconciliation to Bitget. Reconcile instead against the exchange's own realized P&L column in the export, same 1% gate.
- Same frozen pipeline, same PREREG, same sham and baseline as 8.2. Results reported in their own cohort table, never merged into Bitget numbers.
- Label everywhere: "human, Binance live account" / "human, Bybit live account". Consent screenshot required per trader; account ids hashed.
- Headline rule update: if 8.2 passes on this cohort, the public line may say "On N real traders' histories from other exchanges, rules chosen on earlier trades beat random rules on later trades by a median $X", with the venue named. Bitget-specific claims still come only from Bitget data.
- Product framing: `/desk/import` offers "Bring your history from Bybit or Binance" as a secondary path, so traders moving to Bitget arrive with a tested rulebook.

---

## 9. AI layer (packages/llm)

### 9.1 Provider
OpenAI-compatible client with `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`. Default: OpenAI with Tim's key and the strongest model available on that key that supports structured outputs and tool calling. If D8 passes, Qwen (`qwen3.8-max` via `https://hackathon.bitgetops.com/v1`) is used for the compiler and chat, and the form says so. Both paths tested.

### 9.2 Jobs
1. Rule compiler: plain text → `Rule` JSON via structured outputs against the Zod schema, or `{ refuse: true, reason }` for untestable rules ("only trade when confident"). Then Zod validation. Then a deterministic round-trip check: the engine renders the rule back to canonical English, and the UI shows both so the trader confirms.
2. Trade-idea parser: "long NVDA 20x now" → `{ symbol, side, leverage, product, time }`. Ambiguity returns a clarifying question, not a guess.
3. Narrator: writes card text from engine output using slot tokens only (`{cost}`, `{breaks}`, `{interval_lo}`...).
4. Desk chat (the LUI): tool-calling assistant with tools `get_audit`, `get_proposals`, `explain_rule`, `check_trade`, `compare_sessions`, `get_evidence`. Every answer renders engine cards, not prose numbers. It states the boundary when asked to trade: "Holdout doesn't place orders. Here's what your rulebook says."

### 9.3 What the LLM sees
Rule text, the DSL schema, aggregates and tool results. Never raw fills, never keys.

### 9.4 Numbers firewall
After narration, a validator extracts every digit run from LLM text. Any digit not produced by slot substitution fails the message and falls back to a deterministic template. Failures are counted and shown on the evidence page.

---

## 10. Product surfaces

Design source: `internal/brand/SKILL.md` and images in `internal/references/`. The build agent derives tokens, type, color and components from those, and generates the logo, favicon, OG images and illustrations through the brand skill. No generic SaaS template, no glassmorphism, no fake terminal panels.

### 10.1 Routes

| Route | Purpose |
|---|---|
| `/` | Landing (10.2) |
| `/desk` | Desk home: import state, latest audit summary, next action |
| `/desk/import` | CSV drop (Web Worker parse) or read-only sync; product detection; dedupe report |
| `/desk/ledger` | Round trips table, reconciliation to Bitget with delta, incomplete-data flags |
| `/desk/rules` | "Your rules on trial": plain-language intake, compiled DSL shown back, rule cards with breaks, cost, interval, broken-trade drilldown to execIds |
| `/desk/proposals` | Holdout proposals: train/test timeline bar, Δ_test vs sham histogram, baseline comparison, p-value, Adopt / Reject |
| `/desk/sessions` | Session lens: P&L by session, holds across open/weekend, stock perp vs rToken comparison, funding and premium costs |
| `/desk/check` | Check a trade: one card with rules it breaks, record on similar trades, session state now, earnings state, signal tags; trader decides |
| `/desk/chat` | Full-screen desk chat (also a drawer on every /desk route) |
| `/desk/rulebook` | Versions, diff between versions, export JSON (with sha256), install Skill instructions with the rulebook path |
| `/sample` | Loads a consenting trader's anonymized history in one click (judge path) |
| `/evidence` | Proof surface: cohort result, per-trader verdicts, freeze hashes, sham distributions, P1–P9 table, ablation, firewall stats, null results |
| `/evidence/[traderId]` | Full run detail for one trader |
| `/methodology` | Counterfactual semantics, assumptions, MATH lemmas |
| `/skill` | Holdout Skill + MCP install for Claude Code, Codex, OpenClaw, Cursor |
| `/privacy` | Exactly what moves where |

API routes: `/api/market/[...path]` (public Bitget proxy, cached, allowlisted paths), `/api/sync` (signed forward), `/api/mcp/bitget` (server-side MCP client to S5 and S6), `/api/llm/compile`, `/api/llm/parse-idea`, `/api/llm/narrate`, `/api/llm/chat`, `/api/mcp` (Holdout's own MCP over HTTP), `/api/rulebooks` (Supabase, opt-in).

### 10.2 Landing narrative
Header: wordmark, Desk, Evidence, Skill, GitHub, "Try the sample".
1. Hero: "A trading journal that proves which rules make you money." Sub: your Bitget fills, your rules, tested on trades they never saw. CTAs: Try the sample / Bring your history. Visual: the real rule card from the sample trader.
2. Problem: traders repeat expensive habits and nothing proves which rule fixes them (cite Barber et al. 2014 and Bitget's July 2026 rToken usage figures with sources).
3. Workflow: import → say your rules → see what breaking them cost → proposals tested on unseen weeks → check the next trade.
4. What it does: audit, proposals, session lens, check-a-trade, Skill for your agent.
5. Evidence: live cohort result from `/evidence` with the null-rule control and the sham comparison, linked.
6. Next step: Try the sample / Install the Skill.
Footer: GitHub, methodology, privacy, X, "Holdout never places orders".

### 10.3 States
Every route has empty, loading, error (named Bitget surface), success and partial states. Mobile works at 375px for landing, sample, check and evidence.

---

## 11. Holdout Skill + MCP (packages/skill)

- MCP server (stdio for local agents, HTTP at `/api/mcp`) with tools:
  - `get_rulebook()` → the trader's exported rulebook (path from `HOLDOUT_RULEBOOK` env).
  - `check_trade({ symbol, side, leverage, product?, time? })` → rules broken, similar-trade bucket stats, session state now, earnings state (S5), signal tags (S6). Read-only.
  - `explain_rule({ ruleId })` → evidence for one rule.
- `SKILL.md` instructs the agent: before any `bgc` order preview, call `check_trade`, show the card, and wait for the human. Never place an order on the human's behalf because of Holdout output.
- Demo shows Claude Code with `bgc` in `--read-only` / `dryRun` mode consulting the Skill before an order preview.
- Published as `@winszn/holdout-skill` if npm publish works; otherwise installable from the repo path. Either way, documented on `/skill`.

---

## 12. Evidence bundle and verification

- `evidence/raw/`: consenting fills (anonymized: account id hashed, timestamps exact, symbols exact), harness fills pulled back from Bitget Demo via API (not the bot's own logs), market data snapshots used.
- `evidence/runs/<runId>/`: manifest (commit, Node and pnpm versions, data hashes, LLM provider and model per job, seeds), outputs, sham draws.
- `pnpm verify` recomputes every number on `/evidence` from `evidence/raw` with no network and no keys, compares to published outputs, and prints PASS/FAIL per number. Includes a tamper test: flips one byte of one fill and shows FAIL.
- `evidence/bundle.zip` downloadable from `/evidence`.
- `submission-facts.json` holds URLs, headline numbers with denominators, run ids and limitations. README opening, `/evidence` hero and form text are generated from or checked against it.

---

## 13. Build order (Lagos time)

| Time | Work | Exit gate |
|---|---|---|
| 01:15–02:00 | Repo scaffold, Day-0 checks D1–D10, X post live, harness bots L and C running on Demo, P9 rule requests sent to friends | Bots placing demo trades; DAY0.md written |
| 02:00–04:30 | Engine: ingest, dedupe, round trips, funding, reconciliation, sessions, CSV parser on real export; L1, L2, L3, L6 tests | Tim's own ledger reconciles within 1% or the reason is logged |
| 04:30–06:30 | Rules, replay on candles, audit with bootstrap, holdout selection, freeze, sham, baseline; L4, L5, L7, L8 tests; PREREG.md committed before first eval | Engine test suite green |
| 06:30–08:00 | packages/llm: compiler, parser, narrator, firewall, chat tools; packages/bitget MCP clients for S5, S6 | Compiler round-trips the 8 templates; firewall rejects an injected digit |
| 08:00–11:30 | apps/web: brand tokens from internal/, landing, all /desk routes, /sample, /evidence, /methodology, /skill, /privacy | Clean-browser judge path works end to end on Tim's data |
| 11:30–12:30 | packages/skill: MCP server, SKILL.md, Claude Code demo | `check_trade` answers from a real exported rulebook |
| 12:30–13:30 | Supabase opt-in tables, deploy to Vercel, OG images | Live URL works on mobile |
| 13:30 | Stop bots. Pull their fills from Bitget Demo API | Raw fills committed |
| 13:30–14:30 | Evaluation: P1–P9, ablation, freeze commit, test, verify, evidence page live | `pnpm verify` PASS |
| 14:30–15:30 | README from submission-facts.json, record video, upload | Video public |
| 15:30–16:15 | Fill and submit form; check every link from a logged-out browser | Submitted |

---

## 14. Video (about 2 minutes)

1. 0:00 "Most traders lose, and the losers keep losing. Not for lack of rules. Nothing checks them."
2. 0:10 Drop a real Bitget CSV; ledger reconciles to Bitget with the delta on screen.
3. 0:25 Type three rules in plain words; compiled rules shown back; cost cards appear.
4. 0:50 A proposal trained on the earlier window, tested on the later one, next to its sham distribution and the GetAgent-style baseline.
5. 1:10 Healthy control: the disciplined bot gets "no rule needed".
6. 1:20 Session lens: stock perp vs rToken across the open.
7. 1:30 Check a trade: "long NVDA 20x now" → one card. The trader decides.
8. 1:45 Claude Code with the Holdout Skill checks the rulebook before a `bgc` order preview.
9. 1:55 `pnpm verify` PASS and the evidence link.

Narration says "Bitget Demo bot" whenever bot data is on screen.

---

## 15. Form text (filled from submission-facts.json, numbers only from evidence)

1. Thesis: Traders don't lack rules. Nothing checks them. Holdout turns a Bitget trader's own fills into a rulebook proven in dollars, with each rule tested on trades it never saw, and checks new trade ideas against it. GetAgent 2.0 and journal apps describe the past. None tests a fix out of sample.
2. Target user: Bitget retail to VIP3 traders in stock perps, rTokens and crypto futures, $1k–$50k accounts, 10+ trades a week, medium-to-high risk appetite, mostly emerging markets. Bitget reports rToken users averaging about 72 trades in five weeks, with about a third off-hours.
3. Validation (each labeled): N consenting human histories (observed), 2 Bitget Demo bots (observed, labeled as bots), reconciliation delta (observed), holdout result vs sham and baseline (observed, including nulls), healthy-control result, planted-leak recall, compiler accuracy on n volunteer rules, ablation result. Targets for month one labeled as targets.
4. Progress: built, not built, fixes. Stack and Bitget surfaces S1–S7.
5. Deliverables: live desk, sample, evidence page and bundle, repo, video, Skill + MCP.
6. Take: agentic accounts can't read main-account history, so review tools still need manual read-only keys; bitget-signal has no historical endpoint for trade-time tagging; any other findings from SPONSOR_FINDINGS.md.

LLM-role field: the LLM compiles plain-language rules into a typed DSL and refuses what it can't test, parses trade ideas, narrates engine results through a numbers firewall, and runs the desk chat through tool calls. It never computes a number and never sees raw fills. Models: [filled from manifest].

---

## 16. Risks and responses

| Risk | Response |
|---|---|
| Fewer than 5 human histories | Ship with whatever consenting humans exist plus the two labeled demo bots. Headline follows the kill rule in 8.2; audit headline if needed |
| Stock perps not on Demo | Bots on crypto futures; session lens uses real human history; stated in form part 3 |
| Holdout null on the cohort | Publish the null, ship the audit headline. Bitget featured Nocturne's honest negative |
| Candle limits (100 bars per call, 90 days) | Fetch only traded windows, cache by symbol and window in `/api/market` and IndexedDB |
| Reconciliation over 1% | Stop and fix the ledger before any feature work |
| LLM unavailable | Deterministic templates keep every screen working; chat shows provider error by name |
| Form not editable | Single submit at 16:00 after the logged-out link check |

---

## 17. Acceptance checklist (all must be true before submitting)

- [ ] X post live, quoting the Agent Hub post, with @Bitget_AI and #BitgetHackathon
- [ ] Live URL, logged-out: landing explains the product before any proof
- [ ] `/sample` → audit → proposal → check-a-trade works in under 5 minutes with no account
- [ ] Every number on `/evidence` passes `pnpm verify`
- [ ] Healthy control, planted leak, ablation, compiler eval and nulls are on `/evidence`
- [ ] Every bot datum labeled "Bitget Demo bot"
- [ ] Skill + MCP installs from `/skill` instructions
- [ ] README opening, form, video and `/evidence` agree with `submission-facts.json`
- [ ] Repo public, MIT license
- [ ] Video public, about 2 minutes
- [ ] Form: Track 3 → Review & Self-Evolution; description six parts; LLM role; university; Demo Day Yes; K3 Yes
- [ ] Team Members: "Individual"; same Bitget UID as any other entry
- [ ] S1 participant: Yes. Substantive New Additions: "Holdout is a new project, not a continuation of my S1 entry Cinch (capital containment for autonomous agents). Holdout reviews a human trader's own fills, tests rules out of sample, and never trades."
- [ ] X: quote post introducing Holdout with #BitgetHackathon and @Bitget_AI, plus a plain repost of https://x.com/Bitget_AI/status/2100519318824055159
