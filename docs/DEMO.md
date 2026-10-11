# Demo script (about 2 minutes)

Narration says "Bitget Demo bot" whenever bot data is on screen. Numbers are read from the live `/evidence` page, not from this file.

1. 0:00 Say the problem: traders do not lack rules, nothing checks them. Show the landing page hero (the real rule card).
2. 0:10 Open `/sample`, load bot R (a Bitget Demo bot). Show the ledger: round trips and the reconciliation delta against Bitget's positions history.
3. 0:25 On `/desk/rules`, type three rules in plain words. Show the compiled rule shown back in canonical English. Show the cost cards: bot R broke its 3-minute cooldown many times, with the interval and the trade ids.
4. 0:50 On `/desk/proposals`, show what the holdout test does and its honest result on this data: nothing qualified, so "no rule needed". Show why (the candidate list with skip reasons). This is the null result, and the evidence page says the headline is the audit.
5. 1:10 On `/evidence`, show the healthy control bot C: no rule needed, and the planted-leak test (P4) with recall and cost error.
6. 1:20 `/desk/sessions`: bot S's stock-perp trades by US session.
7. 1:30 `/desk/check`: type "long NVDA 20x now". One card: rules broken, record on similar trades, session now, earnings state, signal tags. Point at the line "Holdout never places orders. You decide."
8. 1:45 Claude Code with the Holdout Skill: ask it to preview an order with `bgc` in read-only mode. It calls `check_trade` first and shows the card.
9. 1:55 Terminal: `pnpm verify`, all PASS, then the tamper test failing as designed. End on the evidence URL.

Claude Code setup for step 8: `export HOLDOUT_RULEBOOK=$PWD/apps/web/public/data/rulebooks/bot-R.json`, then add the stdio server from `/skill`.
