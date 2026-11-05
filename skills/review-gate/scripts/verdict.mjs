#!/usr/bin/env node
// Gate CHECK for review-gate: PASS only when verdict.json says PASS for the
// commit that is HEAD now. Any later commit makes the review stale.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { headSha } from './rounds.mjs';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: verdict.mjs <review-dir>   (run from the repository root)');
  process.exit(2);
}
const path = join(dir, 'verdict.json');
const fail = why => { console.log(`review-gate: UNMET — ${why}`); process.exit(1); };
if (!existsSync(path)) fail(`no ${path}`);
const v = JSON.parse(readFileSync(path, 'utf8'));
const head = headSha(process.cwd());
if (v.status !== 'PASS') fail(`status ${v.status}${v.reasons?.length ? ': ' + v.reasons.join('; ') : ''}`);
if (v.reviewed_sha !== head) fail(`stale: reviewed ${String(v.reviewed_sha).slice(0, 8)}, HEAD is ${head.slice(0, 8)}`);
console.log(`review-gate: PASS (${v.rounds} round(s), cross_model ${v.cross_model}, ${v.minor?.length ?? 0} minor left)`);
