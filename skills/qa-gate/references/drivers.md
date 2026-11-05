# Scenario drivers

Every scripted scenario is a standalone file under `.qa/<unit>/scenarios/` that exits
0 on pass and non-zero on fail, reads the app address from `QA_BASE_URL`, and writes
its evidence into `QA_EVIDENCE_DIR`. It runs from the repository root, so it uses the
project's own dependencies. An assertion must fail when the acceptance criterion is
broken: check the visible result the criterion names, never only "the page loaded"
or "the command exited 0".

## web — Playwright (D7)

Use the project's `playwright` / `@playwright/test` when present; otherwise install it
as a dev dependency only with the user's consent, and fall back to `http` checks of the
same criterion until then. Chromium must be installed (`npx playwright install chromium`).

```js
// .qa/<unit>/scenarios/ac1-login-error.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const browser = await chromium.launch();
const page = await browser.newPage();
try {
  await page.goto(process.env.QA_BASE_URL + '/login');
  await page.fill('#email', 'nobody@example.com');
  await page.fill('#password', 'wrong');
  await page.click('button[type=submit]');
  const alert = page.getByRole('alert');
  await alert.waitFor({ timeout: 5000 });
  assert.match(await alert.innerText(), /invalid email or password/i); // AC-1 wording
  assert.equal(new URL(page.url()).pathname, '/login');               // stays on the page
} finally {
  await page.screenshot({ path: join(process.env.QA_EVIDENCE_DIR, 'final.png'), fullPage: true });
  await browser.close();
}
```

## http — fetch

```js
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const res = await fetch(process.env.QA_BASE_URL + '/api/items?limit=2');
const body = await res.json();
writeFileSync(join(process.env.QA_EVIDENCE_DIR, 'response.json'), JSON.stringify({ status: res.status, body }, null, 2));
assert.equal(res.status, 200);
assert.equal(body.items.length, 2);   // AC-3: limit is honoured
```

## cli — shell

```sh
#!/bin/sh
set -eu
out="$QA_EVIDENCE_DIR/out.txt"
./bin/tool convert fixtures/in.csv --to json > "$out" 2>&1
grep -q '"rows": 3' "$out"              # AC-2: every row converted
! ./bin/tool convert missing.csv 2>"$QA_EVIDENCE_DIR/err.txt"
grep -q 'not found' "$QA_EVIDENCE_DIR/err.txt"   # AC-4: clear error, non-zero exit
```

No `app` block is needed for a CLI; omit it from `plan.json`.

## tui — herdr `hc`

Only when a TUI must be driven interactively and `hc` is on PATH:

```sh
#!/bin/sh
set -eu
t="qa-tui-$$"                                   # --name makes the address known
hc run --bg --name "$t" --rm -- ./bin/app
trap 'hc kill "$t" >/dev/null 2>&1 || true' EXIT
hc wait "$t" --output 'Main menu'
hc keys "$t" down enter
hc wait "$t" --output 'Settings'
hc read "$t" > "$QA_EVIDENCE_DIR/screen.txt"
grep -q 'Theme: dark' "$QA_EVIDENCE_DIR/screen.txt"   # AC-5
```

Screen reading is acceptable here because the screen *is* the behaviour under test;
it is never used to pass data between agents.

## judged

A criterion no command can decide (layout looks right, copy reads naturally) becomes
`kind: judged` with `why_judged`. The QA agent captures the evidence (screenshot, output)
under `evidence/<id>/` and states its observation; the ledger carries it as a manual gate
whose evidence is the user's answer. A judged scenario never counts as passed by itself.
