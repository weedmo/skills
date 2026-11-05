#!/usr/bin/env node
// review-gate state: merge reviewer outputs into one round, then decide the unit's
// status from every round and triage on disk. Files are the only handoff.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const AXES = ['standards', 'spec', 'correctness', 'security'];
const SEVERITIES = ['blocker', 'major', 'minor'];
export const BLOCKING = new Set(['blocker', 'major']);
const rank = s => SEVERITIES.indexOf(s);

export function findingId(f) {
  const claim = String(f.claim).toLowerCase().replace(/\s+/g, ' ').trim();
  return 'f-' + createHash('sha1').update(`${f.file}|${f.axis}|${claim}`).digest('hex').slice(0, 10);
}

export function validateFinding(f) {
  if (!f || typeof f.file !== 'string' || !AXES.includes(f.axis) || !SEVERITIES.includes(f.severity)
      || typeof f.claim !== 'string' || !f.claim.trim() || typeof f.evidence !== 'string') {
    throw new Error(`invalid finding: ${JSON.stringify(f).slice(0, 120)}`);
  }
}

// outputs: [{reviewer: {family, model, effort}, findings: [...]}] -> one round.
// Same id from two reviewers merges into one finding with both in agreed_by.
export function mergeRound(round, outputs) {
  const byId = new Map();
  for (const { reviewer, findings } of outputs) {
    for (const f of findings) {
      validateFinding(f);
      const id = f.id && f.id.trim() ? f.id.trim() : findingId(f);
      const prev = byId.get(id);
      if (prev) {
        if (!prev.agreed_by.includes(reviewer.family)) prev.agreed_by.push(reviewer.family);
        if (rank(f.severity) < rank(prev.severity)) prev.severity = f.severity;
      } else {
        byId.set(id, { ...f, id, agreed_by: [reviewer.family] });
      }
    }
  }
  return { round, reviewers: outputs.map(o => o.reviewer), findings: [...byId.values()] };
}

const numbered = (dir, prefix) => readdirSync(dir)
  .map(n => n.match(new RegExp(`^${prefix}-(\\d+)\\.json$`)))
  .filter(Boolean).map(m => Number(m[1])).sort((a, b) => a - b);
const load = p => JSON.parse(readFileSync(p, 'utf8'));

export function headSha(cwd) {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('not a git checkout');
  return r.stdout.trim();
}

// Status rules (spec D4, D5): PASS when the latest round has no open blocker/major;
// STOP when cycles are exhausted or a finding keeps returning after fixes; else CONTINUE.
export function decide({ dir, writer, maxCycles = 2, sha }) {
  const rounds = numbered(dir, 'round').map(n => load(join(dir, `round-${n}.json`)));
  if (!rounds.length) throw new Error(`no round-*.json in ${dir}`);
  const triages = new Map(numbered(dir, 'triage').map(n => [n, load(join(dir, `triage-${n}.json`))]));
  const latest = rounds[rounds.length - 1];
  const reasons = [];

  for (const [n, t] of triages) {
    const round = rounds.find(r => r.round === n);
    for (const d of t.decisions || []) {
      const f = round?.findings.find(x => x.id === d.id);
      if (d.decision === 'reject' && f && BLOCKING.has(f.severity) && f.agreed_by.length > 1) {
        throw new Error(`round ${n}: ${d.id} was flagged by ${f.agreed_by.join('+')} and cannot be rejected`);
      }
      if (d.decision === 'reject' && !String(d.reason || '').trim()) throw new Error(`round ${n}: reject of ${d.id} needs a reason`);
    }
  }

  // Oscillation: a finding marked fixed that comes back in two later rounds.
  const returns = new Map();
  for (const [n, t] of triages) {
    for (const d of (t.decisions || []).filter(x => x.decision === 'fix')) {
      for (const r of rounds.filter(r => r.round > n)) {
        if (r.findings.some(f => f.id === d.id)) returns.set(d.id, (returns.get(d.id) || 0) + 1);
      }
    }
  }
  const oscillating = [...returns].filter(([, c]) => c >= 2).map(([id]) => id);

  const open = latest.findings.filter(f => BLOCKING.has(f.severity));
  const minor = latest.findings.filter(f => !BLOCKING.has(f.severity));
  let status;
  if (!open.length) status = 'PASS';
  else if (oscillating.length) { status = 'STOP'; reasons.push(`oscillating after fixes: ${oscillating.join(', ')}`); }
  else if (rounds.length > maxCycles) { status = 'STOP'; reasons.push(`${open.length} blocker/major open after ${maxCycles} fix cycles`); }
  else { status = 'CONTINUE'; reasons.push(`${open.length} blocker/major open; next is fix cycle ${rounds.length} of ${maxCycles}`); }

  const families = [...new Set(rounds.flatMap(r => r.reviewers.map(x => x.family)))];
  const cross = writer === 'claude' || writer === 'codex' ? families.some(f => f !== writer) : families.length > 1;
  return { status, reviewed_sha: sha, rounds: rounds.length, max_cycles: maxCycles, writer,
    cross_model: cross, reviewers: latest.reviewers, open, minor, reasons,
    counts: Object.fromEntries(SEVERITIES.map(s => [s, latest.findings.filter(f => f.severity === s).length])),
    agreed: latest.findings.filter(f => f.agreed_by.length > 1).length };
}

const USAGE = `usage:
  rounds.mjs merge <dir> <n> <reviewer-output.json>...   write <dir>/round-<n>.json
      each output: {"reviewer": {"family","model","effort"}, "findings": [...]}
  rounds.mjs decide <dir> --writer claude|codex|mixed|unknown [--max-cycles 2]
      write <dir>/verdict.json for HEAD and print the status line`;

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, dir, ...rest] = process.argv.slice(2);
  try {
    if (cmd === 'merge') {
      const [n, ...files] = rest;
      if (!dir || !Number.isInteger(Number(n)) || !files.length) throw new Error('merge needs <dir> <n> <output.json>...');
      const out = join(dir, `round-${n}.json`);
      if (existsSync(out)) throw new Error(`${out} exists; rounds are append-only`);
      const round = mergeRound(Number(n), files.map(load));
      writeFileSync(out, JSON.stringify(round, null, 2) + '\n');
      console.log(`round ${n}: ${round.findings.length} findings (${round.findings.filter(f => BLOCKING.has(f.severity)).length} blocker/major)`);
    } else if (cmd === 'decide') {
      const opt = k => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
      const writer = opt('--writer');
      if (!dir || !writer) throw new Error('decide needs <dir> --writer');
      const v = decide({ dir, writer, maxCycles: Number(opt('--max-cycles') ?? 2), sha: headSha(process.cwd()) });
      writeFileSync(join(dir, 'verdict.json'), JSON.stringify(v, null, 2) + '\n');
      console.log(`review-gate: ${v.status}${v.reasons.length ? ' — ' + v.reasons.join('; ') : ''}`);
    } else {
      console.log(USAGE);
      process.exit(cmd === '--help' || cmd === '-h' ? 0 : 2);
    }
  } catch (e) {
    console.error(`rounds: ${e.message}`);
    process.exit(2);
  }
}
