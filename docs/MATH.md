# Mathematical notes

Each lemma has a fast-check property test (`packages/engine/test`). Runs: 1,000 unless noted.

L1 Ledger conservation. For any valid fill sequence, including partial closes, the sum over round trips of net P&L equals the sum of execPnl minus the sum of fees plus the sum of funding. Gross is a sum of closing execPnl, fees are a sum over all fills, and funding is allocated with exact shares that add back to the record, so equality holds in decimal arithmetic.

L2 Idempotent ingest. Fills are keyed by execId and sorted by (timestamp, execId). A set union with itself changes nothing, and any permutation or duplication of the inputs yields the same ledger.

L3 Null rule identity. Applying the empty rule set returns the ledger unchanged. A rule that touches nothing returns zero delta.

L4 Removal decomposition. For removal rules under path independence, delta = minus the sum of net P&L over the removed set. Tested exactly in decimal arithmetic for cooldown and daily loss limit.

L5 Sham p-value validity. Under H0, the test trades are exchangeable with respect to the rule, so the observed statistic is one draw from the same randomization distribution as the sham draws. With p = (1 + #{sham >= observed}) / (B + 1), P(p <= a) <= a for every a, a standard Monte Carlo permutation argument (Phipson and Smyth 2010). Empirical check: a rule fixed in advance, 200 seeds of exchangeable synthetic trades, p-value histogram reported on the evidence page, tested as fraction at or below 0.10 not above 0.17 and at or below 0.05 not above 0.10 (sampling tolerance).

L6 No look-ahead. Session and earnings tags are functions of (timestamp, calendar, earnings events known at the timestamp). Appending data that arrives later never changes a tag.

L7 Bootstrap coverage. On known-distribution draws the 90% percentile bootstrap interval covers the true sum in a reported fraction of trials. The number is reported, not asserted. The test only guards against gross failure (0.80 to 0.97). Percentile bootstrap under-covers on small samples, which is why audits under 5 breaks are not priced.

L8 Selection blindness. The selection stage takes only train trades. Mutating any test trade leaves the selection and the freeze record byte identical.
