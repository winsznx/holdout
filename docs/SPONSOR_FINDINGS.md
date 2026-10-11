# Sponsor findings

Concrete observations from building against sponsor surfaces. Dates are UTC, 2026-10-10.

## Bitget UTA v3 API
- Fills have no leverage field. Leverage must be carried by the caller, so the harness encodes it in clientOid as `L<leverage>x` and the normalizer parses it. Real fills from other clients get `leverage: undefined`.
- Fill `execPnl` is gross of fees. `history-position.netProfit` includes fees and funding. Reconciling the two needs fee sums from fills.
- A window with no fills returns `data: {list: null, cursor: null}`, not an empty array. A page with fewer rows than `limit` still returns a non-empty `cursor`, so paging must stop on a short page.
- `GET /api/v3/market/candles`: with both startTime and endTime it returns the newest 100 bars before endTime, not the oldest after startTime, so range paging has to walk backwards. The spec says limit max 100 in the parameter text and 1,000 in the description. `limit=1000` works on live candles.
- `GET /api/v3/market/history-fund-rate`: spec says limit max 200, the API rejects anything above 100 with 40020. `cursor` is a page number.
- `financial-records` `type` accepts only a fixed enum. FUNDING, FUNDING_FEE and similar guesses return 40020. Only OPEN_LONG, OPEN_SHORT, CLOSE_LONG, CLOSE_SHORT and TRANSFER_IN were confirmed. No funding row was observed because Demo positions were held for minutes, so the funding type name is unverified.
- `GET /api/v3/tax/records` is in the spec but returns 404 (40404) on the Demo environment. On the live host the Demo key gets 40099 "exchange environment is incorrect", so the path was not exercised.
- Instruments mark stock perps with `symbolType: "stock"` and `isRwa: "YES"`. Metals and commodities are also `isRwa: "YES"`. Twelve rows have `symbolType: "crypto"` with `isRwa: "YES"` (for example HPQUSDT, FCXUSDT, EURUSDUSDT), so `isRwa` alone over-selects.
- No v3 endpoint exposes the permissions of the caller's own API key. The v3 spec only has sub-account key listing. `GET /api/v2/spot/account/info` (not in the v3 spec) returns `authorities`, which was `["uamw"]` for the Demo read-write key. The meaning of the codes is undocumented, so the client treats an unknown set as "unknown", never as read-only.
- CORS: public GETs return `access-control-allow-origin: *`. Preflights for signed headers returned 403 from curl. Browser-held keys need our forwarder.
- An agentic sub-account key cannot read main-account history, so agentic OAuth is not used for review. This follows the Bitget API model (sub-account scope) and was not separately tested with an agentic account.

## bitget-mcp-server (S5)
- Two generic tools (`guide`, `do_query`) front a catalog. Tool discovery by `tools/list` shows no stock tools at all.
- The earnings calendar is per symbol and reaches back to at least 2010. Future dates exist only after the company announces them (AAPL and TSLA had one, NVDA did not).
- US stock K-lines (`equity_price_historical`) returned HTTP 204 empty for every symbol and range tried.
- Responses contain Python deprecation warnings in `warnings`, and Chinese field values such as `is_trading_time` and report type names.

## bitget-signal (S6)
- No historical endpoint. Every tool is current state only, which matches the design that historical tags come from S3 and S7.
- The MCP backend is a third-party-looking host (`datahub.noxiaohao.com`) running `market-data-mcp` 1.26.0, not an `bitget.com` domain.
- Of the tools we tested, only technical_analysis and crypto_derivatives returned data. Fear and greed, long/short, open interest, taker ratio, Reddit, earnings and macro calls returned an empty `error` string with `isError: false`, which a client can mistake for success.
- Long/short, open interest and taker ratio are documented as Binance futures data, not Bitget data. The bundled roadmap lists Bitget-only signals (top-trader flow, derivatives structure, large-flow detection) as not yet shipped.
- The Bollinger block of `technical_analysis full_analysis` had upper below lower with a negative bandwidth.

## Chainbase AgentKey (S8)
- Server-usable MCP and SDK exist, but credentials need a console sign-up and a paid subscription. The public docs omit the MCP URL and header format. Install is a browser device-auth flow through an npx CLI.

## Holdout Skill build notes (2026-10-11)
- S5 earnings calendar returns the period end date in `time`, not the report date. The Skill uses the report-date fields and assumes 08:00 ET for pre-market and 16:00 ET otherwise, because the clock time is not in the data.
- S5 date filters return empty results. The Skill fetches the full per-symbol calendar and filters locally.
- S6 `crypto_derivatives` expects the symbol as `ETH/USDT`, not `ETHUSDT`. The Bollinger block in `technical_analysis` comes back inverted, so the Skill leaves it out.
- Bitget Demo allows one demo deposit per 72 hours, which caps a Demo test fleet at the first deposit.
- Bitget v3 fills carry no leverage. The harness encodes leverage in the client order id (`L<leverage>x`) so it survives a read-back from the API. A live trader's history has no such label, so the max-leverage rule is untestable on a plain Bitget export.

## Bitget API from Cloudflare Workers (2026-10-11)
- `api.bitget.com` answers requests that come from Cloudflare Workers with HTTP 403 and the body `{"cloudflare":"block"}`. The same request from a laptop or a VPS succeeds. S5 (`agent.bitget.com/mcp`) and the OpenAI and Supabase APIs work from Workers.
- Public GETs work directly from a browser (CORS allows any origin), so the desk loads candles from the browser. Signed GETs with `ACCESS-*` headers fail in a browser (CORS preflight is rejected), and they fail through a Worker (the block above). A hosted review tool that sits on Cloudflare therefore cannot sync a read-only key through its own edge. It needs a relay on a non-Cloudflare host, or the trader uses the CSV path.

## Funding rows in financial records (2026-10-11)
- On Demo, funding settlements appear in `GET /api/v3/account/financial-records` with `type` `CONTRACT_MAIN_SETTLE_FEE_USER_IN`, at about 00:00:01 UTC, one row per symbol with an open position. `amount` is signed from the account's side. The type name is not in the spec's example list and `type=FUNDING` returns 40020. The normalizer now matches `FUND` or `SETTLE_FEE`.
