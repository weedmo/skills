import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { weeklyTokens, budgetStatus, extract } from '../scripts/grok.mjs';

const table = { grok_priority: { roles: ['review'], cap_pct: 90, weekly_token_budget: null, window_days: 7 } };
const now = Date.parse('2026-11-20T00:00:00Z');

function sessions(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'grok-sessions-'));
  rows.forEach(([daysAgo, tokens], i) => {
    const d = join(dir, '%2Frepo', `s${i}`);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'usage.json'), JSON.stringify({ updatedAt: new Date(now - daysAgo * 86400000).toISOString(), session: { totalTokens: tokens } }));
  });
  return dir;
}

test('weekly tokens count only sessions updated inside the window', () => {
  const dir = sessions([[1, 100], [6.9, 200], [8, 5000]]);
  try {
    assert.deepEqual(weeklyTokens({ dir, now, days: 7 }), { tokens: 300, sessions: 2 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('budget status: under 90% ok, at 90% not ok, unset budget fails closed', () => {
  const at = t => budgetStatus({ table, env: { GROK_WEEKLY_TOKEN_BUDGET: '1000' }, usage: { tokens: t, sessions: 1 } });
  assert.equal(at(899).ok, true);
  assert.equal(at(900).ok, false);
  assert.match(at(900).reason, /90% >= 90%/);
  const unset = budgetStatus({ table, env: {}, usage: { tokens: 1, sessions: 1 } });
  assert.equal(unset.ok, false);
  assert.match(unset.reason, /budget unset/);
  const fromTable = budgetStatus({ table: { grok_priority: { ...table.grok_priority, weekly_token_budget: 1000 } }, env: {}, usage: { tokens: 10, sessions: 1 } });
  assert.equal(fromTable.ok, true);
});

test('extract refuses an answer that never read the repository', () => {
  const reviewer = { family: 'grok', model: 'grok-4.7', effort: 'medium' };
  assert.throws(() => extract({ num_turns: 1, structuredOutput: { findings: [] } }, reviewer), /without reading/);
  assert.throws(() => extract({ num_turns: 3 }, reviewer), /no structuredOutput/);
  const ok = extract({ num_turns: 3, structuredOutput: { findings: [{ id: '' }] } }, reviewer);
  assert.deepEqual(ok, { reviewer, findings: [{ id: '' }] });
});
