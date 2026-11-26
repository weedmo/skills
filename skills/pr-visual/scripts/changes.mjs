#!/usr/bin/env node
// Change-point page for a PR: one self-contained HTML file that shows each change point
// side by side (As-Is code at <base>, To-Be code in the working tree) with what changed
// and why, the As-Is / To-Be diagrams, and — when record.mjs ran — the web recordings
// inlined. Codex writes <out-dir>/changes.json and runs this; the main session shows the
// page (Claude Artifact or deliver.py). Nothing here goes to GitHub.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SHARE_CAP, shrink } from './record.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MIME = { webm: 'video/webm', mp4: 'video/mp4' };

const git = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.trim()}`);
  return r.stdout;
};

export function validate(doc) {
  const errs = [];
  if (!doc || typeof doc !== 'object') return ['changes.json is not an object'];
  if (!doc.title) errs.push('title is required');
  if (!Array.isArray(doc.points) || !doc.points.length) errs.push('points needs at least one change point');
  (doc.points ?? []).forEach((p, i) => {
    if (!p.title || !p.file) errs.push(`points[${i}] needs title and file`);
    if (!p.as_is && !p.to_be) errs.push(`points[${i}] needs as_is or to_be lines`);
    for (const side of ['as_is', 'to_be']) {
      const r = p[side];
      if (r && !(Number.isInteger(r.start) && Number.isInteger(r.end) && r.start >= 1 && r.end >= r.start)) {
        errs.push(`points[${i}].${side} needs integer start <= end`);
      }
    }
  });
  return errs;
}

// Lines start..end (1-based, inclusive) of a file at <base> or in the working tree.
export function excerpt({ root, base, file, range, side }) {
  if (!range) return null;
  const text = side === 'as_is' ? git(['show', `${base}:${file}`], root) : readFileSync(join(root, file), 'utf8');
  const lines = text.split('\n');
  if (range.start > lines.length) throw new Error(`${file}: line ${range.start} is past the end (${lines.length} lines, ${side})`);
  return lines.slice(range.start - 1, range.end).map((l, i) => ({ n: range.start + i, l }));
}

const code = (rows, label) => rows
  ? `<figure><figcaption>${label}</figcaption><pre>${rows.map(r => `<span class="n">${r.n}</span>${esc(r.l)}`).join('\n')}</pre></figure>`
  : `<figure><figcaption>${label}</figcaption><p class="none">${label.startsWith('As-Is') ? '없음 (새로 추가)' : '없음 (삭제)'}</p></figure>`;

function videosBlock(outDir, summary) {
  if (!summary?.scenarios?.length) return '';
  const tag = v => `<video src="data:${MIME[v.split('.').pop().toLowerCase()]};base64,${readFileSync(join(outDir, v)).toString('base64')}" controls muted playsinline preload="metadata"></video>`;
  const cell = (vids, exit) => vids.length ? vids.map(tag).join('') : `<p class="none">영상 없음 (exit ${exit ?? '–'})</p>`;
  return `<h2>화면 동작</h2>${summary.scenarios.map(s => `<section><h3>${esc(s.id)}</h3><p class="muted">${esc(s.acceptance)}</p>
<div class="pair"><figure><figcaption>As-Is · exit ${s.as_is_exit ?? '–'}</figcaption>${cell(s.as_is_videos, s.as_is_exit)}</figure>
<figure><figcaption>To-Be · exit ${s.to_be_exit ?? '–'}</figcaption>${cell(s.to_be_videos, s.to_be_exit)}</figure></div></section>`).join('\n')}`;
}

export function changesHtml({ doc, points, meta, videos }) {
  const diagrams = doc.diagrams?.as_is || doc.diagrams?.to_be
    ? `<h2>흐름</h2><div class="pair"><figure><figcaption>As-Is</figcaption><pre class="mermaid">${esc(doc.diagrams.as_is)}</pre></figure>
