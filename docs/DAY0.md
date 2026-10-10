# Day-0 checks

Times are Lagos (WAT). Spec source: docs/vendor/bitget-agent-sdk-3.3.1.openapi.yaml.

## Demo account facts (2026-10-10 ~10:55)
- Demo key is a Unified Trading Account (UTA v3) key. `GET /api/v3/account/assets` with header `paptrading: 1` returns 200.
- `GET /api/v2/mix/account/accounts` returns 40014 (needs v2 futures permission). Use v3.
- Account settings: accountMode hybrid, assetMode multi_assets, holdMode hedge_mode.

## D1 Demo futures orders: PASS (after funding)
`POST /api/v3/trade/place-order` {category USDT-FUTURES, symbol BTCUSDT, qty 0.001, side buy, posSide long, orderType market} returned 400 code 25203 "Insufficient margin". Auth and order path work. Demo equity is 0 and needs demo funds credited in the Bitget Demo UI.

## D2 Stock perps on Demo: PASS
`GET /api/v3/market/instruments?category=USDT-FUTURES` on demo returns 45 instruments including AAPLUSDT, NVDAUSDT, TSLAUSDT. Bot S (session) runs on NVDAUSDT.

## D4 rToken spot on Demo: no `r*` symbols in 26 demo spot instruments. rToken counterfactual cannot be tested from Demo.

## D1 result (2026-10-10 22:04 UTC)
Demo account funded with about 414 USDT (Bitget allows one demo deposit per 72 hours). BTCUSDT market buy then sell, 0.0002 BTC, hedge mode (side+posSide), both 200. Fills read back from `GET /api/v3/trade/fills`: fields execId, orderId, side, tradeSide (open_long/close_long), posSide, execPrice, execQty, execPnl, tradeScope (taker/maker), feeDetail[{feeCoin,fee}], createdTime.
Candles: `GET /api/v3/market/candles` rows are [ts, open, high, low, close, baseVol, quoteVol], oldest first, last row is the forming bar.

## Harness layout
One Demo account, hedge mode, so bots are separated by symbol: R BTCUSDT, A ETHUSDT, V SOLUSDT, S NVDAUSDT, C DOGEUSDT. Notional 20 USDT per lot (R re-entry 40).

## D6 bitget-mcp-server (S5): PASS with gaps (2026-10-10 22:19 to 22:22 UTC)
Endpoint `https://agent.bitget.com/mcp`, streamable HTTP, no auth. Server info on initialize: `bitget-mcp-server` 4.1.0.
`tools/list` returns exactly 2 tools, not a flat tool-per-dataset list:
- `guide({category?, subcategory?, keyword?})` lists catalog categories or entries. Categories: crypto (39 entries), equity (22), etf (3), news (1), sentiment (2).
- `do_query({entry_id, params})` runs a catalog entry. Response envelope: `{success, status_code, data:{results:[...]}, error}`. `status_code` 204 with `data:""` means no rows.
Entries we use (from `guide({category:"equity"})`):
- `equity_price_quote` {symbol}: call `{"entry_id":"equity_price_quote","params":{"symbol":"NVDA"}}` returned 200, one row with last_price 230.33, open, high, low, close, volume, prev_close, change, change_percent, total_market_cap, pb. Fixture: `packages/bitget/test/fixtures/s5-equity-price-quote.json`.
- `equity_calendar` {symbol (required), fiscal_year?, start_date?, end_date?}: earnings calendar is per symbol, there is no market-wide calendar. Row keys: symbol, period_ending, fiscal_year, report_type_name, perf_briefing_fore_dsclsr_date, perf_brief_dsclsr_date, perf_report_dsclsr_date, perf_report_fore_dsclsr_date, is_trading_time (e.g. after hours), time (ms).
  Range available, measured on 22:20 UTC: NVDA with no date filter returns 82 rows from 2010-08-12 to 2026-08-26. NVDA with 2020-01-01 to 2030-12-31 returns 35 rows, 2020-02-13 to 2026-08-26. AAPL same filter returns 34 rows to 2026-11-02 (future date present). TSLA returns 33 rows to 2026-10-21. NVDA with start 2026-10-01, end 2026-12-31 returns an empty list at 22:3x UTC, so the next NVDA report date is not published yet. Historical coverage is good back to at least 2010, forward coverage depends on the company announcing a date. Fixture: `s5-equity-calendar-range.json`.
  Rule 7 consequence: blackout windows are computable for past fills for any symbol with history, and the "next earnings" tag can be missing for stocks whose date is not announced. Show that as coverage, not as zero.
- `equity_profile` {symbol}: 200, name, isin, exchange, industry. `equity_fundamental_ratios` {symbol, limit?}: 200, pe, pb, ps, ev, tmv_usd. Fixtures `s5-equity-profile.json`, `s5-equity-fundamental-ratios.json`.
- `equity_price_historical` (K-lines) {symbol|symbols, start_time, end_time as integers}: FAIL. Returned `{success:true, status_code:204, data:""}` for NVDA, AAPL, MSFT, TSLA, with no range, ms ranges, second ranges and a 400 day range. Strings for start_time are rejected client side with "must be of type 'integer'". `symbols` alone returns 422. The wrapper `getUsStockKlines` returns `{available:false, surface:'S5'}` on this. No fallback to Bitget stock perp candles is done inside the wrapper. Fixture: `s5-equity-price-historical.json`.
Wrappers: `getUsStockQuote`, `getUsStockKlines`, `getEarningsCalendar`, `getFundamentals` in `packages/bitget/src/mcp.ts`.

