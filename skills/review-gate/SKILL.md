---
name: review-gate
description: "Cross-model review node: a reviewer from the other model family reviews a diff, the writer triages and fixes, the reviewer re-checks, at most N cycles. The verdict is a file bound to the reviewed commit and checked as one unlazy gate. Called by matt-auto step 9 and autocode before its PR; also runs standalone as `review-gate <base> [--spec PATH] [--cycles N]` for any branch."
---

# review-gate

A review loop with a fixed shape: **the writer never reviews its own work**, every
handoff is a JSON file under `.review/<unit>/`, and the result counts only for the
commit it reviewed. herdr is optional and only makes the reviewer visible.

## Inputs

- `base` — the fixed point; the range is `git diff <base>...HEAD`. Resolve it with
  `git rev-parse` and stop on an empty diff.
- `unit` — a short slug (`matt-auto-<spec slug>`, `autocode-<slug>`, or the branch name standalone).
- `writer` — `claude`, `codex`, `mixed` or `unknown`, from the loop's dispatch history
  (implementation and fix routes, retries included). Standalone: the current session's family.
- `spec` — optional fidelity reference; `deep` — true when any ticket in range is `[deep]`.
- `max_cycles` — default 2 (matt-auto), 1 for autocode.

Keep `.review/` and `.qa/` out of git with `.git/info/exclude`, never the user's `.gitignore`.

## Loop

1. **Route** — `node <model-routing>/scripts/gate-route.mjs --role review --writer <w> --base <base> [--deep] [--triage .review/<unit>/triage-<n-1>.json]`.
   It returns the reviewers (family, model, effort, Codex agent role), `escalated`,
   `cross_model` and `reasons`. Use exactly those reviewers; never pick a model yourself.
   Put `reasons` on the board.
2. **Review round n** — run every routed reviewer in parallel with
   [the reviewer prompt](references/reviewer-prompt.md), each writing its own output file.
   Then merge: `node <review-gate>/scripts/rounds.mjs merge .review/<unit> <n> <outputs…>`.
   Findings both families raise land once with `agreed_by` naming both.
3. **Decide** — `node <review-gate>/scripts/rounds.mjs decide .review/<unit> --writer <w> --max-cycles <N>`
   writes `verdict.json` for HEAD and prints `review-gate: PASS | CONTINUE | STOP`.
   - `PASS` → done. Minor findings are listed in the report, never block.
   - `STOP` → hand off with the open findings and the reasons (cycles exhausted, or a
     finding returning after fixes). Never mark the unit done.
   - `CONTINUE` → step 4.
4. **Triage and fix** — the writer (the coordinator, not the reviewer) writes
   `.review/<unit>/triage-<n>.json`: `{"round": n, "decisions": [{"id", "severity", "decision": "fix" | "reject", "reason"}]}`.
   A blocker/major in `agreed_by` of two families cannot be rejected (`decide` refuses).
   Fix through the loop's own implementation route, commit, then re-run the units'
   verification commands and `qa-gate`'s scripted scenarios when QA ran. Go to step 1
   with `n + 1`; a rejected blocker/major makes the next route escalate once.

## Gate

Add one gate to the unit's unlazy ledger (`$loop-gates`):

```
CHECK: node <review-gate>/scripts/verdict.mjs .review/<unit>
EXPECT: review-gate: PASS
CWD: <repo root relative to the ledger>
```

It passes only when `verdict.json` is `PASS` **and** `reviewed_sha` is the current HEAD,
so any commit after the review makes the gate UNMET until review-gate runs again.

## Report data

Add one `review.passes` entry per round: `{"id": "rg<n>", "name": "교차 리뷰 <n>", "status",
"findings": <blocker+major>, "reviewer": "<family:model/effort, …>", "cross_model", "escalated",
"agreed", "note": "<reasons>"}`. Standalone, print the verdict line, the reviewers, and the open
and minor findings with file:line.

## Red flags

- Choosing or upgrading a reviewer model by hand instead of `gate-route.mjs`.
- Reading a reviewer's terminal screen instead of its output file.
- A second escalation, or a third cycle, to "get it to pass" — that is the STOP.
- Treating `CONTINUE` or a delegate's "fixed" as the gate passing; only `verdict.mjs` decides.
