---
name: matt-auto
description: "Execute a confirmed local spec in this session: tickets in the log, implement and verify each in order, then QA and review by the other model family in parallel with at most two fix cycles. Use --spec PATH; design, user iteration and visualization belong to matt-design. Autonomous by default; --confirm requests a ticket-plan gate. --dev / --main / --pr BASE enable PR shipping with the As-Is / To-Be change-point page. --free uses free-only OpenCode routing."
disable-model-invocation: true
---

# Matt Auto

Execute a user-confirmed spec through tickets, implementation, verification,
parallel QA and review, and optional shipping. Invoking this skill with that spec
requests execution. Confirming a design in `$matt-design` alone does not start it.
This session writes everything; the [execution core](references/execution-core.md)
is the procedure — read it before any side effect.

## Rules

- Require `--spec <path>` (or an unambiguous supplied spec path) with frontmatter
  `status: confirmed`. Missing/draft/malformed input: explain the missing input
  and direct the user to `$matt-design`; do not interview or implement.
- Accept new `matt-design: 1` and legacy `design-map: 1` specs, including briefs
  (no `## 결정`). Read the whole contract, including constraints, decisions, scope,
  acceptance and verify steps. Resolve factual gaps from the repo; unresolved
  design choices return to the user. A legacy `mode: full` is ignored.
- User-approved design is read-only. Pin its path, revision when present, content
  hash and baseline commit in `docs/agents/matt-auto-log/<slug>.md`. Record every
  execution decision, verification, escalation and stage transition there. Do not
  invoke `$to-spec` or re-publish the source design as a different authoritative spec.
- No PR without a ship flag; never merge a PR.
- Shared runtime: `$model-routing`, `$qa-gate`, `$review-gate`, `$pr-visual`, `$loop-report` (`deliver.py` for the As-Is / To-Be page) and `$loop-gates`. Unavailable gates means report checks directly, never claim ledger verification.

## Steps

1. **Precondition** — validate and pin the confirmed spec before any side effects; record the full baseline commit (`git rev-parse HEAD`). Recheck the spec hash before implementing and at completion; a changed spec stops the run until its new revision is confirmed and explicitly adopted. In ship mode prepare the PR branch first (Ship mode).
2. **Probe** — note on the board which CLIs `$qa-gate` and `$review-gate` can use (the rule table sends Codex-written code to Claude; with one family installed review falls back to a same-family fresh-context reviewer and records `cross_model: false`), the lookup route (`gate-route.mjs --role lookup --host codex`), and whether hc is available for babysitting (`$hc-workers` probe; else `hc unavailable: <why>` once). `--free` selects free-only routing on OpenCode; elsewhere report that it has no route and continue.
3. **Tickets** — write them into the log per the execution core. With `--confirm`, show the ticket list and wait for the user's go; otherwise continue.
4. **Implement and verify** — one ticket at a time in this session, per the execution core. Lookups whose path you do not need take the lookup route.
5. **QA and review** — `$qa-gate` and `$review-gate` in parallel, per the execution core: start the QA author and the reviewer together as two background runs, wait for both, triage and fix here, at most two cycles. Never end the turn while either runs; a wait timeout is a checkpoint, not completion.
6. **Report** — the terminal board and one final summary (Report).
7. **Ship (ship flag only)** — otherwise mark `⏭️ no --pr`. Ship ledger (when unlazy is installed) → verify the PR condition → `$pr-visual` → push and open the PR → visible hc `$pr-babysit` worker to merge-ready (in-session only when hc is unavailable) → `--reverify` the ship ledger → report. Never merge. Details in Ship mode.

## Progress board

One markdown table, identical on every platform, printed at start, at every stage transition, on every escalation, and on every ticket state change:

| # | Stage | Skill / route | Status |
|---|---|---|---|
| 1 | Precondition | pinned spec | ✅ |
| 2 | Probe | claude ok · lookup grok · hc ok | ✅ |
| 3 | Tickets | log · 3 tickets | ✅ |
| 4 | Implement + verify | in-session · T2 3/4 | 🔄 |
| 5 | QA ∥ review | `$qa-gate` · `$review-gate` | ⏳ |
| 6 | Report | git diff --numstat | ⏳ |
| 7 | Ship | pr-visual → pr-babysit | ⏭️ no --pr |

