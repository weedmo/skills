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
  assert.deepEqual(models(r), ['codex:gpt-6.2-sol/medium']);
  assert.equal(r.cross_model, true);
  assert.equal(r.escalated, false);
});

test('codex-written code gets a sonnet reviewer', () => {
  const r = route({ role: 'review', writer: 'codex', files: ['README.md'], available: both }, table);
  assert.deepEqual(models(r), ['claude:sonnet']);
});

test('each risk trigger moves the one reviewer up a tier without adding a second', () => {
  for (const extra of [{ deep: true }, { files: ['src/auth/session.ts'] }, { triageConflict: true }]) {
    const r = route({ role: 'review', writer: 'claude', files: ['src/app.ts'], available: both, ...extra }, table);
    assert.deepEqual(models(r), ['codex:gpt-6.2-sol/high'], JSON.stringify(extra));
    assert.equal(r.escalated, true);
    assert.ok(r.reasons.length >= 2);
  }
});

test('mixed or unknown writers get one reviewer per family', () => {
  for (const writer of ['mixed', 'unknown']) {
    const r = route({ role: 'review', writer, available: both }, table);
    assert.deepEqual(models(r), ['codex:gpt-6.2-sol/medium', 'claude:sonnet']);
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
  assert.deepEqual(models(route({ role: 'qa-author', writer: 'claude', available: both }, table)), ['codex:gpt-6.2-sol/low']);
  assert.deepEqual(models(route({ role: 'qa-triage', writer: 'codex', available: both }, table)), ['claude:haiku']);
  assert.deepEqual(route({ role: 'qa-rerun', writer: 'claude', available: both }, table).reviewers, []);
});

test('no reviewer or QA route uses a top-tier model or a weak reviewer', () => {
  for (const f of Object.values(table.families)) {
    // Grok has no review tier: it never reviews.
    for (const tier of ['review', 'review_up']) if (f[tier]) assert.ok(!/haiku|luna|astra|fable/.test(f[tier].model), f[tier].model);
    // A family may omit a QA tier it is never routed to (grok has no qa_author).
    for (const tier of ['qa_author', 'qa_triage']) if (f[tier]) assert.ok(!/astra|fable|opus/.test(f[tier].model), f[tier].model);
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

const all = ['claude', 'codex', 'grok'];
const under = { ok: true, reason: 'grok weekly use 40% < 90% of 1000 tokens' };
const over = { ok: false, reason: 'grok weekly use 91% >= 90% of 1000 tokens' };
const review = (writer, available, extra = {}) => route({ role: 'review', writer, files: ['src/app.ts'], available, grok: under, ...extra }, table);

test('three CLIs: exactly one cross-family reviewer, grok never reviews', () => {
  assert.deepEqual(models(review('claude', all)), ['codex:gpt-6.2-sol/medium']);
  assert.deepEqual(models(review('codex', all)), ['claude:sonnet']);
  assert.deepEqual(models(review('grok', all)), ['codex:gpt-6.2-sol/medium']);
  for (const w of ['mixed', 'unknown']) assert.deepEqual(models(review(w, all)), ['codex:gpt-6.2-sol/medium', 'claude:sonnet'], w);
  for (const w of ['claude', 'codex', 'grok', 'mixed']) assert.equal(review(w, all).cross_model, true, w);
  for (const w of ['claude', 'codex']) assert.ok(!review(w, all).reasons.some(x => /grok/.test(x)), w);
});

test('a risk trigger with three CLIs still yields one reviewer, one tier up', () => {
  const r = review('claude', all, { files: ['src/auth/x.ts'] });
  assert.deepEqual(models(r), ['codex:gpt-6.2-sol/high']);
  assert.equal(r.escalated, true);
});

test('missing preferred reviewer: the other installed family, then same-family', () => {
  assert.deepEqual(models(review('claude', ['claude', 'grok'])), ['claude:sonnet']);
  assert.equal(review('claude', ['claude', 'grok']).cross_model, false);
  assert.deepEqual(models(review('grok', ['claude', 'grok'])), ['claude:sonnet']);
  assert.equal(review('grok', ['claude', 'grok']).cross_model, true);
  for (const [w, only, expect] of [['claude', 'claude', 'claude:sonnet'], ['codex', 'codex', 'codex:gpt-6.2-sol/medium'], ['mixed', 'codex', 'codex:gpt-6.2-sol/medium']]) {
    const r = review(w, [only]);
    assert.deepEqual(models(r), [expect], `${w}/${only}`);
    assert.equal(r.cross_model, false);
  }
  assert.throws(() => review('claude', ['grok']), /no reviewer CLI/);
});

test('lookup goes to grok under the cap, else the host route', () => {
  const look = (extra) => route({ role: 'lookup', available: all, grok: under, ...extra }, table);
  assert.deepEqual(models(look({})), ['grok:grok-4.7-build-fast']);
  assert.deepEqual(models(look({ grok: over })), ['claude:haiku']);
  assert.equal(look({ grok: over }).reviewers[0].agent, 'Explore');
  assert.deepEqual(models(look({ grok: over, host: 'codex' })), ['codex:gpt-6-luna/low']);
  assert.deepEqual(models(look({ available: both })), ['claude:haiku']);
  assert.match(look({ available: both }).reasons[0], /CLI unavailable/);
  assert.throws(() => look({ host: 'grok' }), /host must be/);
  assert.deepEqual(models(look({ writer: 'grok' })), ['grok:grok-4.7-build-fast']);
  const paused = look({ grok: { ok: false, reason: 'grok usage limit hit 2026-11-20T00:00:00Z; paused until 2026-11-21T00:00:00Z' } });
  assert.deepEqual(models(paused), ['claude:haiku']);
  assert.match(paused.reasons[0], /^grok skipped: grok usage limit hit/);
});

test('lookup CLI accepts --host', () => {
  const ok = spawnSync(process.execPath, [script, '--role', 'lookup', '--host', 'codex', '--available', 'claude,codex', '--no-grok'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).reviewers[0].family, 'codex');
});

test('qa-triage goes to grok fast under the cap; qa-author never does', () => {
  const t = route({ role: 'qa-triage', writer: 'claude', available: all, grok: under }, table);
  assert.deepEqual(models(t), ['grok:grok-4.7-build-fast']);
  const t2 = route({ role: 'qa-triage', writer: 'claude', available: all, grok: over }, table);
  assert.deepEqual(models(t2), models(route({ role: 'qa-triage', writer: 'claude', available: both }, table)));
  const a = route({ role: 'qa-author', writer: 'claude', available: all, grok: under }, table);
  assert.deepEqual(models(a), models(route({ role: 'qa-author', writer: 'claude', available: both }, table)));
  for (const only of ['claude', 'codex']) {
    assert.equal(route({ role: 'qa-author', writer: 'claude', available: [only] }, table).reviewers.length, 1, only);
  }
});
