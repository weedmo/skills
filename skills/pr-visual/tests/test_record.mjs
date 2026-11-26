import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { record, nextStep } from '../scripts/record.mjs';

const port = 43000 + Math.floor(Math.random() * 1000);
const app = text => `require('http').createServer((q, r) => r.end(${JSON.stringify(text)})).listen(${port});\n`;

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'pr-visual-'));
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  writeFileSync(join(dir, 'server.js'), app('old greeting')); git('add', '.'); git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD').stdout.trim();
  writeFileSync(join(dir, 'server.js'), app('new greeting')); git('commit', '-qam', 'change');
  // .qa is outside git, as qa-gate keeps it.
  const qa = join(dir, '.qa', 'u');
  mkdirSync(join(qa, 'scenarios'), { recursive: true });
  writeFileSync(join(qa, 'plan.json'), JSON.stringify({ surface: 'web',
    app: { start: 'node server.js', ready: { url: `http://127.0.0.1:${port}/` }, timeout_s: 10 },
    scenarios: [{ id: 'ac1-greeting', acceptance: 'AC-1 shows the new greeting', driver: 'playwright', kind: 'scripted', script: 'scenarios/ac1.mjs' }] }));
  // Stand-in for a Playwright recording: the page text written as the "video".
  writeFileSync(join(qa, 'scenarios', 'ac1.mjs'), `
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const text = await (await fetch(process.env.QA_BASE_URL + '/')).text();
if (process.env.QA_VIDEO_DIR) writeFileSync(join(process.env.QA_VIDEO_DIR, 'page.webm'), text);
if (text !== 'new greeting') process.exit(1);
`);
  return { dir, base, qa };
}

test('records the exported base tree as As-Is and the working tree as To-Be, side by side', async () => {
  const { dir, base, qa } = repo();
  try {
    const out = join(dir, '.pr-visual', 'u');
    const s = await record({ qaDir: qa, outDir: out, base, root: dir });
    assert.equal(s.scenarios.length, 1);
    const [r] = s.scenarios;
    assert.equal(r.as_is_exit, 1, 'As-Is fails the new criterion and is still recorded');
    assert.equal(r.to_be_exit, 0);
    assert.equal(readFileSync(join(out, r.as_is_videos[0]), 'utf8'), 'old greeting');
    assert.equal(readFileSync(join(out, r.to_be_videos[0]), 'utf8'), 'new greeting');
    const html = readFileSync(s.html, 'utf8');
    assert.match(html, /As-Is <code>/);
    assert.match(html, /To-Be <code>/);
    assert.match(html, /as-is\/ac1-greeting\/page\.webm/);
    assert.match(html, /to-be\/ac1-greeting\/page\.webm/);
    const share = readFileSync(s.share, 'utf8');
    assert.match(share, /data:video\/webm;base64,/, 'videos inlined for an artifact link');
    assert.doesNotMatch(share, /src="(as-is|to-be)\//, 'no file references left in share.html');
    assert.equal(s.fits_artifact, true);
    assert.equal(existsSync(join(out, 'as-is-tree')), false, 'base export removed');
    const wt = spawnSync('git', ['worktree', 'list'], { cwd: dir, encoding: 'utf8' }).stdout.trim().split('\n');
    assert.equal(wt.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('works when .git is read-only, as in a Codex workspace-write sandbox', async () => {
  const { dir, base, qa } = repo();
  const lock = mode => spawnSync('chmod', ['-R', mode, join(dir, '.git')]);
  try {
    lock('a-w');
    const out = join(dir, '.pr-visual', 'u');
    const s = await record({ qaDir: qa, outDir: out, base, root: dir });
    assert.equal(s.scenarios[0].as_is_exit, 1);
    assert.equal(s.scenarios[0].to_be_exit, 0);
    assert.equal(existsSync(join(out, 'as-is-tree')), false);
    assert.equal(existsSync(join(out, 'as-is-tree.tar')), false);
  } finally { lock('u+w'); rmSync(dir, { recursive: true, force: true }); }
});

test('where it is shown: codex (deliver.py) first, claude artifact second, local last', () => {
  const s = { html: '/x/compare.html', share: '/x/share.html', share_kb: 120, fits_artifact: true };
  assert.deepEqual(nextStep(s, 'codex'), { via: 'codex', file: '/x/compare.html', how: 'deliver.py publish --page (loop-report)' });
  assert.equal(nextStep(s, 'claude').via, 'claude');
  assert.equal(nextStep(s, 'claude').file, '/x/share.html');
  const big = nextStep({ ...s, share_kb: 20000, fits_artifact: false }, 'claude');
  assert.equal(big.via, 'local');
  assert.match(big.why, /over the Artifact cap/);
  assert.equal(nextStep(s, undefined).via, 'local');
});
