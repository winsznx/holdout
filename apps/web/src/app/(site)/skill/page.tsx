import type { Metadata } from 'next';
import { CodeBlock, Container, PageHeading } from '@/components/ui';

export const metadata: Metadata = { title: 'Skill' };

const ORIGIN = 'https://holdout.timjosh507.workers.dev';

const TOOLS = [
  { name: 'get_rulebook', text: 'Returns your exported rulebook. The path comes from the HOLDOUT_RULEBOOK environment variable.' },
  { name: 'check_trade', text: 'Takes symbol, side, leverage, and optionally product and time. Returns the rules the trade breaks, stats from similar past trades, session state now, earnings state and signal tags. Read only.' },
  { name: 'explain_rule', text: 'Takes a rule id and returns the evidence for that rule.' },
] as const;

const claudeStdio = `claude mcp add holdout \\
  --env HOLDOUT_RULEBOOK=/path/to/holdout-rulebook.json \\
  -- node /path/to/holdout/packages/skill/dist/stdio.js`;

const claudeHttp = `claude mcp add --transport http holdout ${ORIGIN}/api/mcp \\
  --header "x-holdout-rulebook-url: https://example.com/your-rulebook.json"`;

const codex = `[mcp_servers.holdout]
command = "node"
args = ["/path/to/holdout/packages/skill/dist/stdio.js"]
env = { HOLDOUT_RULEBOOK = "/path/to/holdout-rulebook.json" }`;

const cursor = `{
  "mcpServers": {
    "holdout": {
      "command": "node",
      "args": ["/path/to/holdout/packages/skill/dist/stdio.js"],
      "env": { "HOLDOUT_RULEBOOK": "/path/to/holdout-rulebook.json" }
    }
  }
}`;

const build = `git clone ${'https://github.com/winsznx/holdout'}
cd holdout
pnpm install
pnpm --filter @holdout/skill build`;

export default function SkillPage() {
  return (
    <Container className="max-w-[860px] py-12 sm:py-16">
      <PageHeading
        label="Skill + MCP"
        title="Your rulebook inside your agent"
        intro="The Holdout Skill tells your coding agent to check a trade against your rulebook before it previews an order, and to wait for you. The MCP server answers those checks. Neither one places orders."
      />

      <div className="mt-10 space-y-12">
        <section className="space-y-3">
          <h2 className="text-[24px]">What the agent is told</h2>
          <p className="max-w-[64ch] text-muted">Before any order preview with the Bitget agent CLI, call check_trade, show the card, and wait for the human. Never place an order on the human&apos;s behalf because of Holdout output.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[24px]">Tools</h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {TOOLS.map((t) => (
              <li key={t.name} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
                <code className="num text-[13px] text-signal">{t.name}</code>
                <span className="text-[14px] text-muted">{t.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-[24px]">Install</h2>
          <p className="max-w-[64ch] text-muted">Export your rulebook JSON from the Rulebook page on the desk, then point the server at it. The stdio server runs from a clone of the repo.</p>
          <CodeBlock label="Build the stdio server">{build}</CodeBlock>
          <p className="max-w-[64ch] text-[13px] text-muted">HOLDOUT_RULEBOOK is the path to the exported rulebook file. If it is not set, the server says so and returns no rulebook.</p>

          <h3 className="pt-4 text-[18px]">Claude Code</h3>
          <CodeBlock label="stdio">{claudeStdio}</CodeBlock>
          <CodeBlock label={`HTTP at ${ORIGIN}/api/mcp`}>{claudeHttp}</CodeBlock>
          <p className="max-w-[64ch] text-[13px] text-muted">Over HTTP the server has no file path, so send the rulebook location in the x-holdout-rulebook-url header.</p>

          <h3 className="pt-4 text-[18px]">Codex</h3>
          <CodeBlock label="~/.codex/config.toml">{codex}</CodeBlock>

          <h3 className="pt-4 text-[18px]">Cursor</h3>
          <CodeBlock label=".cursor/mcp.json">{cursor}</CodeBlock>

          <h3 className="pt-4 text-[18px]">OpenClaw</h3>
          <p className="max-w-[64ch] text-muted">Register the same stdio command, node with the path to dist/stdio.js and the HOLDOUT_RULEBOOK variable, in OpenClaw&apos;s MCP server settings.</p>

          <h3 className="pt-4 text-[18px]">The Skill file</h3>
          <p className="max-w-[64ch] text-muted">SKILL.md lives in packages/skill. Copy it into your agent&apos;s skills folder so the agent knows to call check_trade before an order preview.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[24px]">Limits</h2>
          <p className="max-w-[64ch] text-muted">Market state tags come from the live signal and earnings sources, so they describe now and not the past. If a source is unavailable the card names it and leaves that row out.</p>
        </section>
      </div>
    </Container>
  );
}
