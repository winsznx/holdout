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
