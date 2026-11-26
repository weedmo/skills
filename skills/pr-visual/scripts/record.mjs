#!/usr/bin/env node
// As-Is / To-Be recording for a web change. Runs qa-gate's scripted scenarios twice with
// QA_VIDEO_DIR set: once against the app started from an exported tree of <base>
// (As-Is), once from the working tree (To-Be). Writes compare.html with the two videos
// side by side per scenario. Scenario exit codes are recorded, never enforced: an As-Is
// run is expected to fail the new acceptance criteria.
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { runPlan } = await import(pathToFileURL(join(here, '..', '..', 'qa-gate', 'scripts', 'run-scenarios.mjs')).href);

const git = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.trim()}`);
  return r.stdout.trim();
};

const VIDEO = /\.(webm|mp4)$/i;
const videosIn = dir => (existsSync(dir) ? readdirSync(dir).filter(f => VIDEO.test(f)).map(f => join(dir, f))
  .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs) : []);

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function compareHtml(rows, meta) {
  const cell = (vids, run) => vids.length
    ? vids.map(v => `<video src="${esc(v)}" controls muted playsinline preload="metadata"></video>`).join('')
    : `<p class="none">no video${run ? ` (exit ${run.exit})` : ''}</p>`;
  const body = rows.map(r => `<section><h2>${esc(r.id)}</h2><p class="ac">${esc(r.acceptance)}</p>
<div class="pair"><figure><figcaption>As-Is <code>${esc(meta.base)}</code> · exit ${r.asIs?.exit ?? '–'}</figcaption>${cell(r.asIsVideos, r.asIs)}</figure>
<figure><figcaption>To-Be <code>${esc(meta.head)}</code> · exit ${r.toBe?.exit ?? '–'}</figcaption>${cell(r.toBeVideos, r.toBe)}</figure></div></section>`).join('\n');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>As-Is / To-Be ${esc(meta.unit)}</title><style>
:root{color-scheme:light dark;--bg:#f6f7f9;--fg:#18202b;--muted:#5d6877;--line:#d3d8df}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#12161c;--fg:#e6eaf0;--muted:#9aa5b4;--line:#323c4b}}
:root[data-theme=dark]{--bg:#12161c;--fg:#e6eaf0;--muted:#9aa5b4;--line:#323c4b;color-scheme:dark}:root[data-theme=light]{color-scheme:light}
body{margin:0;padding:24px max(16px,4vw);background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 4px}.ac,.meta,.none{color:var(--muted)}
.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
figure{margin:0;border:1px solid var(--line);border-radius:8px;padding:12px;min-width:0}
figcaption{font-weight:600;margin-bottom:8px}video{width:100%;display:block;border-radius:4px;background:#000}
button{font:inherit;padding:6px 14px;border-radius:6px;border:1px solid var(--line);background:transparent;color:inherit;cursor:pointer}
</style></head><body><h1>As-Is / To-Be</h1>
<p class="meta">${esc(meta.unit)} · base <code>${esc(meta.base)}</code> → <code>${esc(meta.head)}</code></p>
<button id="play">두 영상 같이 재생</button>
${body}
<script>document.getElementById('play').onclick=()=>document.querySelectorAll('video').forEach(v=>{v.currentTime=0;v.play()});</script>
</body></html>
`;
}

// One self-contained page with the videos inlined, for a Claude Artifact (16 MB cap).
export const SHARE_CAP = 15 * 1024 * 1024;
const MIME = { webm: 'video/webm', mp4: 'video/mp4' };
export function sharePage(rows, meta, outDir) {
  const inline = v => `data:${MIME[v.split('.').pop().toLowerCase()]};base64,${readFileSync(join(outDir, v)).toString('base64')}`;
  return compareHtml(rows.map(r => ({ ...r, asIsVideos: r.asIsVideos.map(inline), toBeVideos: r.toBeVideos.map(inline) })), meta);
}

