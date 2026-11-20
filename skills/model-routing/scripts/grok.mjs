#!/usr/bin/env node
// Grok priority support for gate-route and review-gate. Local files only, no network.
//   status   weekly Grok token use vs the budget; ok=false at or above cap_pct, or when
//            the budget is unset (fail closed: callers keep their current routes).
//   extract  turn a `grok -p --output-format json` envelope into a reviewer output,
//            refusing answers that never read the repository.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TABLE_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'references', 'gate-routes.json');
const loadTable = () => JSON.parse(readFileSync(TABLE_PATH, 'utf8'));

export const SESSIONS_DIR = join(homedir(), '.grok', 'sessions');

// Sum totalTokens of every local Grok session updated inside the window. Grok writes
// usage.json per session (TUI and headless alike); use on other machines is not seen.
export function weeklyTokens({ dir = SESSIONS_DIR, now = Date.now(), days = 7 } = {}) {
  let tokens = 0, sessions = 0;
  if (!existsSync(dir)) return { tokens, sessions };
  const since = now - days * 86400000;
  for (const cwd of readdirSync(dir)) {
    const cwdDir = join(dir, cwd);
    if (!statSync(cwdDir).isDirectory()) continue;
    for (const id of readdirSync(cwdDir)) {
      const f = join(cwdDir, id, 'usage.json');
      if (!existsSync(f)) continue;
      let u;
      try { u = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
      const at = Date.parse(u.updatedAt ?? '') || statSync(f).mtimeMs;
      if (at < since) continue;
      tokens += u.session?.totalTokens ?? 0;
      sessions += 1;
    }
  }
  return { tokens, sessions };
}

export function budgetStatus({ table = loadTable(), env = process.env, usage } = {}) {
  const p = table.grok_priority;
  if (!p) return { ok: false, reason: 'no grok_priority in the rule table' };
  const budget = Number(env.GROK_WEEKLY_TOKEN_BUDGET || p.weekly_token_budget || 0);
  const { tokens, sessions } = usage ?? weeklyTokens({ days: p.window_days ?? 7 });
  if (!budget) return { ok: false, tokens, sessions, reason: 'weekly token budget unset (GROK_WEEKLY_TOKEN_BUDGET)' };
  const pct = Math.round((tokens / budget) * 1000) / 10;
  const ok = pct < p.cap_pct;
  return { ok, pct, tokens, budget, sessions, cap_pct: p.cap_pct,
    reason: `grok weekly use ${pct}% ${ok ? '<' : '>='} ${p.cap_pct}% of ${budget} tokens` };
}

// A schema-valid answer is not proof of a review: Grok can return empty findings
// without opening a file. Require at least one tool round-trip (num_turns >= 2).
export function extract(envelope, reviewer) {
  if (envelope.is_error || envelope.stopReason === 'error') throw new Error(`grok error: ${envelope.text ?? 'unknown'}`);
  if (!envelope.structuredOutput) throw new Error('grok envelope has no structuredOutput');
  if ((envelope.num_turns ?? 0) < 2) throw new Error(`grok answered in ${envelope.num_turns ?? 0} turn(s) without reading the repository`);
  return { reviewer, findings: envelope.structuredOutput.findings ?? [] };
}

const USAGE = `usage: grok.mjs status
       grok.mjs extract <envelope.json> <out.json> --model <model> [--effort <effort>]`;

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    if (cmd === 'status') {
      console.log(JSON.stringify(budgetStatus(), null, 2));
    } else if (cmd === 'extract') {
      const [inp, out] = rest;
      const opt = k => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
      if (!inp || !out || !opt('--model')) throw new Error('extract needs <envelope.json> <out.json> --model');
      const reviewer = { family: 'grok', model: opt('--model'), effort: opt('--effort') ?? null };
      const result = extract(JSON.parse(readFileSync(inp, 'utf8')), reviewer);
      writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
      console.log(`grok extract: ${result.findings.length} finding(s)`);
    } else {
      console.log(USAGE);
      process.exit(cmd === '--help' || cmd === '-h' ? 0 : 2);
    }
  } catch (e) {
    console.error(`grok.mjs: ${e.message}`);
    process.exit(1);
  }
}