Statuses: `✅` done · `🔄` in progress with a short note (`cycle 2/2: QA 1 fail`) · `⏳` pending · `⏭️` skipped with why · `⛔` stopped with the checkable fact. During step 4 add a ticket board — Ticket · Checks (`passed/total` on your latest run) · Commits · Status. During step 5 add one row per gate with its cycle and finding count. Step 7's note carries the ship ledger tally. The board is display only: never a file, never a stage's output, never restyled per platform.

## Report

Measure, never estimate: `git diff --numstat <baseline>..HEAD` and `git diff --name-status` (the PR branch tip in ship mode), `docs/agents/matt-auto-log/**` and `.unlazy/**` left out, one Korean line per file. Then a short terminal report: the headline counts, tickets completed, each verification result, the QA and review verdicts with their cycles, the As-Is / To-Be page route and PR URL in ship mode, unresolved decisions when any remain, and the retro candidates.

## Ship mode (`--dev` / `--main` / `--pr <base>`)

`--dev` targets `dev`, `--main` targets `main`, `--pr <base>` any base; without one, no PR ever.

- **PR branch.** Implementation never lands on the base: if the current branch *is* the base, create `matt-auto/<slug>` and check it out; keep an existing feature branch. The name is part of the ship plan.
- **PR condition.** Default: every ticket's verification commands pass on your own run, QA and review passed, and nothing escalated. A condition the user stated anywhere ("only after the full suite passes") replaces or extends the default: write it into the ship plan, encode it as gates, verify before opening, never open while unmet — if it cannot be met, stop at `⛔`, report, hand off. Satisfaction is measured; ambiguous → ask the user.
- **Ship ledger (unlazy installed).** Before opening the PR write `.unlazy/matt-auto/ship.GATES.md`: *PR condition* — G1 every ticket's verification commands pass on the PR branch tip (one gate per ticket: `CHECK:` its commands, `EXPECT:` their pass indicator), G2 one gate per user-stated condition; *Merge-ready* — G3 the PR exists against the base (`gh pr view <branch> --json baseRefName`), then pr-babysit's three gates with its commands: G4 required checks, G5 `mergeable == MERGEABLE`, G6 no changes requested. A condition no command can decide is a manual gate whose evidence is the user's explicit answer. Approve the ledger yourself; fill `<pr>` after opening; `--reverify` before opening (PR-condition group MET), after every babysit cycle, and before reporting. G4 red → babysit's fix cycle, G5 → the conflict bullet, G6 → address the review. A stop that is not merge-readiness becomes `ABANDON: <id> <reason>`.
- **As-Is / To-Be, open, babysit, resolve.** Run `$pr-visual` and deliver its page with `deliver.py` before the PR. Push the PR branch (plain push, never force), `gh pr create --base <base>` with the title from the spec and the body per the execution core. Invoke `$pr-babysit` as written, as a visible hc worker on the Fast route (`ROUTED_EXECUTION=1; use $pr-babysit on PR <n> and shepherd it to merge-ready`); its stop conditions apply, and a stop that is not merge-ready ends step 7 as a handoff with the URL and unmet items. On unmergeable, `git merge origin/<base>` in an isolated worktree, pr-babysit's [merge conflicts](../pr-babysit/references/merge-conflicts.md) with `ROUTED_EXECUTION=1` on Default/Deep by conflict intent (`matt-free` in free mode; if unavailable, stop rather than pay), checks, commit, plain push; never rebase, force-push, or resolve in the caller's checkout; repeat within babysit's cycle bound if the base moves again.
- **Merge-ready, not merged.** With the ship ledger, proven by *your own* `--reverify` printing `ALL MET`; without it, run and record every equivalent PR-condition and merge-readiness check yourself; pr-babysit's report is input and the ledger wins a disagreement. matt-auto never merges.
- **Routing.** Opening the PR → coordinator tools; babysit → visible Fast worker; mechanical conflicts → Default; semantic conflicts → Deep. Unavailable routes follow `$model-routing`; never inherit unknown defaults.
- **Report** adds: the As-Is / To-Be page route, PR URL, base, PR condition and how it was verified, ship ledger tally, babysit cycles and commits, final check state, merge-ready or not.

## Fallback

- One model family installed: same-family review and QA author as `$review-gate` and `$qa-gate` say, said once on the board.
- hc unavailable: `$pr-babysit` runs in-session, said once.
- Shared weed-harness skill missing: see Rules.
