#!/usr/bin/env node
// Grok priority support for gate-route and review-gate. Local files only, no network.
//   status   weekly Grok token use vs the budget; ok=false at or above cap_pct, or for a
//            day after Grok reported its usage limit. Budget: GROK_WEEKLY_TOKEN_BUDGET,
//            else the table, else the one learned at the last usage-limit error; with
//            none yet Grok stays on until that first error teaches it.
//   extract  turn a `grok -p --output-format json` envelope into a reviewer output,
//            refusing answers that never read the repository; a usage-limit error is
//            recorded so the next status call learns the budget and pauses Grok.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TABLE_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'references', 'gate-routes.json');
const loadTable = () => JSON.parse(readFileSync(TABLE_PATH, 'utf8'));

export const SESSIONS_DIR = process.env.GROK_SESSIONS_DIR || join(homedir(), '.grok', 'sessions');

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

// Learned budget and last usage-limit error, kept outside any repository.
export function statePath(env = process.env) {
  if (env.GROK_BUDGET_STATE) return env.GROK_BUDGET_STATE;
  const base = env.XDG_STATE_HOME || join(homedir(), '.local', 'state');
  return join(base, 'weed-harness', 'grok-budget.json');
}
export function readState(path = statePath()) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return {}; }
}
function writeState(state, path = statePath()) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
}

// Grok's wording for an exhausted plan, not a transient per-minute rate limit.
const LIMIT = /usage limit|limit (?:reached|exceeded)|weekly limit|plan limit|quota|out of credits|insufficient credits|exceeded your/i;
export const isLimitError = text => LIMIT.test(String(text ?? ''));

// The tokens counted when the plan ran out are the best estimate of the allowance.
export function recordLimit({ tokens, now = Date.now(), path = statePath() }) {
  const state = readState(path);
  state.limit_hit_at = new Date(now).toISOString();
  if (tokens > 0) state.learned_budget = tokens;
  writeState(state, path);
  return state;
}

export function budgetStatus({ table = loadTable(), env = process.env, usage, state, now = Date.now() } = {}) {
  const p = table.grok_priority;
  if (!p) return { ok: false, reason: 'no grok_priority in the rule table' };
  const st = state ?? readState(statePath(env));
  const { tokens, sessions } = usage ?? weeklyTokens({ days: p.window_days ?? 7, now });
  const pauseMs = (p.pause_hours_after_limit ?? 24) * 3600000;
  const hit = Date.parse(st.limit_hit_at ?? '');
  if (hit && now - hit < pauseMs) {
    return { ok: false, tokens, sessions, reason: `grok usage limit hit ${st.limit_hit_at}; paused until ${new Date(hit + pauseMs).toISOString()}` };
  }
  const [budget, source] = env.GROK_WEEKLY_TOKEN_BUDGET ? [Number(env.GROK_WEEKLY_TOKEN_BUDGET), 'env']
    : p.weekly_token_budget ? [Number(p.weekly_token_budget), 'table']
    : st.learned_budget ? [Number(st.learned_budget), 'learned'] : [0, null];
  if (!budget) return { ok: true, tokens, sessions, reason: `grok on: weekly budget not learned yet (${tokens} tokens this week); the first usage-limit error sets it` };
  const pct = Math.round((tokens / budget) * 1000) / 10;
  const ok = pct < p.cap_pct;
  return { ok, pct, tokens, budget, budget_source: source, sessions, cap_pct: p.cap_pct,
    reason: `grok weekly use ${pct}% ${ok ? '<' : '>='} ${p.cap_pct}% of ${budget} tokens (${source})` };
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
       grok.mjs extract <envelope.json> <out.json> --model <model> [--effort <effort>] [--stderr <file>]`;

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
      const raw = existsSync(inp) ? readFileSync(inp, 'utf8') : '';
      const err = opt('--stderr') && existsSync(opt('--stderr')) ? readFileSync(opt('--stderr'), 'utf8') : '';
      let envelope = null;
      try { envelope = JSON.parse(raw); } catch { /* not JSON: Grok failed before answering */ }
      const failed = !envelope || envelope.is_error || envelope.stopReason === 'error';
      if (failed && isLimitError(`${envelope?.text ?? ''}\n${raw}\n${err}`)) {
        const t = loadTable().grok_priority;
        const st = recordLimit({ tokens: weeklyTokens({ days: t?.window_days ?? 7 }).tokens });
        throw new Error(`grok usage limit: recorded at ${st.limit_hit_at}${st.learned_budget ? `, learned budget ${st.learned_budget} tokens` : ''}; route again without grok`);
      }
      if (!envelope) throw new Error(`grok gave no JSON envelope: ${(err || raw).trim().slice(0, 200)}`);
      const result = extract(envelope, reviewer);
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
