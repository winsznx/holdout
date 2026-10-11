# Decisions

Log of places where reality differed from the PRD.

## 2026-10-08 Inputs layout
- `internal/brand/SKILL.md`, `internal/references/` and `internal/samples/` do not exist. The brand skill is `internal/brand-design-SKILL (1).md`, the six reference images are `internal/Pasted *.png`, and the two money_boys CSVs sit directly in `internal/`.

## 2026-10-08 Time budget
- Build started 10:22 Lagos, not 01:15. About 6.5 hours to the 16:59 deadline. Bot runtime and round-trip counts will be lower than the PRD target and are reported as observed.

## 2026-10-10 Deploy target
- Deploy on Cloudflare Workers (holdout.timjosh507.workers.dev) instead of Vercel. `vercel.json` and `@vercel/og` are replaced by Workers equivalents.

## 2026-10-10 Harness deviations
- Bitget Demo allows one deposit per 72 hours. Equity is about 414 USDT, so lots are 20 USDT notional.
- Signal is EMA(3)/EMA(8) on 1m closes, not EMA(9)/EMA(21), to get more round trips in the time available. Hold 3 to 15 minutes as specified.
- Bot S trades NVDAUSDT only in the US weekend or overnight session, because the 09:30 ET open is not reachable inside the run window on a weekend. Its stated-rule break is a new stock-perp position in the weekend or overnight session.
- Package is `@bitget-ai/bitget-agent-sdk` 3.3.1, not `bitget-agent-sdk`. Spec copied to docs/vendor/.
- Demo has no rToken spot pairs, so the product-switch rule cannot be tested on Demo data.

## 2026-10-10 22:30 UTC Harness time compression
The first configuration (EMA cross entries, 3 to 15 minute holds, 30 minute cooldown) produced about one round trip per bot per 30 minutes, which cannot reach the 30 and 45 trade thresholds in the available hours. Changes, applied to all five bots together:
- Entry: when flat, enter in the direction of EMA(3) versus EMA(8) on the latest closed 1m bar, instead of waiting for a cross.
- Hold 1 to 3 minutes, instead of 3 to 15.
- Stated cooldown rule is 5 minutes after a loss, instead of 30. Bot R breaks it by re-entering within 2 minutes, bot C obeys it.
- Bot A adds when the position is down 0.1%, instead of 0.4%, because a 0.4% move rarely happens inside a 3 minute hold.
- Leverage rules unchanged (stated max 10x, bot V steps to a 25x cap).
Round trips before this change used the old parameters. Fills are real either way, and the evaluation reads fills only.
Bots run until 2026-10-11 07:00 UTC (08:00 Lagos).

## 2026-10-10 23:20 UTC Second time compression
At 7 to 8 round trips per hour per bot, the 45 trade minimum would only just be reached. Hold is now 1 to 2 minutes (was 1 to 3) and the stated cooldown is 3 minutes (was 5). The evaluation's stated rule is cooldown 3 minutes. Trades made under the 5 minute cooldown also satisfy the 3 minute rule, so no earlier trade changes status for bot C. Bot R still breaks it by re-entering within 2 minutes.

## 2026-10-11 Live key sync from the hosted app
PRD 6.3 has the browser sign a request and `/api/sync` forward it. Bitget blocks Cloudflare Workers (403 `{"cloudflare":"block"}`), so the forwarder cannot reach `api.bitget.com` from the deployed app. Public candles are now fetched from the browser directly, with the Worker proxy as fallback. Key sync works only where the forwarder runs outside Cloudflare (local `next dev` or `next start`). The hosted desk shows the named error and points to the CSV path. A relay on a non-Cloudflare host would fix it and has not been set up.

## 2026-10-11 Bot run results and what they change
Phase 1 ran from 2026-10-10 22:05 UTC to 2026-10-11 07:00 UTC on the nightbook VPS (R 171, A 96, V 93, S 94, C 97 closed round trips).
- Funding: Demo writes funding settlements as `CONTRACT_MAIN_SETTLE_FEE_USER_IN` financial records at about 00:00:01 UTC. The first export did not recognize the type and the ledgers for R, A and C were correctly flagged incomplete. The normalizer now matches it. The ledgers then reconcile to Bitget's positions history with a total delta under 4e-7 of absolute net P&L.
- Bot R label: when R drew "revenge" it set a pending re-entry but no cooldown, so the ordinary trend signal often re-entered first and was logged as `ema_trend`. Behavior is the same (a re-entry inside the stated cooldown after a loss). Ground truth for P1 is therefore computed from the log by the rule's own definition: an open less than 3 minutes after a losing close. That gives 115 orders, and the audit flagged the same 115 with none missed and none extra.
- Bots A and V never showed their habit in phase 1. A's 0.1% add trigger fired twice in 96 trades and both draws declined. V never won three in a row on a net-of-fees basis, so its leverage stayed at 5x. The audit correctly found zero breaks. This is a harness defect, not a detector result.
- Harness phase 2 (A and V only, 2026-10-11 11:00 to 12:45 UTC, logged with `phase: 2`): A adds when the position is down 0.03% (draw 40% as specified), V counts a win on gross P&L. All other behavior is unchanged. Phase 1 data stays in the histories. Bots R, S and C were not rerun.
- Holdout test: under the pre-registered grid no candidate qualified for any trader. The bots lose on nearly every trade and trade every few minutes, so every cooldown, daily-loss and leverage candidate removes 90% to 100% of train trades and fails the 2% to 50% filter. The strategy backtest has candidates in range but none with a positive train gain. No rule was frozen, so no sham was run on real data, and the cohort kill rule applies: the audit headline ships. The grid and the filter were not changed after seeing this. P2 (healthy control returns "no rule needed") therefore passes vacuously and the evidence page says so.
- CSV merge (P6): two defects found by the check. The CSV adapter wrote `weakId: false` where the API path omits the key, and numeric strings were not canonical across sources. Ingest now canonicalizes price, quantity, fee and execPnl, and the adapter only sets `weakId` when true. A property test covers API fills merged with their CSV rendering.