## D7 bitget-signal (S6): PARTIAL (2026-10-10 22:19 to 22:22 UTC)
Package `@bitget-ai/bitget-signal` 1.2.0 (npm, published 2026-05-29, MIT). It ships 5 markdown skills (macro-analyst, market-intel, news-briefing, sentiment-analyst, technical-analysis) and an installer that registers one MCP server: `https://datahub.noxiaohao.com/mcp`, streamable HTTP, no key. The MCP entry name in host config is `bitget-signal`. Server info: `market-data-mcp` 1.26.0.
`tools/list` returns 19 tools: crypto_market, defi_analytics, dex_market, sentiment_index, tradfi_news, crypto_price, social_trending, network_status, derivatives_sentiment, global_data, news_feed, cn_market, global_assets, crypto_derivatives, technical_analysis, backtest, macro_indicators, rates_yields, cross_asset.
Live calls:
- `technical_analysis {action:"full_analysis", symbol:"BTC/USDT", timeframe:"4h"}` works: rsi 47.09 neutral, macd, bollinger, ma, atr. Fixture `s6-technical-analysis.json`. The bollinger block in that response is inverted (upper 81490 below lower 83829, negative bandwidth), so do not show raw bollinger bands.
- `technical_analysis {action:"rsi"}` and `crypto_derivatives {action:"ticker_24h", exchange:"bitget"}` work.
- `sentiment_index` (current, history, realtime), `derivatives_sentiment` (long_short, taker_ratio, open_interest, reddit_trending), `tradfi_news` (earnings, company), `macro_indicators` (latest_release) all returned `{"error": ""}` or `{"alt_me_error": ""}` with `isError:false`. Upstream providers are failing or keyless (tradfi_news says it needs FINNHUB_API_KEY on the server). Fixtures `s6-sentiment-index.json`, `s6-derivatives-sentiment.json`, `s6-tradfi-earnings.json`.
- There is no historical-state endpoint and no Bitget funding or open interest tool. `derivatives_sentiment` data is described as Binance futures data.
Verdict: the Check-a-trade card can use `technical_analysis` live. Fear and greed, long/short and macro tags return "signal unavailable (S6)" by name when the upstream returns an empty error. Wrapper `getSignalTags` returns one SurfaceResult per tag.

## D10 CORS on Bitget public market endpoints: PASS for GET, FAIL for signed requests (2026-10-10 22:18 to 22:19 UTC)
Request: `GET https://api.bitget.com/api/v3/market/tickers?category=USDT-FUTURES&symbol=BTCUSDT` with `Origin: https://evil.example`. Response 200, `access-control-allow-origin: *`, `access-control-allow-methods: GET, POST, OPTIONS`. No `access-control-allow-headers` is sent.
Preflight `OPTIONS /api/v3/trade/fills` and `/api/v3/market/tickers` with `Origin: https://holdout.timjosh507.workers.dev` and `Access-Control-Request-Headers` of `access-key,access-sign,...` or just `content-type` returned 403 each time, with ACAO `*` but no allow-headers. Tested with curl only, not in a real browser.
Consequence: plain public GETs work from a browser. Any request with custom headers (all signed calls, and `paptrading`) is likely blocked by preflight, so signed calls must go through our `/api/sync` forwarder (`forwardSignedGet`) and public calls can also go through `/api/market/*` as planned.

## D11 Chainbase AgentKey (S8): server endpoint exists, blocked on sign-up (2026-10-10 22:29 to 22:30 UTC)
Read: agentkey.app, docs.agentkey.app/llms.txt, quickstart, authentication, api-reference pages, and the text of `https://agentkey.app/install.sh` (read only, not run).
- Product is "one MCP server (and an SDK/API)" with about 1,800 tools in categories search, scrape, social (X, Reddit, YouTube, LinkedIn, TikTok, Instagram, Threads), crypto, finance (incl. Finnhub, Yahoo Finance), business, ecommerce.
- Four tools: `find_tools({q})`, `describe_tool`, `execute_tool({name:"Provider/Operation", params})`, `account` (free credit check). Example name: `Twitter/searchTweets`.
- Auth is one master key `ak_...` created in `https://console.agentkey.app`, tied to a paid subscription with monthly credits. The installer does browser device auth through an npx CLI and writes the key to the agent config.
- The public docs do not state the MCP URL or the header format. Those come from the console or from the CLI after login.
- No key held, so no NVDA news call was made. No account was created.
Human step: sign in at https://console.agentkey.app, pick a plan, create a master key, copy the MCP URL and auth header format shown in the console get-started page, and put the key in the server secret store as `AGENTKEY_API_KEY` (never in the repo). Then S8 can be called from the edge function with `find_tools("latest NVDA news")` then `execute_tool`. Until then S8 is reported as unavailable by name.
