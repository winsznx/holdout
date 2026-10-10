# @holdout/skill

The Holdout Agent Skill and MCP server. It lets a coding agent check a trade idea against a trader's tested rulebook before any Bitget order preview. It is read-only. It never places orders.

Tools:

- `get_rulebook()` returns the rulebook JSON from the path in `HOLDOUT_RULEBOOK`, after verifying its sha256.
- `check_trade({ symbol, side, leverage, product?, time?, lastLossClosedTs?, dayRealizedUsdt?, openPositionAdverse? })` runs the engine check with live context: earnings state from S5, signal tags from S6, session state from the NYSE calendar. If S5 or S6 is down, the card says `earnings calendar unavailable (S5)` or `signal unavailable (S6)` and nothing replaces it.
- `explain_rule({ ruleId })` returns the evidence recorded for a rule: the stated rule audit and, for proposals, the holdout test result.

## Install

1. Export your rulebook from the Holdout app and note the path.
2. Add the MCP server to your agent and copy `SKILL.md` where the agent reads skills. Steps for Claude Code, Codex, OpenClaw and Cursor are in `SKILL.md`.

Quick local run:

```
HOLDOUT_RULEBOOK=/path/to/rulebook.json pnpm --filter @holdout/skill exec tsx src/stdio.ts
```

## HTTP

`handleMcpRequest(request, env)` in `src/http.ts` is a fetch-style handler for a Cloudflare Worker route at `/api/mcp`. It uses the SDK streamable HTTP transport in stateless mode and no Node-only APIs. The rulebook comes from the `x-holdout-rulebook-url` header (https only) or from `env.HOLDOUT_RULEBOOK_URL` or `env.HOLDOUT_RULEBOOK_JSON`.

## Demo flow with bgc

Run `bgc` in read-only or dry run mode only. Holdout does not need keys and the demo never places an order.

1. Start Claude Code with the `holdout` MCP server and `SKILL.md` installed.
2. Ask: "I want to go long NVDA 20x on the stock perp. Preview the order with bgc."
3. The agent calls `check_trade` first and shows the card: rules broken, session now, earnings state (S5), signal tags (S6), similar past trades.
4. The agent stops and waits. You decide. Only then does it run the `bgc` preview, in dry run.

## Scripts

- `pnpm --filter @holdout/skill typecheck`
- `pnpm --filter @holdout/skill test`
- `pnpm --filter @holdout/skill smoke` starts the stdio server against a rulebook in `apps/web/public/data/rulebooks/` and calls the three tools. It skips with a message when none exists.
- `pnpm --filter @holdout/skill build` compiles to `dist/` with tsc. The workspace packages `@holdout/engine` and `@holdout/bitget` ship TypeScript source, so a published build needs them bundled or published first.

## Publishing note

The package name stays `@holdout/skill` inside the repo. The planned npm name is `@winszn/holdout-skill`, to be set through publishConfig or a rename at publish time. It is not published.

Tests build their rulebook from `makeRulebook` in `test/fixtures.ts`, labeled as a test fixture. No trader history is invented for users.