// Playwright's own ffmpeg (VP8 only) can shrink a WebM; the newest cached build wins.
function playwrightFfmpeg() {
  const cache = join(homedir(), '.cache', 'ms-playwright');
  if (!existsSync(cache)) return null;
  const dirs = readdirSync(cache).filter(d => d.startsWith('ffmpeg-')).sort().reverse();
  for (const d of dirs) for (const f of ['ffmpeg-linux', 'ffmpeg-mac', 'ffmpeg-win64.exe']) {
    if (existsSync(join(cache, d, f))) return join(cache, d, f);
  }
  return null;
}

export function shrink(outDir, videos, { width = 640, bitrate = '150k' } = {}) {
  const ff = playwrightFfmpeg();
  if (!ff) return { ok: false, reason: 'no Playwright ffmpeg to shrink the videos' };
  for (const v of videos.filter(x => x.endsWith('.webm'))) {
    const src = join(outDir, v), tmp = src + '.small.webm';
    const r = spawnSync(ff, ['-y', '-loglevel', 'error', '-i', src, '-vf', `scale=${width}:-2`, '-c:v', 'libvpx', '-b:v', bitrate, '-an', tmp], { encoding: 'utf8' });
    if (r.status !== 0) return { ok: false, reason: `ffmpeg: ${(r.stderr || '').trim().slice(0, 200)}` };
    rmSync(src); spawnSync('mv', [tmp, src]);
  }
  return { ok: true };
}

export async function record({ qaDir, outDir, base, root = process.cwd() }) {
  const baseSha = git(['rev-parse', '--short', base], root);
  const headSha = git(['rev-parse', '--short', 'HEAD'], root);
  mkdirSync(outDir, { recursive: true });
  const tree = join(outDir, 'as-is-tree');
  rmSync(tree, { recursive: true, force: true });
  // Export the base tree instead of `git worktree add`: it only reads objects, so it
  // also works where .git is read-only (Codex's workspace-write sandbox).
  mkdirSync(tree, { recursive: true });
  const tar = join(outDir, 'as-is-tree.tar');
  git(['archive', '--format=tar', '-o', tar, baseSha], root);
  const x = spawnSync('tar', ['-xf', tar, '-C', tree], { encoding: 'utf8' });
  rmSync(tar, { force: true });
  if (x.status !== 0) throw new Error(`tar -xf: ${x.stderr.trim()}`);
  try {
    // The base checkout has no installed dependencies; reuse the working tree's.
    for (const dep of ['node_modules', '.venv']) {
      if (existsSync(join(root, dep)) && !existsSync(join(tree, dep))) symlinkSync(join(root, dep), join(tree, dep));
    }
    const videoEnv = run => id => { const d = join(outDir, run, id); mkdirSync(d, { recursive: true }); return { QA_VIDEO_DIR: d }; };
    const asIs = await runPlan(qaDir, root, { appRoot: tree, evidenceDir: join(outDir, 'as-is', 'evidence'), env: videoEnv('as-is') });
    const toBe = await runPlan(qaDir, root, { evidenceDir: join(outDir, 'to-be', 'evidence'), env: videoEnv('to-be') });
    const ids = [...new Set([...asIs.scenarios, ...toBe.scenarios].map(s => s.id))];
    const rel = p => relative(outDir, p);
    const rows = ids.map(id => {
      const a = asIs.scenarios.find(s => s.id === id), b = toBe.scenarios.find(s => s.id === id);
      return { id, acceptance: (a ?? b).acceptance, asIs: a, toBe: b,
        asIsVideos: videosIn(join(outDir, 'as-is', id)).map(rel), toBeVideos: videosIn(join(outDir, 'to-be', id)).map(rel) };
    });
    const meta = { unit: basename(outDir), base: baseSha, head: headSha };
    const html = join(outDir, 'compare.html');
    writeFileSync(html, compareHtml(rows, meta));
    const share = join(outDir, 'share.html');
    let sharePageHtml = sharePage(rows, meta, outDir);
    let shrunk = null;
    if (Buffer.byteLength(sharePageHtml) > SHARE_CAP) {
      shrunk = shrink(outDir, rows.flatMap(r => [...r.asIsVideos, ...r.toBeVideos]));
      if (shrunk.ok) { writeFileSync(html, compareHtml(rows, meta)); sharePageHtml = sharePage(rows, meta, outDir); }
    }
    writeFileSync(share, sharePageHtml);
    const shareBytes = Buffer.byteLength(sharePageHtml);
    const summary = { base: baseSha, head: headSha, html, share, share_kb: Math.round(shareBytes / 1024),
      fits_artifact: shareBytes <= SHARE_CAP, shrunk: shrunk && (shrunk.ok ? 'yes' : shrunk.reason), as_is: asIs.line, to_be: toBe.line,
      scenarios: rows.map(r => ({ id: r.id, acceptance: r.acceptance, as_is_exit: r.asIs?.exit ?? null, to_be_exit: r.toBe?.exit ?? null,
        as_is_videos: r.asIsVideos, to_be_videos: r.toBeVideos })) };
    writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    return summary;
  } finally {
    rmSync(tree, { recursive: true, force: true });
  }
}

