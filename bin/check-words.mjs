#!/usr/bin/env node
// Word-count caps for the skills a matt-auto run reads (harness-diet-b, goal 5 / D9).
// `wc -w` semantics: whitespace-separated tokens. Exit 1 when any cap is exceeded.
// The spec asked for 3,500 / 3,500 / 8,500; D6 (delete only rules that lost their basis)
// stopped the diet at the values below. Lower a cap when a future diet earns it, never raise one.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CAPS = {
  "skills/model-routing/SKILL.md": 700,
  "skills/loop-gates/SKILL.md": 700,
  "plugins/matt-loop-codex/skills/matt-auto/SKILL.md": 3800,
  "plugins/auto-loop-codex/skills/autocode/SKILL.md": 4250,
  // Claude Code editions, measured after the 2026-09-07 regression (platform-split step 9).
  "plugins/matt-loop-claude/skills/matt-auto/SKILL.md": 4200,
  "plugins/matt-loop-claude/skills/pr-babysit/SKILL.md": 1100,
  "plugins/auto-loop-claude/skills/autocode/SKILL.md": 4200,
};
const CHAIN = [
  "plugins/matt-loop-codex/skills/matt-auto/SKILL.md",
  "plugins/matt-loop-codex/skills/matt-auto/references/execution-core.md",
  "skills/loop-report/views/matt-auto/contract.md",
  "skills/loop-report/SKILL.md",
  "skills/model-routing/SKILL.md",
  "skills/loop-gates/SKILL.md",
];
const CHAIN_CAP = 8700;

const words = (file) => fs.readFileSync(path.join(root, file), "utf8").split(/\s+/).filter(Boolean).length;

let bad = 0;
for (const [file, cap] of Object.entries(CAPS)) {
  const n = words(file);
  const ok = n <= cap;
  if (!ok) bad++;
  console.log(`  ${ok ? "✓" : "✗"} ${file} ${n} words (cap ${cap})`);
}
const chain = CHAIN.reduce((sum, f) => sum + words(f), 0);
const chainOk = chain <= CHAIN_CAP;
if (!chainOk) bad++;
console.log(`  ${chainOk ? "✓" : "✗"} matt-auto chain ${chain} words (cap ${CHAIN_CAP})`);
// The execution core is one text shipped in both matt-loop roots; the copies must not drift.
const CORE = "skills/matt-auto/references/execution-core.md";
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const coreOk = read(`plugins/matt-loop-codex/${CORE}`) === read(`plugins/matt-loop-claude/${CORE}`);
if (!coreOk) bad++;
console.log(`  ${coreOk ? "✓" : "✗"} matt-auto execution core identical in both editions`);
process.exit(bad ? 1 : 0);
