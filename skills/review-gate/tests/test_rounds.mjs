import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mergeRound, decide, findingId } from '../scripts/rounds.mjs';

const scripts = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
const codex = { family: 'codex', model: 'gpt-6.1-sol', effort: 'medium' };
const claude = { family: 'claude', model: 'sonnet', effort: null };
const f = (id, severity = 'major', extra = {}) => ({ id, file: 'src/a.ts', line: 3, axis: 'correctness', severity, claim: `issue ${id}`, evidence: 'x', ...extra });

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'review-gate-'));
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  writeFileSync(join(dir, 'a.txt'), '1'); git('add', '.'); git('commit', '-qm', 'one');
  mkdirSync(join(dir, '.review', 'u'), { recursive: true });
  return { dir, git, rd: join(dir, '.review', 'u') };
}
const put = (rd, name, data) => writeFileSync(join(rd, name), JSON.stringify(data));
const run = (cwd, script, ...args) => spawnSync(process.execPath, [join(scripts, script), ...args], { cwd, encoding: 'utf8' });

test('merge assigns stable ids and records agreement across families', () => {
  const r = mergeRound(1, [
    { reviewer: codex, findings: [f('a', 'minor'), f('', 'major', { claim: 'Null  deref' })] },
    { reviewer: claude, findings: [f('a', 'blocker')] },
  ]);
  const a = r.findings.find(x => x.id === 'a');
  assert.deepEqual(a.agreed_by, ['codex', 'claude']);
  assert.equal(a.severity, 'blocker');
  assert.equal(r.findings[1].id, findingId({ file: 'src/a.ts', axis: 'correctness', claim: 'null deref' }));
  assert.throws(() => mergeRound(1, [{ reviewer: codex, findings: [{ file: 'x' }] }]), /invalid finding/);
});

test('PASS when the latest round has only minor findings', () => {
  const { dir, rd } = repo();
  try {
    put(rd, 'round-1.json', mergeRound(1, [{ reviewer: codex, findings: [f('a', 'minor')] }]));
    const v = decide({ dir: rd, writer: 'claude', sha: 'abc' });
    assert.equal(v.status, 'PASS');
    assert.equal(v.cross_model, true);
    assert.equal(v.minor.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CONTINUE inside the cycle bound, STOP after it', () => {
  const { dir, rd } = repo();
  try {
    put(rd, 'round-1.json', mergeRound(1, [{ reviewer: codex, findings: [f('a')] }]));
    assert.equal(decide({ dir: rd, writer: 'claude', sha: 's' }).status, 'CONTINUE');
    put(rd, 'triage-1.json', { round: 1, decisions: [{ id: 'a', severity: 'major', decision: 'fix', reason: '' }] });
    put(rd, 'round-2.json', mergeRound(2, [{ reviewer: codex, findings: [f('b')] }]));
    assert.equal(decide({ dir: rd, writer: 'claude', sha: 's' }).status, 'CONTINUE');
    put(rd, 'triage-2.json', { round: 2, decisions: [{ id: 'b', severity: 'major', decision: 'fix', reason: '' }] });
    put(rd, 'round-3.json', mergeRound(3, [{ reviewer: codex, findings: [f('c')] }]));
    const v = decide({ dir: rd, writer: 'claude', sha: 's' });
    assert.equal(v.status, 'STOP');
    assert.match(v.reasons[0], /after 2 fix cycles/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a finding that keeps returning after fixes stops the loop as oscillation', () => {
  const { dir, rd } = repo();
  try {
    put(rd, 'round-1.json', mergeRound(1, [{ reviewer: codex, findings: [f('a')] }]));
    put(rd, 'triage-1.json', { round: 1, decisions: [{ id: 'a', severity: 'major', decision: 'fix', reason: '' }] });
    put(rd, 'round-2.json', mergeRound(2, [{ reviewer: codex, findings: [f('a')] }]));
    put(rd, 'triage-2.json', { round: 2, decisions: [{ id: 'a', severity: 'major', decision: 'fix', reason: '' }] });
    put(rd, 'round-3.json', mergeRound(3, [{ reviewer: codex, findings: [f('a')] }]));
    const v = decide({ dir: rd, writer: 'claude', maxCycles: 5, sha: 's' });
    assert.equal(v.status, 'STOP');
    assert.match(v.reasons[0], /oscillating/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an agreed blocker cannot be rejected and a reject needs a reason', () => {
  const { dir, rd } = repo();
  try {
    put(rd, 'round-1.json', mergeRound(1, [{ reviewer: codex, findings: [f('a', 'blocker')] }, { reviewer: claude, findings: [f('a', 'blocker')] }]));
    put(rd, 'triage-1.json', { round: 1, decisions: [{ id: 'a', severity: 'blocker', decision: 'reject', reason: 'disagree' }] });
    assert.throws(() => decide({ dir: rd, writer: 'mixed', sha: 's' }), /cannot be rejected/);
    put(rd, 'round-1.json', mergeRound(1, [{ reviewer: codex, findings: [f('a')] }]));
    put(rd, 'triage-1.json', { round: 1, decisions: [{ id: 'a', severity: 'major', decision: 'reject', reason: ' ' }] });
    assert.throws(() => decide({ dir: rd, writer: 'claude', sha: 's' }), /needs a reason/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('same-family review is recorded as not cross-model', () => {
  const { dir, rd } = repo();
  try {
    put(rd, 'round-1.json', mergeRound(1, [{ reviewer: claude, findings: [] }]));
    assert.equal(decide({ dir: rd, writer: 'claude', sha: 's' }).cross_model, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI: merge is append-only; verdict passes only for the reviewed HEAD', () => {
  const { dir, git, rd } = repo();
  try {
    const out = join(dir, 'codex.json');
    writeFileSync(out, JSON.stringify({ reviewer: codex, findings: [f('a', 'minor')] }));
    assert.equal(run(dir, 'rounds.mjs', 'merge', rd, '1', out).status, 0);
    assert.equal(run(dir, 'rounds.mjs', 'merge', rd, '1', out).status, 2);
    const d = run(dir, 'rounds.mjs', 'decide', rd, '--writer', 'claude');
    assert.match(d.stdout, /review-gate: PASS/);
    assert.ok(existsSync(join(rd, 'verdict.json')));
    const ok = run(dir, 'verdict.mjs', rd);
    assert.equal(ok.status, 0, ok.stdout);
    assert.match(ok.stdout, /review-gate: PASS/);
    writeFileSync(join(dir, 'a.txt'), '2'); git('commit', '-qam', 'two');
    const stale = run(dir, 'verdict.mjs', rd);
    assert.equal(stale.status, 1);
    assert.doesNotMatch(stale.stdout, /review-gate: PASS/);
    assert.match(stale.stdout, /stale/);
    const v = JSON.parse(readFileSync(join(rd, 'verdict.json'), 'utf8'));
    v.status = 'STOP'; writeFileSync(join(rd, 'verdict.json'), JSON.stringify(v));
    assert.equal(run(dir, 'verdict.mjs', rd).status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
