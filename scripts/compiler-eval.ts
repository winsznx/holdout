import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuleSchema } from '../packages/engine/src/index.ts';
import {
  CompilerError,
  compileRule,
  configFromEnv,
  createClient,
  runCompilerEval,
  type CompilerLabel,
  type EvalCase,
} from '../packages/llm/src/index.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rulesPath = join(root, 'evidence/raw/compiler/rules.jsonl');
const labelsPath = process.argv[2] ?? join(root, 'evidence/raw/compiler/labels.json');
const runsDir = join(root, 'evidence/runs');

interface RawLine {
  text: string;
  label: unknown;
  author?: string;
}

function parseLabel(value: unknown, where: string): CompilerLabel | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as { refuse?: unknown; rule?: unknown };
  if (v.refuse === true) return { refuse: true };
  if (v.refuse === false) {
    const rule = RuleSchema.safeParse(v.rule);
    if (!rule.success) fail(`${where}: label rule is not a valid Rule: ${rule.error.message}`);
    return { refuse: false, rule: rule.data };
  }
  return undefined;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!existsSync(rulesPath)) fail(`Missing ${rulesPath}. Humans supply this file: one {text, label, author} per line.`);

const fileLabels: Record<string, CompilerLabel> = {};
if (existsSync(labelsPath)) {
  const raw = JSON.parse(readFileSync(labelsPath, 'utf8')) as Record<string, unknown>;
  for (const [key, value] of Object.entries(raw)) {
    const label = parseLabel(value, `${labelsPath} key ${key}`);
    if (!label) fail(`${labelsPath} key ${key}: not a valid label`);
    fileLabels[key] = label;
  }
}

const lines = readFileSync(rulesPath, 'utf8').split('\n').filter((l) => l.trim().length > 0);
const labels: Record<string, CompilerLabel> = {};
const inputs = lines.map((line, i) => {
  const id = String(i + 1);
  const parsed = JSON.parse(line) as RawLine;
  if (typeof parsed.text !== 'string' || parsed.text.length === 0) fail(`Line ${id}: missing text`);
  const label = typeof parsed.label === 'string' ? fileLabels[parsed.label] : parseLabel(parsed.label, `Line ${id}`);
  if (!label) fail(`Line ${id}: label is missing or not found in ${labelsPath}`);
  labels[id] = label;
  return { id, text: parsed.text, author: parsed.author };
});

async function main(): Promise<void> {
  const client = createClient(configFromEnv(process.env));
  const cases: EvalCase[] = [];
  for (const input of inputs) {
    try {
      const out = await compileRule(client, input.text);
      cases.push({ ...input, output: out.refuse ? { refuse: true } : { refuse: false, rule: out.rule } });
    } catch (err) {
      if (!(err instanceof CompilerError)) throw err;
      cases.push({ ...input, output: { refuse: false } });
    }
  }

  const summary = runCompilerEval(cases, labels);
  mkdirSync(runsDir, { recursive: true });
  const outPath = join(runsDir, `compiler-eval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(
    outPath,
    JSON.stringify({ provider: client.config.name, model: client.config.model, ranAt: new Date().toISOString(), ...summary }, null, 2),
  );
  console.log(`${summary.correct}/${summary.total} correct (${(summary.accuracy * 100).toFixed(1)} percent). Wrote ${outPath}`);
}

void main();
