import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build, validate, showStep } from '../scripts/changes.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'changes.mjs');

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'pr-changes-'));
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  writeFileSync(join(dir, 'app.js'), 'const a = 1;\nconst count = 3;\nrender(count);\n');
  git('add', '.'); git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD').stdout.trim();
  writeFileSync(join(dir, 'app.js'), 'const a = 1;\nconst count = load();\nrender(count);\n');
  writeFileSync(join(dir, 'load.js'), 'export const load = () => fetch("/api/orders");\n');
  git('add', '.'); git('commit', '-qm', 'change');
  const out = join(dir, '.pr-visual', 'u');
  mkdirSync(out, { recursive: true });
  return { dir, base, out };
}

const doc = {
  title: '주문 수를 API에서 읽기',
  summary: '고정값 3 대신 /api/orders 결과를 쓴다.',
  points: [
    { title: '고정 건수 제거', file: 'app.js', as_is: { start: 2, end: 2 }, to_be: { start: 2, end: 2 }, what: '상수 대신 load() 호출', why: '실제 주문 수 표시' },
    { title: '조회 함수 추가', file: 'load.js', to_be: { start: 1, end: 1 }, what: '/api/orders 호출' },
  ],
  diagrams: { as_is: 'flowchart LR\n A["page"] --> B["3 <fixed>"]', to_be: 'flowchart LR\n A["page"] --> C["load()"]' },
};

test('change points show As-Is code at base and To-Be code in the working tree', () => {
  const { dir, base, out } = repo();
  try {
    writeFileSync(join(out, 'changes.json'), JSON.stringify(doc));
    const res = build({ outDir: out, base, root: dir });
    assert.equal(res.points, 2);
    assert.equal(res.videos, 'none');
    assert.equal(res.fits_artifact, true);
    const html = readFileSync(res.file, 'utf8');
    assert.match(html, /const count = 3;/, 'As-Is line from base');
    assert.match(html, /const count = load\(\);/, 'To-Be line from the working tree');
    assert.match(html, /없음 \(새로 추가\)/, 'a new file has no As-Is side');
    assert.match(html, /3 &lt;fixed&gt;/, 'diagram source is escaped');
    assert.doesNotMatch(html, /<video/, 'no videos without record.mjs output');
    assert.doesNotMatch(html, /작업 트리/, 'a clean tree is labelled by its commit');
    writeFileSync(join(dir, 'app.js'), 'const a = 1;\nconst count = load();\nrender(count, 1);\n');
    assert.match(readFileSync(build({ outDir: out, base, root: dir }).file, 'utf8'), /\+ 작업 트리/, 'uncommitted To-Be is labelled');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('record.mjs videos are inlined into the same page', () => {
  const { dir, base, out } = repo();
  try {
    writeFileSync(join(out, 'changes.json'), JSON.stringify(doc));
    mkdirSync(join(out, 'as-is', 's1'), { recursive: true }); mkdirSync(join(out, 'to-be', 's1'), { recursive: true });
    writeFileSync(join(out, 'as-is', 's1', 'a.webm'), 'AAAA'); writeFileSync(join(out, 'to-be', 's1', 'b.webm'), 'BBBB');
    writeFileSync(join(out, 'summary.json'), JSON.stringify({ scenarios: [{ id: 's1', acceptance: 'AC-1', as_is_exit: 1, to_be_exit: 0,
      as_is_videos: ['as-is/s1/a.webm'], to_be_videos: ['to-be/s1/b.webm'] }] }));
    const res = build({ outDir: out, base, root: dir });
    assert.equal(res.videos, 'inlined');
    const html = readFileSync(res.file, 'utf8');
    assert.match(html, /data:video\/webm;base64,QUFBQQ==/);
    assert.doesNotMatch(html, /src="(as-is|to-be)\//, 'no file references left');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('validation names what is missing; a line past the end fails loudly', () => {
  assert.deepEqual(validate({ title: 't', points: [{ title: 'p', file: 'f' }] }), ['points[0] needs as_is or to_be lines']);
  assert.match(validate({ points: [] }).join(' '), /title is required.*at least one/);
  assert.match(validate({ title: 't', points: [{ title: 'p', file: 'f', to_be: { start: 3, end: 1 } }] }).join(), /start <= end/);
  const { dir, base, out } = repo();
  try {
    writeFileSync(join(out, 'changes.json'), JSON.stringify({ title: 't', points: [{ title: 'p', file: 'app.js', to_be: { start: 40, end: 41 } }] }));
    assert.throws(() => build({ outDir: out, base, root: dir }), /past the end/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('shown as an artifact on Claude, through deliver.py on Codex, locally otherwise', () => {
  const res = { file: '/x/changes.html', kb: 40, fits_artifact: true };
  assert.equal(showStep(res, 'claude').via, 'claude');
  assert.equal(showStep(res, 'codex').via, 'codex');
  assert.equal(showStep({ ...res, kb: 20000, fits_artifact: false }, 'claude').via, 'local');
});

test('CLI writes the page and prints where to show it', () => {
  const { dir, base, out } = repo();
  try {
    writeFileSync(join(out, 'changes.json'), JSON.stringify(doc));
    const r = spawnSync(process.execPath, [script, out, '--base', base, '--host', 'claude'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout.trim().split('\n').pop()).pr_visual.via, 'claude');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
