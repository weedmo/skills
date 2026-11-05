import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validatePlan } from '../scripts/run-scenarios.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'run-scenarios.mjs');

// A tiny HTTP app whose /greet answer is the behaviour under test.
const APP = `import http from 'node:http';
const port = Number(process.env.PORT);
const greeting = process.env.BROKEN ? 'bye' : 'hello';
http.createServer((req, res) => {
  if (req.url === '/greet') { res.end(JSON.stringify({ greeting })); return; }
  res.statusCode = 404; res.end();
}).listen(port, () => console.log('listening on ' + port));`;

const SCENARIO = `import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const res = await fetch(process.env.QA_BASE_URL + '/greet');
const body = await res.json();
writeFileSync(process.env.QA_EVIDENCE_DIR + '/response.json', JSON.stringify(body));
assert.equal(body.greeting, 'hello');`;

function project({ broken = false, port }) {
  const root = mkdtempSync(join(tmpdir(), 'qa-gate-'));
  writeFileSync(join(root, 'app.mjs'), APP);
  const qa = join(root, '.qa', 'u');
  mkdirSync(join(qa, 'scenarios'), { recursive: true });
  writeFileSync(join(qa, 'scenarios', 'ac1.mjs'), SCENARIO);
  writeFileSync(join(qa, 'plan.json'), JSON.stringify({
    surface: 'http',
    app: { start: `node app.mjs`, env: { PORT: String(port), ...(broken ? { BROKEN: '1' } : {}) },
      ready: { url: `http://127.0.0.1:${port}/greet` }, timeout_s: 15 },
    scenarios: [
      { id: 'ac1', acceptance: 'AC-1 greets with hello', driver: 'http', kind: 'scripted', script: 'scenarios/ac1.mjs' },
      { id: 'look', acceptance: 'AC-2 page reads naturally', driver: 'http', kind: 'judged', why_judged: 'tone' },
    ],
  }));
  return { root, qa };
}
const run = (root, qa) => spawnSync(process.execPath, [script, qa], { cwd: root, encoding: 'utf8', timeout: 60000 });
const portFree = () => 20000 + Math.floor(Math.random() * 20000);

test('passing app: scripted scenario passes, judged one is listed, evidence written, app stopped', () => {
  const port = portFree();
  const { root, qa } = project({ port });
  try {
    const r = run(root, qa);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /qa-gate: PASS \(1\/1 scripted, 1 judged → manual gates\)/);
    assert.ok(existsSync(join(qa, 'evidence', 'ac1', 'response.json')));
    assert.ok(existsSync(join(qa, 'evidence', 'app.log')));
    const result = JSON.parse(readFileSync(join(qa, 'result.json'), 'utf8'));
    assert.equal(result.status, 'PASS');
    const probe = spawnSync('curl', ['-s', '-m', '1', `http://127.0.0.1:${port}/greet`]);
    assert.notEqual(probe.status, 0, 'app must be stopped after the run');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('broken app: the gate fails and names the scenario and criterion', () => {
  const { root, qa } = project({ broken: true, port: portFree() });
  try {
    const r = run(root, qa);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /qa-gate: FAIL — ac1 \(AC-1 greets with hello\) exit 1/);
    assert.doesNotMatch(r.stdout, /qa-gate: PASS/);
    assert.match(r.stdout, /'bye'/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('app that never becomes ready fails with its log', () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-gate-'));
  const qa = join(root, '.qa', 'u');
  mkdirSync(qa, { recursive: true });
  writeFileSync(join(qa, 'plan.json'), JSON.stringify({ surface: 'http',
    app: { start: 'echo boom; exit 3', ready: { url: 'http://127.0.0.1:1/' }, timeout_s: 5 },
    scenarios: [{ id: 'a', acceptance: 'AC-1', driver: 'http', kind: 'scripted', script: 'a.mjs' }] }));
  try {
    const r = run(root, qa);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /app exited with 3 before ready: boom/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('library surface passes as N/A with its evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-gate-'));
  const qa = join(root, '.qa', 'u');
  mkdirSync(qa, { recursive: true });
  writeFileSync(join(qa, 'plan.json'), JSON.stringify({ surface: 'library', na_reason: 'no bin, no server, exports only' }));
  try {
    const r = run(root, qa);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /qa-gate: PASS \(N\/A — no bin, no server, exports only\)/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('plan validation rejects scenarios that cannot be checked', () => {
  assert.throws(() => validatePlan({ surface: 'library' }), /na_reason/);
  assert.throws(() => validatePlan({ surface: 'web', scenarios: [] }), /empty/);
  assert.throws(() => validatePlan({ surface: 'web', scenarios: [{ id: 'a', driver: 'playwright', kind: 'scripted', script: 'a.mjs' }] }), /acceptance/);
  assert.throws(() => validatePlan({ surface: 'web', scenarios: [{ id: 'a', acceptance: 'AC', driver: 'playwright', kind: 'scripted', script: 'a.py' }] }), /\.mjs/);
  assert.throws(() => validatePlan({ surface: 'cli', scenarios: [{ id: 'a', acceptance: 'AC', kind: 'scripted', script: 'a.sh' }, { id: 'a', acceptance: 'AC', kind: 'judged' }] }), /duplicate/);
});
