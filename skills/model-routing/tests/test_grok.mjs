import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { weeklyTokens, budgetStatus, extract, recordLimit, readState, isLimitError } from '../scripts/grok.mjs';

const table = { grok_priority: { roles: ['lookup'], cap_pct: 90, weekly_token_budget: null, window_days: 7, pause_hours_after_limit: 24 } };
const now = Date.parse('2026-11-20T00:00:00Z');

function sessions(rows, at = now) {
  const dir = mkdtempSync(join(tmpdir(), 'grok-sessions-'));
  rows.forEach(([daysAgo, tokens], i) => {
    const d = join(dir, '%2Frepo', `s${i}`);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'usage.json'), JSON.stringify({ updatedAt: new Date(at - daysAgo * 86400000).toISOString(), session: { totalTokens: tokens } }));
  });
  return dir;
}

test('weekly tokens count only sessions updated inside the window', () => {
  const dir = sessions([[1, 100], [6.9, 200], [8, 5000]]);
  try {
    assert.deepEqual(weeklyTokens({ dir, now, days: 7 }), { tokens: 300, sessions: 2 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('budget status: under 90% ok, at 90% not ok; env beats table', () => {
  const at = t => budgetStatus({ table, env: { GROK_WEEKLY_TOKEN_BUDGET: '1000' }, usage: { tokens: t, sessions: 1 }, state: {} });
  assert.equal(at(899).ok, true);
  assert.equal(budgetStatus({ table, env: { GROK_WEEKLY_TOKEN_BUDGET: '10000' }, usage: { tokens: 8999, sessions: 1 } }).ok, true);
  assert.equal(at(900).ok, false);
  assert.match(at(900).reason, /90% >= 90% of 1000 tokens \(env\)/);
  const fromTable = budgetStatus({ table: { grok_priority: { ...table.grok_priority, weekly_token_budget: 1000 } }, env: {}, usage: { tokens: 10, sessions: 1 }, state: {} });
  assert.equal(fromTable.ok, true);
  assert.equal(fromTable.budget_source, 'table');
});

test('no budget yet: grok is on by default until its first usage-limit error', () => {
  const s = budgetStatus({ table, env: {}, usage: { tokens: 5000, sessions: 2 }, state: {} });
  assert.equal(s.ok, true);
  assert.match(s.reason, /not learned yet/);
});

test('a usage-limit error learns the budget, pauses grok for a day, then enforces 90% of it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'grok-state-'));
  const path = join(dir, 'state.json');
  try {
    const hitAt = now;
    recordLimit({ tokens: 2000, now: hitAt, path });
    const st = readState(path);
    assert.equal(st.learned_budget, 2000);
    const paused = budgetStatus({ table, env: {}, usage: { tokens: 100, sessions: 1 }, state: st, now: hitAt + 3600000 });
    assert.equal(paused.ok, false);
    assert.match(paused.reason, /usage limit hit .* paused until/);
    const later = hitAt + 25 * 3600000;
    const under = budgetStatus({ table, env: {}, usage: { tokens: 1700, sessions: 1 }, state: st, now: later });
    assert.equal(under.ok, true);
    assert.equal(under.budget_source, 'learned');
    const over = budgetStatus({ table, env: {}, usage: { tokens: 1800, sessions: 1 }, state: st, now: later });
    assert.equal(over.ok, false, '1800 / 2000 = 90%');
    // An env budget still wins over the learned one.
    assert.equal(budgetStatus({ table, env: { GROK_WEEKLY_TOKEN_BUDGET: '10000' }, usage: { tokens: 1800, sessions: 1 }, state: st, now: later }).ok, true);
    // A limit with no local tokens keeps the earlier learned budget.
    recordLimit({ tokens: 0, now: later, path });
    assert.equal(readState(path).learned_budget, 2000);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('usage-limit wording is told apart from a transient rate limit', () => {
  for (const t of ['You have reached your weekly limit', 'Usage limit reached for your plan', 'quota exceeded', 'You are out of credits'])
    assert.equal(isLimitError(t), true, t);
  for (const t of ['429 rate limit, retry in 20s', 'timeout', ''])
    assert.equal(isLimitError(t), false, t);
});

test('extract refuses an answer that never read the repository', () => {
  const reviewer = { family: 'grok', model: 'grok-4.7', effort: 'medium' };
  assert.throws(() => extract({ num_turns: 1, structuredOutput: { findings: [] } }, reviewer), /without reading/);
  assert.throws(() => extract({ num_turns: 3 }, reviewer), /no structuredOutput/);
  const ok = extract({ num_turns: 3, structuredOutput: { findings: [{ id: '' }] } }, reviewer);
  assert.deepEqual(ok, { reviewer, findings: [{ id: '' }] });
});

test('CLI extract: a non-JSON usage-limit failure is recorded and learns the budget', () => {
  // The CLI counts the real last 7 days, so the session is dated from the real clock.
  const dir = sessions([[1, 3000]], Date.now());
  const work = mkdtempSync(join(tmpdir(), 'grok-cli-'));
  try {
    const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'grok.mjs');
    writeFileSync(join(work, 'out.raw'), '');
    writeFileSync(join(work, 'out.err'), 'Error: You have reached your weekly usage limit.\n');
    const env = { ...process.env, GROK_SESSIONS_DIR: dir, GROK_BUDGET_STATE: join(work, 'state.json') };
    const r = spawnSync(process.execPath, [script, 'extract', join(work, 'out.raw'), join(work, 'out.json'), '--model', 'grok-4.7', '--stderr', join(work, 'out.err')], { env, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /usage limit: recorded .* learned budget 3000 tokens/);
    assert.equal(readState(join(work, 'state.json')).learned_budget, 3000);
    const st = spawnSync(process.execPath, [script, 'status'], { env, encoding: 'utf8' });
    assert.equal(JSON.parse(st.stdout).ok, false, 'paused right after the limit');
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(work, { recursive: true, force: true }); }
});
