#!/usr/bin/env node
// Gate CHECK for qa-gate: start the app from plan.json, run every scripted scenario,
// stop the app, write result.json. Re-runnable by anyone; judged scenarios are
// listed but decided by manual gates, never here.
import { readFileSync, writeFileSync, mkdirSync, createWriteStream, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const SURFACES = ['web', 'http', 'cli', 'tui', 'library'];

export function validatePlan(p) {
  if (!p || !SURFACES.includes(p.surface)) throw new Error(`plan.surface must be one of ${SURFACES.join(', ')}`);
  if (p.surface === 'library') {
    if (!String(p.na_reason || '').trim()) throw new Error('library surface needs na_reason (the detection evidence)');
    return;
  }
  if (!Array.isArray(p.scenarios) || !p.scenarios.length) throw new Error('plan.scenarios is empty');
  const ids = new Set();
  for (const s of p.scenarios) {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(s.id || '') || ids.has(s.id)) throw new Error(`bad or duplicate scenario id ${s.id}`);
    ids.add(s.id);
    if (!String(s.acceptance || '').trim()) throw new Error(`scenario ${s.id} names no acceptance criterion`);
    if (!['scripted', 'judged'].includes(s.kind)) throw new Error(`scenario ${s.id} kind must be scripted|judged`);
    if (s.kind === 'scripted' && !['.mjs', '.js', '.sh'].includes(extname(s.script || ''))) throw new Error(`scenario ${s.id} needs a .mjs, .js or .sh script`);
  }
  if (p.app && !String(p.app.start || '').trim()) throw new Error('plan.app needs start');
}

const tail = (s, n = 800) => (s.length > n ? '…' + s.slice(-n) : s);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function startApp(app, root, logPath) {
  const log = createWriteStream(logPath);
  const child = spawn('sh', ['-c', app.start], { cwd: resolve(root, app.cwd || '.'), detached: true,
    env: { ...process.env, ...(app.env || {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let exited = null;
  const onData = d => { out += d; log.write(d); };
  child.stdout.on('data', onData); child.stderr.on('data', onData);
  child.on('exit', code => { exited = code; });
  const deadline = Date.now() + 1000 * (app.timeout_s ?? 60);
  while (Date.now() < deadline) {
    if (exited !== null) throw new Error(`app exited with ${exited} before ready: ${tail(out)}`);
    if (app.ready?.output && out.includes(app.ready.output)) return { child, log };
    if (app.ready?.url) {
      try {
        const r = await fetch(app.ready.url, { signal: AbortSignal.timeout(2000) });
        if (r.status < 500) return { child, log };
      } catch { /* not up yet */ }
    }
    if (!app.ready) return { child, log };
    await sleep(300);
  }
  stopApp({ child, log });
  throw new Error(`app not ready within ${app.timeout_s ?? 60}s: ${tail(out)}`);
}

function stopApp(h) {
  if (!h) return;
  try { process.kill(-h.child.pid, 'SIGTERM'); } catch { /* already gone */ }
  h.log.end();
}

function runScript(file, cwd, env, timeoutS) {
  return new Promise(res => {
    const cmd = extname(file) === '.sh' ? 'sh' : process.execPath;
    const started = Date.now();
    const child = spawn(cmd, [file], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
    const timer = setTimeout(() => { out += `\n[timeout after ${timeoutS}s]`; child.kill('SIGKILL'); }, timeoutS * 1000);
    child.on('close', code => { clearTimeout(timer); res({ exit: code ?? 1, duration_ms: Date.now() - started, output: tail(out) }); });
  });
}

export async function runPlan(qaDir, root = process.cwd()) {
  const plan = JSON.parse(readFileSync(join(qaDir, 'plan.json'), 'utf8'));
  validatePlan(plan);
  const result = { surface: plan.surface, ran_at: new Date().toISOString(), scenarios: [], judged: [] };
  if (plan.surface === 'library') {
    result.status = 'PASS';
    result.line = `qa-gate: PASS (N/A — ${plan.na_reason})`;
    return result;
  }
  mkdirSync(join(qaDir, 'evidence'), { recursive: true });
  const baseUrl = plan.app?.base_url ?? (plan.app?.ready?.url ? new URL(plan.app.ready.url).origin : null);
  let app = null;
  try {
    if (plan.app) app = await startApp(plan.app, root, join(qaDir, 'evidence', 'app.log'));
    for (const s of plan.scenarios) {
      if (s.kind === 'judged') { result.judged.push({ id: s.id, acceptance: s.acceptance }); continue; }
      const evidence = resolve(qaDir, 'evidence', s.id);
      mkdirSync(evidence, { recursive: true });
      const script = resolve(qaDir, s.script);
      if (!existsSync(script)) { result.scenarios.push({ id: s.id, acceptance: s.acceptance, exit: 127, output: `missing ${s.script}` }); continue; }
      const env = { ...process.env, QA_EVIDENCE_DIR: evidence, ...(baseUrl ? { QA_BASE_URL: baseUrl } : {}) };
      result.scenarios.push({ id: s.id, acceptance: s.acceptance, ...(await runScript(script, root, env, s.timeout_s ?? 120)) });
    }
  } catch (e) {
    result.status = 'FAIL';
    result.line = `qa-gate: FAIL — ${e.message}`;
    return result;
  } finally {
    stopApp(app);
  }
  const failed = result.scenarios.filter(s => s.exit !== 0);
  const scripted = result.scenarios.length;
  result.status = failed.length ? 'FAIL' : 'PASS';
  result.line = failed.length
    ? `qa-gate: FAIL — ${failed.map(s => `${s.id} (${s.acceptance}) exit ${s.exit}`).join(', ')}`
    : `qa-gate: PASS (${scripted}/${scripted} scripted${result.judged.length ? `, ${result.judged.length} judged → manual gates` : ''})`;
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const qaDir = process.argv[2];
  if (!qaDir || qaDir === '--help' || qaDir === '-h') {
    console.log('usage: run-scenarios.mjs <qa-dir>   (run from the repository root; reads <qa-dir>/plan.json)');
    process.exit(qaDir ? 0 : 2);
  }
  try {
    const result = await runPlan(qaDir);
    writeFileSync(join(qaDir, 'result.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(result.line);
    for (const s of result.scenarios.filter(x => x.exit !== 0)) console.log(`--- ${s.id}\n${s.output}`);
    process.exit(result.status === 'PASS' ? 0 : 1);
  } catch (e) {
    console.error(`run-scenarios: ${e.message}`);
    process.exit(2);
  }
}
