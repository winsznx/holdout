---
name: holdout
description: Check a trade idea against the trader's own tested rulebook before any Bitget order preview or order. Use before every bgc order preview, and whenever the human is about to place a Bitget trade. Holdout is read-only and never places orders.
---

# Holdout

Holdout turns a Bitget trader's own fills into a rulebook, with each rule tested on trades it never saw. This skill gives you three read-only tools from the `holdout` MCP server: `get_rulebook`, `check_trade` and `explain_rule`.

Holdout never places orders. You must not place one because of what Holdout says.

## When to use it

Call `check_trade` before any of these:

- a `bgc` order preview, in any mode
- any order the human is about to place on Bitget, by you or by hand
- any time the human asks "should I take this trade" or describes a trade idea

## What to do

1. Collect the trade idea: symbol (for example `NVDAUSDT`), side (`long` or `short`), leverage, and product (`perp`, `stock_perp`, `rtoken`, `stock_plus` or `spot`). Always pass `product` when you know it. Ask the human for anything missing. Do not guess leverage.
2. Call `check_trade`. Pass `lastLossClosedTs`, `dayRealizedUsdt` or `openPositionAdverse` only when you actually know them. Otherwise leave them out and the card will say which rules it could not check.
3. Show the human the whole card: broken rules, rules that could not be checked, session now, earnings state, signal tags and similar past trades. Do not shorten it into a verdict.
4. Stop and wait for the human to decide. Do not run `bgc` order preview, and do not place anything, until they say what they want.
5. If the human asks why a rule exists, call `explain_rule` with the rule id from the card and show the evidence as returned.

## Rules you follow

- Never place, preview, amend or cancel an order on your own because of Holdout output. The human decides.
- Report numbers exactly as the card shows them. Do not compute your own win rate, P&L or odds.
- If the card says `earnings calendar unavailable (S5)` or `signal unavailable (S6)`, say so in those words. Do not fill the gap from another source and present it as Holdout data.
- If a rule is `not_checkable`, tell the human what is needed to check it.
- If `check_trade` or `get_rulebook` returns an error, such as a missing rulebook or a failed hash check, tell the human plainly: "Holdout has no valid rulebook, so this trade was not checked." Do not proceed as if it passed.
- A card with zero broken rules is not advice to trade. It only means no tested rule was broken.

## Install

Holdout needs a rulebook file exported from the Holdout web app. Set its path in `HOLDOUT_RULEBOOK`.

The server is the `holdout-mcp` command from `@holdout/skill`. Until the npm package is published, run it from the repo: `pnpm --filter @holdout/skill exec tsx src/stdio.ts`. Use the absolute path to your checkout in the configs below.

### Claude Code

```
claude mcp add holdout --env HOLDOUT_RULEBOOK=/absolute/path/to/rulebook.json -- npx tsx /absolute/path/to/holdout/packages/skill/src/stdio.ts
mkdir -p ~/.claude/skills/holdout && cp /absolute/path/to/holdout/packages/skill/SKILL.md ~/.claude/skills/holdout/SKILL.md
```

### Codex

Add to `~/.codex/config.toml`:

```
[mcp_servers.holdout]
command = "npx"
args = ["tsx", "/absolute/path/to/holdout/packages/skill/src/stdio.ts"]
env = { HOLDOUT_RULEBOOK = "/absolute/path/to/rulebook.json" }
```

Copy `SKILL.md` into `~/.codex/skills/holdout/SKILL.md`, or paste it into your `AGENTS.md`.

### OpenClaw

Register the MCP server with the same command, args and `HOLDOUT_RULEBOOK` env as above in your OpenClaw MCP server settings. Copy `SKILL.md` into your OpenClaw skills folder as `holdout/SKILL.md`.

### Cursor

Add to `.cursor/mcp.json`:

```
{
  "mcpServers": {
    "holdout": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/holdout/packages/skill/src/stdio.ts"],
      "env": { "HOLDOUT_RULEBOOK": "/absolute/path/to/rulebook.json" }
    }
  }
}
```

Copy the contents of `SKILL.md` into `.cursor/rules/holdout.mdc` with `alwaysApply: true` so the agent follows it.

### Remote over HTTP

A hosted endpoint at `/api/mcp` takes the rulebook URL in the `x-holdout-rulebook-url` header (an https link to your rulebook JSON). The hash is verified the same way.
