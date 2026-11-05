import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { route, matchingFiles, loadTable, triageConflict } from '../scripts/gate-route.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'gate-route.mjs');
const table = loadTable();
const both = ['claude', 'codex'];
const models = r => r.reviewers.map(x => `${x.family}:${x.model}${x.effort ? '/' + x.effort : ''}`);

test('claude-written code gets a single low-tier codex reviewer', () => {
  const r = route({ role: 'review', writer: 'claude', files: ['src/app.ts'], available: both }, table);
  assert.deepEqual(models(r), ['codex:gpt-6.1-sol/medium']);
  assert.equal(r.cross_model, true);
  assert.equal(r.escalated, false);
});

test('codex-written code gets a sonnet reviewer', () => {
  const r = route({ role: 'review', writer: 'codex', files: ['README.md'], available: both }, table);
  assert.deepEqual(models(r), ['claude:sonnet']);
});

test('each risk trigger escalates once and adds a same-family second opinion', () => {
  for (const extra of [{ deep: true }, { files: ['src/auth/session.ts'] }, { triageConflict: true }]) {
    const r = route({ role: 'review', writer: 'claude', files: ['src/app.ts'], available: both, ...extra }, table);
    assert.deepEqual(models(r), ['codex:gpt-6.1-sol/high', 'claude:sonnet'], JSON.stringify(extra));
    assert.equal(r.escalated, true);
    assert.ok(r.reasons.length >= 2);
  }
});

test('mixed or unknown writers get one reviewer per family', () => {
  for (const writer of ['mixed', 'unknown']) {
    const r = route({ role: 'review', writer, available: both }, table);
    assert.deepEqual(models(r), ['codex:gpt-6.1-sol/medium', 'claude:sonnet']);
  }
});

test('missing opposite CLI falls back to the same family and records it', () => {
  const r = route({ role: 'review', writer: 'claude', available: ['claude'] }, table);
  assert.deepEqual(models(r), ['claude:sonnet']);
  assert.equal(r.cross_model, false);
  assert.match(r.reasons.join(' '), /unavailable/);
});

test('QA roles split author, rerun and triage tiers', () => {
  assert.deepEqual(models(route({ role: 'qa-author', writer: 'codex', available: both }, table)), ['claude:sonnet']);
  assert.deepEqual(models(route({ role: 'qa-author', writer: 'claude', available: both }, table)), ['codex:gpt-6.1-sol/low']);
  assert.deepEqual(models(route({ role: 'qa-triage', writer: 'codex', available: both }, table)), ['claude:haiku']);
  assert.deepEqual(route({ role: 'qa-rerun', writer: 'claude', available: both }, table).reviewers, []);
});

test('no reviewer or QA route uses a top-tier model or a weak reviewer', () => {
  for (const f of Object.values(table.families)) {
    for (const tier of ['review', 'review_up']) assert.ok(!/haiku|luna|astra|fable/.test(f[tier].model), f[tier].model);
    for (const tier of ['qa_author', 'qa_triage']) assert.ok(!/astra|fable|opus/.test(f[tier].model), f[tier].model);
  }
});

test('security globs match files and directories without catching look-alikes', () => {
  const globs = table.security_globs;
  assert.deepEqual(matchingFiles(['src/oauth/handler.ts', 'db/migrations/001.sql', 'Dockerfile', '.env.local'], globs).length, 4);
  assert.deepEqual(matchingFiles(['docs/author.md', 'src/tokenizer.ts', 'src/app.ts'], globs), []);
});

test('route is deterministic for the same input', () => {
  const input = { role: 'review', writer: 'codex', deep: true, files: ['a.ts'], available: both };
  assert.deepEqual(route(input, table), route(input, table));
});

test('triage conflict reads only rejected blocker/major findings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-route-'));
  try {
    const p = join(dir, 'triage-1.json');
    writeFileSync(p, JSON.stringify({ decisions: [{ id: 'a', severity: 'minor', decision: 'reject', reason: 'style' }] }));
    assert.equal(triageConflict(p), false);
    writeFileSync(p, JSON.stringify({ decisions: [{ id: 'b', severity: 'major', decision: 'reject', reason: 'disagree' }] }));
    assert.equal(triageConflict(p), true);
    assert.equal(triageConflict(join(dir, 'missing.json')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI prints JSON and rejects bad input', () => {
  const ok = spawnSync(process.execPath, [script, '--role', 'review', '--writer', 'claude', '--files', 'src/payment.ts', '--available', 'claude,codex'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).escalated, true);
  const bad = spawnSync(process.execPath, [script, '--role', 'deploy', '--writer', 'claude', '--available', 'claude'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
});
