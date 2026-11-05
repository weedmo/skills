---
name: qa-gate
description: "Behavioural QA node: turn acceptance criteria into scenarios that drive the real app (Playwright for web, fetch for HTTP, shell for CLI, herdr hc for TUI), keep them as re-runnable scripts with evidence, and pass only when every scripted scenario passes on a fresh run. Library-only work is recorded as N/A. Called by matt-auto step 9 before review-gate; not for standalone feature work."
---

# qa-gate

Command checks (test / build / lint) prove the code compiles and its tests agree with
it. qa-gate proves the **acceptance criteria hold in the running app**, and leaves
scripts any later run can repeat. Everything lives under `.qa/<unit>/` (kept out of git
with `.git/info/exclude`).

## Inputs

- Acceptance criteria — the spec's `## 수용 기준` and the tickets' acceptance lists, with ids.
- `unit`, `writer` (as in review-gate), and the repository's run instructions: a project
  run skill, README, `package.json` scripts, Makefile, or compose file.

## Steps

1. **Detect the surface** — `web`, `http`, `cli`, `tui`, or `library`. Library means no
   entry point a user runs (no bin, server, UI); record the evidence as `na_reason`,
   write `plan.json` with `"surface": "library"`, and stop: command verification covers it.
2. **Route** — `gate-route.mjs --role qa-author --writer <w>` for writing scenarios and
   `--role qa-triage` for reading failures (`$model-routing`). Use the returned model;
   QA re-runs need none.
3. **Plan and write** — the QA author (fresh context, the routed model) writes
   `.qa/<unit>/plan.json` ([schema](schemas/plan.schema.json)) with at least one scenario per
   acceptance criterion, and one script per scripted scenario under `scenarios/` following
   [drivers](references/drivers.md). Each assertion must fail if its criterion is broken.
   A criterion no command can decide becomes `kind: judged` with `why_judged`.
4. **Run** — the coordinator runs, itself, from the repository root:
   `node <qa-gate>/scripts/run-scenarios.mjs .qa/<unit>`. It starts the app, waits for
   ready, runs the scripts with `QA_BASE_URL` / `QA_EVIDENCE_DIR`, stops the app, writes
   `result.json`, and prints `qa-gate: PASS …` or `qa-gate: FAIL — <ids>`.
5. **Fail → fix** — the triage model summarizes each failure from `result.json` and the
   evidence: scenario, criterion, expected vs actual, evidence paths. That goes to the
   writer's implementation route, never to the QA author. A broken scenario script (not
   the app) goes back to the QA author once. At most two fix rounds; then the unit stops
   as `⛔` with the failing scenario ids and their output.
6. **Judged** — for each judged scenario, capture the evidence and add a manual gate.

## Gates

```
CHECK: node <qa-gate>/scripts/run-scenarios.mjs .qa/<unit>
EXPECT: qa-gate: PASS
CWD: <repo root relative to the ledger>
```

plus one manual gate per judged scenario (`$loop-gates`), its evidence the user's answer
after seeing `evidence/<id>/`. After review-gate fixes, re-run the CHECK. `.qa/` is not in
the git diff, so hand `.qa/<unit>/scenarios/` to review-gate's reviewer prompt: weak
assertions get reviewed like code.

## Report data

Add one `review.passes` entry before review-gate's: `{"id": "qa", "name": "QA", "status",
"findings": <failed scenarios>, "reviewer": "<surface> · <passed>/<total>[ · judged <n>]",
"note": "<status line or N/A reason; evidence in .qa/<unit>/evidence>"}`.

## Red flags

- A scenario that only checks the page loads or the exit code — it cannot fail.
- Passing on the QA agent's word instead of the coordinator's own run.
- Editing a scenario to make it pass when the app is wrong.
- Counting a judged scenario as passed without the user's answer.
