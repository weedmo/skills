#!/usr/bin/env node
// Rule-table model choice for review-gate, qa-gate and read-only lookups. Deterministic, no network:
// the same input always yields the same route, and every route carries its reasons.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { budgetStatus } from './grok.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const TABLE_PATH = join(here, '..', 'references', 'gate-routes.json');
export const ROLES = ['qa-author', 'qa-rerun', 'qa-triage', 'review', 'lookup'];
const HOSTS = ['claude', 'codex'];
const WRITERS = ['claude', 'codex', 'grok', 'mixed', 'unknown'];

export function loadTable(path = TABLE_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

// A glob matches the file path or any of its directory prefixes, so
// `**/*oauth*` covers both `src/oauth.ts` and `src/oauth/handler.ts`.
export function matchingFiles(files, globs) {
  const res = globs.map(globToRegExp);
  return files.filter(f => {
    const parts = f.split('/');
    for (let n = parts.length; n > 0; n--) {
      const p = parts.slice(0, n).join('/');
      if (res.some(r => r.test(p))) return true;
    }
    return false;
  });
}

const other = family => (family === 'claude' ? 'codex' : 'claude');
// One cross-family reviewer per writer (purpose-loops D2/D7): Codex reviews Claude and
// Grok code, Claude reviews Codex code. Grok never reviews.
const REVIEWER = { claude: 'codex', codex: 'claude', grok: 'codex' };

// Grok goes first for table.grok_priority.roles (lookup, qa-triage) while input.grok.ok
// (weekly use under the cap, computed by grok.mjs). Otherwise Grok is invisible.
function grokFirst(input, table, available) {
  const p = table.grok_priority;
  if (!p || !p.roles.includes(input.role)) return { use: false };
  const g = input.grok ?? { ok: false, reason: 'grok status not given' };
  if (input.writer === 'grok' && input.role !== 'lookup') return { use: false, reason: 'grok skipped: grok wrote the code' };
  if (!available.includes('grok')) return { use: false, reason: 'grok skipped: CLI unavailable' };
  if (!g.ok) return { use: false, reason: `grok skipped: ${g.reason}` };
  return { use: true, reason: `grok first: ${g.reason}` };
}

function pick(table, family, tier) {
  const row = table.families[family]?.[tier];
  if (!row) throw new Error(`no ${tier} route for ${family}`);
  return { family, tier, model: row.model, effort: row.effort ?? null, agent: row.agent ?? null };
}

// input: {role, writer, host, deep, files, triageConflict, available, grok: {ok, reason}}
export function route(input, table = loadTable()) {
  const { role, writer = 'unknown', deep = false, files = [], triageConflict = false } = input;
  const available = input.available ?? Object.keys(table.families);
  if (!ROLES.includes(role)) throw new Error(`role must be one of ${ROLES.join(', ')}`);
  if (!WRITERS.includes(writer)) throw new Error(`writer must be one of ${WRITERS.join(', ')}`);
  const reasons = [];
  const grok = grokFirst({ ...input, role, writer }, table, available);
  if (grok.reason) reasons.push(grok.reason);
  const rest = available.filter(f => f !== 'grok');

  if (role === 'lookup') {
    const host = input.host ?? 'claude';
    if (!HOSTS.includes(host)) throw new Error(`host must be one of ${HOSTS.join(', ')}`);
    if (grok.use) return { role, reviewers: [pick(table, 'grok', 'lookup')], cross_model: null, escalated: false, reasons };
    reasons.push(`lookup on the ${host} host route`);
    return { role, reviewers: [pick(table, host, 'lookup')], cross_model: null, escalated: false, reasons };
  }

  if (role === 'qa-rerun') {
    return { role, reviewers: [], cross_model: null, escalated: false, reasons: ['scripted scenarios re-run without a model'] };
  }

  if (grok.use && role === 'qa-triage') {
    return { role, reviewers: [pick(table, 'grok', 'qa_triage')], cross_model: writer === 'claude' || writer === 'codex' ? true : null, escalated: false, reasons };
  }
  if (role === 'qa-author' || role === 'qa-triage') {
    if (!rest.length) throw new Error(`no ${role} route: grok has no ${role} tier and no other CLI is available`);
    const tier = role === 'qa-author' ? 'qa_author' : 'qa_triage';
    const want = writer === 'claude' || writer === 'codex' ? other(writer) : 'claude';
    const family = rest.includes(want) ? want : rest[0];
    reasons.push(family === want ? `${family}: independent of the writer` : `${want} unavailable, using ${family}`);
    return { role, reviewers: [pick(table, family, tier)], cross_model: writer === 'claude' || writer === 'codex' ? family !== writer : null, escalated: false, reasons };
  }

  const security = matchingFiles(files, table.security_globs || []);
  const triggers = [];
  if (deep) triggers.push('[deep] ticket in range');
  if (security.length) triggers.push(`security path: ${security.slice(0, 3).join(', ')}${security.length > 3 ? ', …' : ''}`);
  if (triageConflict) triggers.push('writer rejected a blocker/major finding');
  const escalated = triggers.length > 0;
  reasons.push(...triggers);

  // Exactly one reviewer from the family that did not write the code, one tier up on a
  // risk trigger. Mixed or unknown authorship gets one reviewer per family. A missing
  // reviewer CLI falls back to the other installed family, then to a same-family
  // fresh-context reviewer, and says so.
  if (!rest.length) throw new Error('no reviewer CLI available');
  const tier = escalated ? 'review_up' : 'review';
  if (writer === 'mixed' || writer === 'unknown') {
    const fams = ['codex', 'claude'].filter(f => rest.includes(f));
    if (fams.length === 2) {
      reasons.push(`writer ${writer}: one reviewer per family`);
      return { role, reviewers: fams.map(f => pick(table, f, tier)), cross_model: true, escalated, reasons };
    }
    reasons.push(`writer ${writer}: only ${fams[0]} installed, same-family fresh-context reviewer`);
    return { role, reviewers: [pick(table, fams[0], tier)], cross_model: false, escalated, reasons };
  }
  const want = REVIEWER[writer];
  if (rest.includes(want)) {
    reasons.push(`writer ${writer}: ${want} reviews (one cross-family reviewer)`);
    return { role, reviewers: [pick(table, want, tier)], cross_model: true, escalated, reasons };
  }
  const alt = rest.find(f => f !== writer);
  if (alt) {
    reasons.push(`${want} unavailable, ${alt} reviews`);
    return { role, reviewers: [pick(table, alt, tier)], cross_model: true, escalated, reasons };
  }
  reasons.push(`${want} unavailable: same-family fresh-context reviewer (${rest[0]})`);
  return { role, reviewers: [pick(table, rest[0], tier)], cross_model: false, escalated, reasons };
}

export function triageConflict(triagePath) {
  if (!triagePath || !existsSync(triagePath)) return false;
  const t = JSON.parse(readFileSync(triagePath, 'utf8'));
  return (t.decisions || []).some(d => d.decision === 'reject' && ['blocker', 'major'].includes(d.severity));
}

export function detectAvailable(table = loadTable()) {
  return Object.entries(table.families)
    .filter(([, f]) => spawnSync('sh', ['-c', `command -v ${f.cli}`], { stdio: 'ignore' }).status === 0)
    .map(([name]) => name);
}

function parseArgs(argv) {
  const a = { deep: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--role') a.role = v();
    else if (k === '--writer') a.writer = v();
    else if (k === '--host') a.host = v();
    else if (k === '--deep') a.deep = true;
    else if (k === '--base') a.base = v();
    else if (k === '--files') a.files = v().split(',').filter(Boolean);
    else if (k === '--triage') a.triage = v();
    else if (k === '--available') a.available = v().split(',').filter(Boolean);
    else if (k === '--no-grok') a.noGrok = true;
    else if (k === '--help' || k === '-h') a.help = true;
    else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

const USAGE = `usage: gate-route.mjs --role qa-author|qa-rerun|qa-triage|review --writer claude|codex|grok|mixed|unknown
         [--deep] [--base <ref> | --files a,b] [--triage <triage-n.json>] [--available claude,codex,grok] [--no-grok]
       gate-route.mjs --role lookup [--host claude|codex] [--available …] [--no-grok]
Prints the route as JSON. Never calls the network; Grok's weekly use comes from local
session files (grok.mjs status). --no-grok skips Grok for lookup and qa-triage.`;

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const a = parseArgs(process.argv.slice(2));
    if (a.help) { console.log(USAGE); process.exit(0); }
    const table = loadTable();
    let files = a.files ?? [];
    if (a.base) {
      const r = spawnSync('git', ['diff', '--name-only', `${a.base}...HEAD`], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`git diff failed: ${r.stderr.trim()}`);
      files = r.stdout.split('\n').filter(Boolean);
    }
    const out = route({ role: a.role, writer: a.writer, host: a.host, deep: a.deep, files,
      triageConflict: triageConflict(a.triage), available: a.available ?? detectAvailable(table),
      grok: a.noGrok ? { ok: false, reason: '--no-grok' } : budgetStatus({ table }) }, table);
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error(`gate-route: ${e.message}\n${USAGE}`);
    process.exit(2);
  }
}
