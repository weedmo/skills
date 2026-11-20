#!/usr/bin/env node
// Rule-table model choice for review-gate and qa-gate. Deterministic, no network:
// the same input always yields the same route, and every route carries its reasons.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { budgetStatus } from './grok.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const TABLE_PATH = join(here, '..', 'references', 'gate-routes.json');
export const ROLES = ['qa-author', 'qa-rerun', 'qa-triage', 'review'];
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

// Grok goes first for table.grok_priority.roles while input.grok.ok (weekly use under
// the cap, computed by grok.mjs). Otherwise Grok is invisible and the routes below are
// exactly the pre-Grok ones.
function grokFirst(input, table, available) {
  const p = table.grok_priority;
  if (!p || !p.roles.includes(input.role)) return { use: false };
  const g = input.grok ?? { ok: false, reason: 'grok status not given' };
  if (input.writer === 'grok') return { use: false, reason: 'grok skipped: grok wrote the code' };
  if (!available.includes('grok')) return { use: false, reason: 'grok skipped: CLI unavailable' };
  if (!g.ok) return { use: false, reason: `grok skipped: ${g.reason}` };
  return { use: true, reason: `grok first: ${g.reason}` };
}

function pick(table, family, tier) {
  const row = table.families[family]?.[tier];
  if (!row) throw new Error(`no ${tier} route for ${family}`);
  return { family, tier, model: row.model, effort: row.effort ?? null, agent: row.agent ?? null };
}

// input: {role, writer, deep, files, triageConflict, available, grok: {ok, reason}}
export function route(input, table = loadTable()) {
  const { role, writer = 'unknown', deep = false, files = [], triageConflict = false } = input;
  const available = input.available ?? Object.keys(table.families);
  if (!ROLES.includes(role)) throw new Error(`role must be one of ${ROLES.join(', ')}`);
  if (!WRITERS.includes(writer)) throw new Error(`writer must be one of ${WRITERS.join(', ')}`);
  const reasons = [];
  const grok = grokFirst({ ...input, role, writer }, table, available);
  if (grok.reason) reasons.push(grok.reason);
  const rest = available.filter(f => f !== 'grok');

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

  // Every available family that did not write the code reviews (Grok listed first when
  // its weekly use allows it), so one CLI gives a same-family fallback, two give a cross
  // pair, three give two cross reviewers. A risk trigger moves them all up one tier and,
  // when only one cross reviewer exists, adds a same-family base reviewer (D3 dual).
  const wrote = writer === 'mixed' || writer === 'unknown' ? ['claude', 'codex'] : [writer];
  const pool = grok.use ? ['grok', ...rest] : rest;
  if (!pool.length) throw new Error('no reviewer CLI available');
  const others = pool.filter(f => !wrote.includes(f));
  const tier = escalated ? 'review_up' : 'review';
  const reviewers = others.map(f => pick(table, f, tier));
  if (others.length) {
    reasons.push(`writer ${writer}: ${others.join(' + ')} review${others.length > 1 ? ' (every available other family)' : ''}`);
    const same = wrote.find(f => rest.includes(f));
    if (escalated && others.length === 1 && same) {
      reviewers.push(pick(table, same, 'review'));
      reasons.push(`risk trigger: dual review adds ${same}`);
    }
    return { role, reviewers, cross_model: true, escalated, reasons };
  }
  // Only the writer's own families are installed.
  if (wrote.length > 1 && wrote.every(f => rest.includes(f))) {
    reasons.push(`writer ${writer}: dual review, one reviewer per family`);
    for (const f of ['codex', 'claude']) reviewers.push(pick(table, f, tier));
    return { role, reviewers, cross_model: true, escalated, reasons };
  }
  const fallback = rest.includes(wrote[0]) ? wrote[0] : rest[0];
  reviewers.push(pick(table, fallback, tier));
  reasons.push(`no other family installed: same-family fresh-context reviewer (${fallback})`);
  return { role, reviewers, cross_model: false, escalated, reasons };
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

const USAGE = `usage: gate-route.mjs --role qa-author|qa-rerun|qa-triage|review --writer claude|codex|mixed|unknown
         [--deep] [--base <ref> | --files a,b] [--triage <triage-n.json>] [--available claude,codex,grok] [--no-grok]
Prints the route as JSON. Never calls the network; Grok's weekly use comes from local
session files (grok.mjs status). --no-grok keeps the pre-Grok routes.`;

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
    const out = route({ role: a.role, writer: a.writer, deep: a.deep, files,
      triageConflict: triageConflict(a.triage), available: a.available ?? detectAvailable(table),
      grok: a.noGrok ? { ok: false, reason: '--no-grok' } : budgetStatus({ table }) }, table);
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error(`gate-route: ${e.message}\n${USAGE}`);
    process.exit(2);
  }
}
