# Methodology

Holdout never places orders. This page states exactly how every number is computed.

## Ledger
- Fills are deduped on `execId`. A CSV row without an exec id gets a hash of (orderId, timestamp, price, quantity, side) and is flagged `weak_id`.
- A round trip is one position episode for a (symbol, position side) pair: it starts at the first opening fill from flat and ends when the open quantity returns to zero. Adds and partial closes stay inside the same round trip. Fills are processed in (timestamp, execId) order.
- Gross P&L is the sum of the exchange's `execPnl` on the closing fills. When a source has no `execPnl`, gross is computed from prices against the running average entry.
- Net P&L = gross minus fees plus funding. Funding records are assigned to the round trips of the same symbol that were open at the funding timestamp. When several are open (long and short on one symbol), the record is split by entry notional and the last share takes the remainder so totals stay exact.
- A round trip that crosses a funding settlement with no funding record marks the ledger `incomplete`, and proposals are blocked for that trader.
- Money is decimal strings internally (decimal.js, 40 digits). Numbers are used only for display and for resampling.

## Reconciliation
Our total net P&L is compared with the exchange's own positions history `netProfit` (API path) or the file's own realized P&L column (CSV path). The ledger passes when the total delta is at most 1% of the sum of absolute net P&L and every symbol is at most 2%. A failing ledger stops proposals and says why.

## Session tags
Computed from the timestamp and the NYSE 2026 calendar only, in America/New_York with DST. Sessions: pre-market 04:00 to 09:30, regular 09:30 to 16:00, after-hours 16:00 to 20:00, overnight 20:00 to 04:00, weekend from Friday 20:00 to Sunday 20:00, holiday, early close. `holdsAcrossOpen`, `holdsAcrossWeekend`, `intoFridayClose` (opened in the 60 minutes before the Friday close) and `earningsWindowHours` are derived the same way. Earnings dates count only if they were known at the trade timestamp. Data with day-level timestamps (the money_boys files) marks session, hard stop, earnings and product-switch rules as "not in this data".

## Counterfactual semantics
Sign convention: delta = counterfactual net P&L minus actual net P&L. A positive delta means following the rule would have made more money. The audit calls this the cost of breaking the rule.
- Removal rules (cooldown after loss, daily loss limit, session filter, earnings blackout): violating round trips are removed. Assumption shown on screen: removing a trade does not change later trades (path independence).
- Cooldown: a round trip violates when it opened less than N minutes after the most recent losing round trip closed. Losses count across all symbols of the trader.
- Daily loss limit: a round trip violates when realized net P&L of round trips already closed the same UTC day is at or below minus the limit.
- No add to loser: only the added lots that were added while price was adverse to the average entry are removed. The remaining position is re-priced at the average entry of the kept lots, with fees and funding in proportion.
- Hard stop: replay mark candles after the entry bar. If price reaches the stop before the actual exit, exit at the worst price inside that bar (low for longs, high for shorts) plus a taker fee at the trade's own fee rate. Otherwise the actual result stands. Without mark candles the rule is untestable.
- Max leverage: size scales by cap divided by actual leverage, so P&L, fees and funding scale linearly. Liquidated round trips need a mark replay and are marked untestable here. Where leverage is not in the data the rule is untestable.
- Product switch: stock-perp exposure held over a weekend or overnight is replaced by equal-notional rToken spot at 1x, priced at the rToken bar close plus half the bar's high-low spread at each end, with no funding. Shorts are untestable because spot cannot be shorted.
- Null rule: applying no rule returns the ledger exactly (Lemma L3).

## Audit
For each stated rule: number of breaks, the exec ids of the broken trades, cost of breaking, and a 90% percentile bootstrap interval of the summed cost over the broken set (10,000 resamples, seed = sha256 of trader and rule, published). Fewer than 5 breaks shows "not enough breaks to price".

## Holdout test
1. Sort closed round trips by close time. The first ceil(2n/3) are train, the rest are test. Under 30 trades is audit only. Train under 30 or test under 15 is audit only for proposals.
2. Selection sees train only (the function takes train trades and nothing else). Candidates come from the pre-registered grid. A candidate must affect at least 5 train trades and between 2% and 50% of them. The candidate with the largest positive train gain is selected. The top 3 are shown, only the top 1 is tested.
3. Freeze: the selected rule, train stats, code commit and timestamp are written to `evidence/freeze/<trader>.json` with a sha256 and committed before the test step runs. The evaluation script refuses to run the test step otherwise.
4. Test: delta on the test trades, after fees and funding.
5. Sham: 1,000 draws. Removal rules remove k random test trades, where k is how many the rule removed on test. Modifying rules (hard stop, max leverage) apply the same modification to k random test trades. Hard stop is forced at the stop distance. Max leverage uses the mean scale factor the rule produced on test. The seed is the first 8 bytes of the freeze sha256. p = (1 + count of sham deltas at or above the observed delta) / 1001.
6. Baseline (GetAgent-style): on train, find the worst bucket by total net P&L among (symbol, side) and (product, session). On test, remove that bucket.
7. Verdict: ADOPT_WORTHY if delta on test is above zero and p is at most 0.10. NO_RULE_NEEDED if no candidate qualified or p is above 0.10. INSUFFICIENT if the thresholds fail.
8. Cohort kill rule: if the median test delta is at or below the median of the per-trader sham medians, or at or below zero, the "discovered rules help" headline is withdrawn and the audit headline ships. Published either way.

## What this does not show
Bitget Demo bots test detection power and false-positive control. They are not evidence about human traders. Leverage is not in Bitget fill history. For the Demo bots it is read from the client order id the bots set, which is how the bots label their own orders.