// Where the person sees it: 1. Codex — the caller hands compare.html to loop-report's
// deliver.py (system opener; Herdr's Artifact panel when it handles the open); 2. Claude —
// the caller publishes share.html with the Artifact tool; 3. otherwise the local browser
// window. This names the step; the caller performs it, as loops do for their report page.
export function nextStep(summary, host) {
  if (host === 'codex') return { via: 'codex', file: summary.html, how: 'deliver.py publish --page (loop-report)' };
  if (host === 'claude' && summary.fits_artifact) return { via: 'claude', file: summary.share, how: 'publish with the Artifact tool' };
  const why = host === 'claude' ? `share.html is ${summary.share_kb} KB, over the Artifact cap` : 'no Codex or Claude session';
  return { via: 'local', file: summary.html, why };
}

// Open the comparison for the person at the terminal; never blocks.
export function show(html) {
  const url = pathToFileURL(resolve(html)).href;
  const display = process.env.DISPLAY || process.env.WAYLAND_DISPLAY || process.platform === 'darwin';
  if (display) {
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawnSync(opener, [resolve(html)], { stdio: 'ignore', detached: true, timeout: 5000 });
  }
  return { url, opened: Boolean(display) };
}

const USAGE = `usage: record.mjs <qa-dir> <out-dir> --base <ref> [--host codex|claude] [--no-open]
Run from the repository root. Needs <qa-dir>/plan.json with surface "web" and scenarios
that honour QA_VIDEO_DIR (qa-gate drivers.md).`;

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const [qaDir, outDir] = args;
  if (!qaDir || !outDir || !opt('--base')) { console.log(USAGE); process.exit(qaDir === '--help' ? 0 : 2); }
  try {
    const s = await record({ qaDir: resolve(qaDir), outDir: resolve(outDir), base: opt('--base') });
    console.log(`pr-visual: As-Is ${s.base} → To-Be ${s.head}`);
    for (const r of s.scenarios) console.log(`  ${r.id}: as-is exit ${r.as_is_exit}, to-be exit ${r.to_be_exit}, videos ${r.as_is_videos.length}/${r.to_be_videos.length}`);
    console.log(`  compare: ${pathToFileURL(s.html).href}`);
    console.log(`  share:   ${s.share} (${s.share_kb} KB${s.shrunk === 'yes' ? ', videos shrunk' : ''})`);
    const next = nextStep(s, opt('--host'));
    if (next.via === 'local') {
      const shown = args.includes('--no-open') ? { url: pathToFileURL(s.html).href, opened: false } : show(s.html);
      console.log(`  show: local browser — ${next.why}: ${shown.url}${shown.opened ? ' (opened)' : ''}`);
    } else {
      console.log(`  show: ${next.via} — ${next.how}: ${next.file}`);
    }
    console.log(JSON.stringify({ pr_visual: next }));
  } catch (e) {
    console.error(`pr-visual: ${e.message}`);
    process.exit(1);
  }
}
