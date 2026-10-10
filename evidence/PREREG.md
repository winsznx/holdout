# Pre-registration

Committed before any evaluation or test-period read. Its sha256 is shown on the evidence page.

## Scope
Templates: cooldown after loss, max leverage, no add to loser, hard stop, daily loss limit, session filter, earnings blackout, product switch on weekend.

## Parameter grid (26 candidates, 24 when day-level data removes the intraday ones from consideration)
- cooldown minutes: 15, 30, 45, 60, 120. For day-level data: 1440, 2880, 4320.
- max leverage: 3, 5, 10, 20.
- hard stop percent: 1, 2, 3, 5.
- daily loss limit: 2, 3, 5 times the median absolute trade net P&L on train.
- session filter on stock perp and rToken: overnight; weekend; friday_close; overnight, weekend and holiday.
- earnings blackout hours: 12, 24, 48.
- no add to loser. Product switch on weekend.

## Split rule
Closed round trips sorted by close time. Train is the first ceil(2n/3), test is the rest. Under 30 trades is audit only. Train under 30 or test under 15 is audit only for proposals.

## Selection criterion
Maximize the train gain (counterfactual minus actual net P&L on train) among candidates that affect at least 5 train trades and between 2% and 50% of them, with a positive train gain. Top 3 shown, top 1 tested. Selection code receives train trades only.

## Primary metric
Delta on test: counterfactual net P&L minus actual net P&L on the test trades, after fees and funding.

## Sham design
1,000 draws. Removal rules remove k random test trades, k equal to the number the rule removed on test. Modifying rules apply the same modification to k random test trades (hard stop forced at the stop distance, max leverage at the mean scale factor produced on test). Seed is the first 8 bytes of the freeze sha256. p = (1 + count of sham deltas at or above observed) / 1001.

## Baseline
GetAgent-style: on train, the worst bucket by total net P&L among (symbol, side) and (product, session), removed on test.

## Thresholds
ADOPT_WORTHY: delta on test above 0 and p at most 0.10. NO_RULE_NEEDED: no candidate qualified or p above 0.10. INSUFFICIENT: thresholds not met.

## Seed rule
Audit bootstrap: seed is the sha256 of (version tag, trader id, rule JSON), 10,000 resamples, 90% interval. Sham: seed from the freeze hash. No other randomness.

## Kill rule
If the median test delta across traders with a tested rule is at or below the median of their sham medians, or at or below 0, the "discovered rules help" headline is withdrawn in writing and the audit headline ships. Published either way. Failed runs, nulls and rejected candidates stay in evidence/.

## Cohorts
Bitget Demo bots (R revenge re-entry, A adds to losers, V leverage creep, S session, C disciplined control) form one cohort and are labeled "Bitget Demo bot". Strategy samples (money_boys files) are reported separately and are not human or live. Human cohorts, if any arrive, are reported separately by venue. Cohorts are never merged.

## Changes made after seeing data
None at the time of writing. Any later change is recorded in docs/DECISIONS.md with a timestamp, and results produced before the change stay published.
