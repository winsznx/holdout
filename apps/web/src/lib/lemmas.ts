export interface Lemma {
  id: string;
  name: string;
  statement: string;
}

export const LEMMAS: Lemma[] = [
  { id: 'L1', name: 'Ledger conservation', statement: 'The sum of round trip net P&L equals the sum of fill execPnl, minus fees, plus funding, for any valid fill sequence including partial closes.' },
  { id: 'L2', name: 'Idempotent ingest', statement: 'ingest(A union A) equals ingest(A), and ingest(A union B) does not depend on order.' },
  { id: 'L3', name: 'Null rule identity', statement: 'Applying no rule returns the actual ledger exactly.' },
  { id: 'L4', name: 'Removal decomposition', statement: 'For removal rules under path independence, the change in net P&L equals minus the sum of net P&L over the removed trades.' },
  { id: 'L5', name: 'Sham p-value validity', statement: 'Under the null that test trades are exchangeable with respect to the rule, P(p <= alpha) <= alpha. The +1 correction makes the Monte Carlo permutation test exact (Phipson and Smyth, 2010). An empirical check runs the pipeline with a randomly chosen rule on 200 seeds and shows the p-value histogram is approximately uniform.' },
  { id: 'L6', name: 'No look-ahead', statement: 'Session and earnings tags do not change when any data after the trade timestamp is appended or deleted.' },
  { id: 'L7', name: 'Bootstrap interval coverage', statement: 'On draws from a known distribution, the 90% interval covers the true sum in about 90% of 1,000 trials. The covered share is reported, not asserted.' },
  { id: 'L8', name: 'Selection blindness', statement: 'Changing any test-period trade leaves the frozen selection output byte-identical.' },
];