<figure><figcaption>To-Be</figcaption><pre class="mermaid">${esc(doc.diagrams.to_be)}</pre></figure></div>
<script type="module">try{const m=(await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs')).default;m.initialize({startOnLoad:false,theme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'default'});await m.run({querySelector:'.mermaid'});}catch(e){}</script>`
    : '';
  const cards = points.map((p, i) => `<section class="point"><h3><span class="idx">${i + 1}</span>${esc(p.title)}</h3>
<p class="muted"><code>${esc(p.file)}</code>${p.as_is ? ` · As-Is ${p.as_is.start}–${p.as_is.end}` : ''}${p.to_be ? ` · To-Be ${p.to_be.start}–${p.to_be.end}` : ''}</p>
${p.what ? `<p><b>무엇이</b> ${esc(p.what)}</p>` : ''}${p.why ? `<p><b>왜</b> ${esc(p.why)}</p>` : ''}
<div class="pair">${code(p.asIsRows, `As-Is <code>${esc(meta.base)}</code>`)}${code(p.toBeRows, `To-Be <code>${esc(meta.head)}</code>`)}</div></section>`).join('\n');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.title)}</title><style>
:root{color-scheme:light dark;--bg:#f6f7f9;--fg:#18202b;--muted:#5d6877;--line:#d3d8df;--code:#ffffff;--acc:#b4532a}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#12161c;--fg:#e6eaf0;--muted:#9aa5b4;--line:#323c4b;--code:#1b2129;--acc:#f0966a}}
:root[data-theme=dark]{--bg:#12161c;--fg:#e6eaf0;--muted:#9aa5b4;--line:#323c4b;--code:#1b2129;--acc:#f0966a;color-scheme:dark}:root[data-theme=light]{color-scheme:light}
body{margin:0;padding:24px max(16px,4vw);background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,sans-serif}
h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:32px 0 8px}h3{font-size:16px;margin:0 0 4px}
.muted,.none{color:var(--muted)}.idx{display:inline-block;min-width:24px;margin-right:8px;color:var(--acc)}
.point{border:1px solid var(--line);border-radius:8px;padding:16px;margin:12px 0}
.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
figure{margin:0;min-width:0}figcaption{font-weight:600;margin:8px 0 4px}
pre{margin:0;padding:8px;background:var(--code);border:1px solid var(--line);border-radius:6px;overflow:auto;font:13px/1.45 ui-monospace,monospace}
.n{display:inline-block;width:3em;color:var(--muted);user-select:none}
video{width:100%;display:block;border-radius:4px;background:#000}
</style></head><body><h1>${esc(doc.title)}</h1>
<p class="muted">${esc(meta.unit)} · base <code>${esc(meta.base)}</code> → <code>${esc(meta.head)}</code> · 변경 지점 ${points.length}개</p>
${doc.summary ? `<p>${esc(doc.summary)}</p>` : ''}
<h2>변경 지점</h2>
${cards}
${diagrams}
${videos}
</body></html>
`;
}

export function build({ outDir, base, root = process.cwd(), unit }) {
  const doc = JSON.parse(readFileSync(join(outDir, 'changes.json'), 'utf8'));
  const errs = validate(doc);
  if (errs.length) throw new Error(`changes.json: ${errs.join('; ')}`);
  const meta = { unit: unit ?? outDir.split('/').filter(Boolean).pop(),
    base: git(['rev-parse', '--short', base], root).trim(), head: git(['rev-parse', '--short', 'HEAD'], root).trim() };
  // To-Be excerpts come from the working tree; say so when it differs from HEAD.
  if (git(['status', '--porcelain', '--untracked-files=no'], root).trim()) meta.head += ' + 작업 트리';
  const points = doc.points.map(p => ({ ...p,
    asIsRows: excerpt({ root, base, file: p.file, range: p.as_is, side: 'as_is' }),
    toBeRows: excerpt({ root, base, file: p.file, range: p.to_be, side: 'to_be' }) }));
  const sumPath = join(outDir, 'summary.json');
  const summary = existsSync(sumPath) ? JSON.parse(readFileSync(sumPath, 'utf8')) : null;
  let html = changesHtml({ doc, points, meta, videos: videosBlock(outDir, summary) });
  let videosNote = summary ? 'inlined' : 'none';
  if (summary && Buffer.byteLength(html) > SHARE_CAP) {
    const all = summary.scenarios.flatMap(s => [...s.as_is_videos, ...s.to_be_videos]);
    const s = shrink(outDir, all);
    html = changesHtml({ doc, points, meta, videos: s.ok ? videosBlock(outDir, summary) : '' });
    videosNote = s.ok ? 'inlined, shrunk' : `left out: ${s.reason}`;
    if (Buffer.byteLength(html) > SHARE_CAP) {
      html = changesHtml({ doc, points, meta, videos: '<h2>화면 동작</h2><p class="none">영상이 Artifact 한도를 넘어 로컬 compare.html에만 있다.</p>' });
      videosNote = 'left out: over the Artifact cap';
    }
  }
  const file = join(outDir, 'changes.html');
  writeFileSync(file, html);
  const bytes = Buffer.byteLength(html);
  return { file, kb: Math.round(bytes / 1024), fits_artifact: bytes <= SHARE_CAP, points: points.length, videos: videosNote };
}

// Where the page is shown; the caller performs it.
export function showStep(res, host) {
  if (host === 'codex') return { via: 'codex', file: res.file, how: 'deliver.py publish --page (loop-report)' };
  if (host === 'claude' && res.fits_artifact) return { via: 'claude', file: res.file, how: 'publish with the Artifact tool' };
  return { via: 'local', file: res.file, why: host === 'claude' ? `changes.html is ${res.kb} KB, over the Artifact cap` : 'no Codex or Claude session' };
}

const USAGE = `usage: changes.mjs <out-dir> --base <ref> [--host codex|claude]
Run from the repository root. Reads <out-dir>/changes.json (and summary.json from
record.mjs when present) and writes <out-dir>/changes.html.`;

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const [outDir] = args;
  if (!outDir || outDir === '--help' || !opt('--base')) { console.log(USAGE); process.exit(outDir === '--help' ? 0 : 2); }
  try {
    const res = build({ outDir: resolve(outDir), base: opt('--base') });
    console.log(`pr-visual: ${res.points} change points, videos ${res.videos}, ${res.file} (${res.kb} KB)`);
    console.log(JSON.stringify({ pr_visual: showStep(res, opt('--host')) }));
  } catch (e) {
    console.error(`pr-visual: ${e.message}`);
    process.exit(1);
  }
}
