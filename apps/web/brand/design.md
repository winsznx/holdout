# Holdout design

Status: locked, version 1.0.0, 2026-10-10. Machine-readable tokens live in `brand.json`. Change a token there first, then in `src/app/globals.css`.

## Foundation

Product: Holdout, a trading journal that proves which rules make you money.
Category: trader review tools for Bitget stock perps, rTokens and crypto futures.
Audience: retail to VIP3 traders, 10+ trades a week, reading numbers on phones and laptops.
Promise: your rules, tested on trades they never saw.
Idea made visible: the third of the history that was held out and never seen.
Personality: exact, plain, unhurried. It shows its denominators and says what it could not test.
Reasons to believe: every number comes from an engine output with a denominator, null results are published, Holdout never places orders.
Clichés avoided: candlesticks, bull and bear, shields, neon on black, glass cards, fake terminals.
Smallest size: 16 px favicon.
Non-goals: a crypto-native look, a bank look, decoration.

## Mark

A rounded square split 2:1 vertically. The left two thirds are solid ink. The right third is an outline, separated by a thin gap. The solid part is the history the rule was built on. The outline is the part held out.

Construction on a 60 unit square: solid segment 38 wide, gap 3, held segment 19 wide drawn with a 4 unit inside stroke. Outer corner radius 10, inner corner radius 3.

Files in `public/brand/`: `symbol.svg`, `symbol-reversed.svg`, `symbol-signal.svg` (ink body, signal outline, for one-off emphasis), `lockup-horizontal.svg`, `lockup-horizontal-reversed.svg`. Wordmark text is outlined Space Grotesk Bold, no live text in the SVG.

Validated at 16, 32 and 128 px on paper and on dark. At 16 px the held outline reads as a thin vertical bracket next to a solid block. That is the smallest supported size. The favicon uses a heavier outline (see `src/app/icon.tsx`).

Forbidden: filling the held segment, changing the ratio, effects, signal color on the solid segment, busy backgrounds.

## Color

| Role | Light | Dark | Use |
|---|---|---|---|
| paper | #F3F0E8 | #121110 | page background |
| surface | #FBFAF6 | #1A1916 | cards, tables |
| ink | #101010 | #F3F0E8 | text, solid mark, primary button |
| line | #D9D4C7 | #322F28 | every 1px border |
| muted | #6B675C | #A39E90 | secondary text, labels |
| signal | #D9480F | #F2672B | the one accent |
| gain | #1F7A4D | #4CC38A | positive P&L only |
| loss | #B3261E | #F07167 | negative P&L only |

Signal is the held-out color. It marks test data, focus rings and at most one primary marker per view. Signal on paper is 4.2:1, so it is not used for small text. Gain and loss always travel with a sign or a word, never color alone.

## Type

Space Grotesk for display and UI, weights 500 and 700, tight tracking on headings. JetBrains Mono for numbers, labels, hashes and ids, with tabular figures on. Labels are 11 px mono uppercase with 0.08em tracking. Body is 15 px.

## Shape and density

Cards are flat: surface fill, 1px line, 6px radius, no shadow. Tables are dense with mono right-aligned numbers. Section labels are small mono tags like `01 / Workflow`. Separation comes from lines and spacing.

## Data labels

Every number carries a provenance tag: observed, target or estimated. Data source tags: "Bitget Demo bot", "Strategy sample", "human, Bitget Demo", "human, live account". The strategy sample sentence is fixed: "Strategy sample: a friend's trading agent (backtest and paper ledger), not live fills."

## Lock record

Master: `public/brand/symbol.svg` v1.0.0. Clear space: half the mark height. Minimum sizes: symbol 16 px, lockup 96 px wide. Lockups allowed: symbol alone, horizontal lockup, positive and reversed. References used for structure and density only: a cream landing page with ruled feature grids and mono labels, a split-pane dashboard with a left rail. No reference brand name, logo, color or copy is used.

## Standing avoid list

Glass, gradients, glow, fake terminals, generic bento, stock finance icons, invented numbers, invented people or company logos, em dashes in copy.
