---
name: matt-auto
description: "Execute a confirmed local spec: create tickets, implement, verify, and independently review with bounded fix cycles. Use --spec PATH; design and user iteration belong to matt-design, visualization to design-map. Autonomous by default; --confirm requests a ticket/execution-plan gate. --dev / --main / --pr BASE enable PR shipping; --parallel N caps concurrency. --on MACHINE selects hc placement; --free uses free-only OpenCode routing."
disable-model-invocation: true
---

# Matt Auto

Execute a user-confirmed spec through tickets, implementation, verification,
independent review, and optional shipping. Invoking this skill with that spec
requests execution. Confirming a design in `$matt-design` alone does not start it.

## Rules

- Require `--spec <path>` (or an unambiguous supplied spec path) with frontmatter
  `status: confirmed`. Missing/draft/malformed input: explain the missing input
  and direct the user to `$matt-design`; do not interview, ticket, or implement.
- Accept new `matt-design: 1` and legacy `design-map: 1` specs. Read the whole
  contract, including constraints, decisions, scope, acceptance and verify steps.
  Resolve factual gaps from the repo; unresolved design choices return to the user.
- User-approved design is read-only. Pin its path, revision when present, content
  hash and baseline commit in `docs/agents/matt-auto-log/<slug>.md`. Record every
  execution decision, verification, escalation and stage transition there,
  including `--confirm` runs. The hash pins legacy specs without revisions.
- Use the stage skills within this execution scope: routine ticket breakdown
  questions go to the delegate; user design choices do not. Implementing an
  already approved choice is not a new escalation. Do not invoke `$to-spec`
  or re-publish the source design as a different authoritative spec.
- No PR without a ship flag; never merge a PR. Preserve routing, coordinator-run
  verification, isolated workers, retry bounds and measured reports below.
- Read the [execution core](references/execution-core.md) before any side effect: frontier dispatch, worker contract, coordinator merge, QA/review with fix workers, PR body, retro candidates, Change control, red flags.
- Shared runtime: `$model-routing`, `$interview-report`, `$loop-report`, and `$loop-gates`. Missing routing stops dispatch; unavailable page delivery falls back to the local report; unavailable gates means report checks directly, never claim ledger verification.
## Pipeline

1. **Precondition** — validate and pin the confirmed spec before any side effects; record the full baseline commit (`git rev-parse HEAD`). Recheck the spec hash before dispatch and at completion; a changed spec pauses affected work until its new revision is confirmed and explicitly adopted. Missing `docs/agents/issue-tracker.md` → `$setup-matt-pocock-skills` for the execution tracker only. Apply pending report edits under Change control. Prepare the feature branch before workers start in ship mode.
2. **Select routing and probe** — routing is automatic on Codex, OpenCode, and Claude Code (Model routing); never ask for an effort there. `--free` selects free-only routing on OpenCode; elsewhere report that it has no route and continue. Without an enforceable allowed pair, stop dispatch and report it. Probe hc: run `hc ls --json`; if it fails, print `hc unavailable: <why>` and run one ticket at a time — never another parallel mechanism. Have `$interview-report` **probe** report delivery and put its answer on the board (`Report delivery: open` / `path — <why>`). Delivery is `deliver.py`'s job; matt-auto never opens the page itself.
3. **Prepare answer routing** — read [answer-routing](references/answer-routing.md). Before each question, select `matt-answer` or `matt-answer-deep` by difficulty; reuse only while the route matches. Supply the confirmed spec summary, evidence, constraints, and latest decision log. Include `## 큰 틀` and settled `## 결정`; cite existing D-ids and return `ESCALATE: contradicts <D-id>` for unresolved reversals. Free-only/Claude routes follow the reference.
4. **Load design** — populate the report's read-only `design` stage from the spec's D-ids and show interview as `⏭️ confirmed spec`. There is no interview or design gate here, even with `--confirm`. Keep the source spec unchanged.
5. **Size work** — choose ticket granularity from the implementation steps. Small work becomes one ticket and one visible hc worker when available; it still receives verification and independent review. Never skip review based on size.
6. **Spec reference** — retain the local path, revision/hash, acceptance criteria and D-ids as the authority. Link them from the ticket context; do not run `$to-spec` again.
7. **Tickets** — run only `$to-tickets` gather/explore/draft/quiz against the confirmed spec; defer its publication stage to step 8; its breakdown quiz goes to the execution delegate, which may split/order work but cannot change the design. Include acceptance criteria, concrete verification commands and expected results per ticket; carry manual criteria explicitly. Plan the task graph, its forecast waves and estimates. On resume reconcile existing ticket references from the log instead of publishing duplicates.
8. **Execution plan** — record tickets, dependencies, routes, concurrency, placement, review and optional ship plan, then publish tickets and the report. Invocation authorizes these routine execution choices. Only `--confirm` holds publication/dispatch for a fresh user review of this concrete package. A design-changing objection follows change control, not delegate approval.
9. **Implement loop** — follow the [execution core](references/execution-core.md). A frontier ticket goes to a fresh-context subagent — "read ticket <ref>, then use $implement to build it; follow the pinned spec <path/revision/hash> and its D-ids; report open decisions back instead of guessing; defer $implement's code-review step to the coordinator, and commit only task-owned changes" plus the worker contract — on the route Model routing assigns, as a visible hc worker when available (Supervised execution). **Verification is yours.** Each ticket's acceptance criteria name its verification commands (test / build / lint, a check script); put them in the prompt as what "done" means. When the subagent returns, run them yourself — in each worker's checkout, including sequential tickets; the report is a signal, your run is the evidence. A failing command goes back to the same route with its output, at most twice; then the ticket stops as `⛔` with the failing command as its checkable reason and you escalate. Complete means every command passed on your run and each manual acceptance criterion has explicit evidence. Verification covers implementation only and never replaces escalation. **QA and review pass** after the last ticket merges, per the execution core, whatever the size. Then the final report, and step 10 in ship mode.
10. **Ship (ship flag only)** — otherwise mark `⏭️ no --pr`. Ship ledger (when unlazy is installed) → verify the PR condition → push and open the PR → visible hc `$pr-babysit` worker to merge-ready (in-session only when hc is unavailable) → conflicts via `$resolving-merge-conflicts` → `--reverify` the ship ledger → report. Never merge. Details in Ship mode.

## Coordinator continuity

Read [supervised execution](references/supervised-execution.md) before dispatch.
Status questions and orchestration notifications steer the active task; answer in
commentary, then resume processing/waiting in the same turn. Worker launch,
heartbeat, delivery acknowledgment, review launch and wait timeout are never
completion. Do not send a final answer saying only "working" or "reviewing".
Before final, reconcile all tickets, reviews, verification, shipping and worker
ownership. End only on verified completion, explicit user stop, or a concrete
blocker needing user input; name the unfinished work and live workers on a blocker.

## Progress board

One markdown table, identical on every platform, printed at start, at every stage transition, on every escalation, and on every ticket state change:

| # | Stage | Skill / route | Status |
|---|---|---|---|
| 1 | Precondition | setup-matt-pocock-skills | ✅ |
| 2 | Routing | matt-* (+ hc) | ✅ |
| 3 | Delegate | matt-answer / matt-answer-deep | ✅ |
| 4 | Load design | confirmed spec | ✅ |
| 5 | Size work | ticket granularity | ⏳ |
| 6 | Spec reference | pinned local spec | ✅ |
| 7 | Tickets | to-tickets | ⏳ |
| 8 | Execution plan | autonomous / --confirm | ⏳ |
| 9 | Implement loop | per-ticket routing | ⏳ |
| 9b | QA + review | `$qa-gate` · `$review-gate` | ⏳ |
| 10 | Ship | pr-babysit → Fast | ⏭️ no --pr |

Statuses: `✅` done · `🔄` in progress with a short note (the current question, `cycle 2/5: CI red`) · `⏳` pending · `⏭️` skipped with why (`autonomous`) · `⛔` waiting on an escalation, the gate, or an unmet PR condition. Skill / route names the vendored skill and, once known, the routed agent. During step 9 add a ticket board — Ticket · Route (model/effort) · Worker (dispatch id, worktree, environment; `—` in-session) · Checks (`passed/total` on your latest run) · Status. Step 10's note carries the ship ledger tally. Autonomous mode appends one stage-transition line per update to the decision log. The board is display only: never a file, never a stage's output, never restyled per platform.

**Every board update once tickets exist is also a republish**: hand `$interview-report` the regenerated data and let it build and publish; it keeps the route stable. Republish exactly when the board changes (stage transition, ticket status, verification result, escalation raised or answered) — not on a timer, not per commit. The data follows `$interview-report`'s contract: `blocked` only with `blocker.reason` and the checkable fact in `blocker.detail` (a failing command after retries, an escalation waiting, CI red, a merge conflict, a stopped worker), otherwise `pending` with `blockedBy`; `progress.current` is the board's `🔄` note; every ticket node carries route, model/effort, and for an hc worker terminal name and worktree; `estimateMin` at planning, `startedAt` / `actualMin` as tickets run, re-estimated only when you learned something; `review` in the review pass, `pr` in ship mode; per-ticket `acceptance`, `steps`, `gateList` (each command, expected-vs-actual), `files`, `commits` in the detail. "No link" never becomes "no report".

## Model routing (Codex, OpenCode, Claude Code)

Tiers, pairs, dispatch, and the ladder live in **`$model-routing`**. matt-loop's roles:

| matt role | Tier | Claude Code agent | Use |
|---|---|---|---|
| `matt-fast` | Fast | `matt-loop:matt-default` | Trivial edits |
| `matt-default` | Default override: Luna max | `matt-loop:matt-default` | Small fixes, tests, mechanical conflicts |
| `matt-batch` / `matt-standard` | Background / Standard | `matt-loop:matt-default` | Waiting acceptable / moderate time-sensitive work |
| `matt-deep` | Deep | `matt-loop:matt-deep` | Complex implementation and semantic conflicts |
| `matt-answer` / `matt-answer-deep` | Answer / hard answer | `matt-loop:matt-deep` | Questions and decisions only |
| `matt-large-context` | Large context | `matt-loop:matt-deep` chunks | OpenCode: Gemini priority |
| `matt-free` / `matt-free-fast` | free-only (OpenCode) | — | `--free` only; never mix a paid route in |

For OpenCode large-context dispatch, read model-routing's `references/gemini-priority.md`: strongest Gemini/max thinking, Codex continuation on quota exhaustion. Elsewhere chunk on Deep.

A `--spec` step tagged `[deep]` selects Deep; `[default]` starts at Default, Fast for trivial work, Background only when waiting is acceptable. Classify untagged work by need and latency. Execution retries follow `$model-routing`; answer selection/retries follow the answer-routing reference.

## Delegate brief and escalation

Apply [answer-routing](references/answer-routing.md) to every new question, including follow-ups. Record the chosen role/effort and reason with its decision and rationale; a previous xhigh answer never fixes the next question's route. Return `ESCALATE: <why>` for unresolved changes to security, data meaning, migrations, destructive scope, external interfaces, or the big frame. Implementing an already approved choice is not a new escalation.

On a material decision, follow Change control before resuming affected work. Never substitute a delegate answer for user confirmation.

## Decision-graph report

Execution progress and decisions appear on the `$interview-report` page at `docs/agents/matt-auto-log/<slug>.html` — stages in order, decisions as editable nodes, escalations highlighted.

- **Generate** it after loading the confirmed design; **regenerate** on every board update once tickets exist; **regenerate last** with the `outcome` block and `progress.state: "done"` — after step 9's loop and your own verification run, or after step 10 in ship mode. Only after all required checks and independent review pass; unresolved findings or an unfinished ship step remain blocked, never done.
- **Round-trip.** Read `<slug>.edits.json` at startup and when the user reports edits. Apply Change control; pending design edits pause affected work and are not silently consumed. On Claude Code read Artifact comments when notified and preserve unresolved threads. Republish the same report after resolution.
- **Final report: measure, never estimate.** `git diff --numstat <baseline>..HEAD` and `git diff --name-status` (the PR branch tip in ship mode) fill `outcome` per interview-report's spec, one Korean line per file, `docs/agents/matt-auto-log/**` and `.unlazy/**` left out. Then a short terminal report: the link (or tab + path) first, the headline counts, tickets completed, verification results, the Run id and dispatch ids when workers ran — include unresolved decisions when any remain, and the retro candidates.

## Ship mode (`--dev` / `--main` / `--pr <base>`)

`--dev` targets `dev`, `--main` targets `main`, `--pr <base>` any base; without one, no PR ever.

- **PR branch.** Implementation never lands on the base: if the current branch *is* the base, create `matt-auto/<slug>` and check it out; keep an existing feature branch. The name is part of the ship plan. All `$implement` subagents commit there.
- **PR condition.** Default: every ticket's verification commands pass on your own run and nothing escalated. A condition the user stated anywhere ("only after the full suite passes", "after #12–#14, leave #15") replaces or extends the default: write it into the ship plan, encode it as gates, verify before opening, never open while unmet — if it cannot be met, stop at `⛔`, report, hand off. Satisfaction is measured, never the delegate's call; ambiguous → escalate.
- **Ship ledger (unlazy installed).** Before opening the PR write `.unlazy/matt-auto/ship.GATES.md`: *PR condition* — G1 every ticket's verification commands pass on the PR branch tip (one gate per ticket: `CHECK:` its commands, `EXPECT:` their pass indicator), G2 one gate per user-stated condition; *Merge-ready* — G3 the PR exists against the base (`gh pr view <branch> --json baseRefName`), then pr-babysit's three gates with its commands: G4 required checks, G5 `mergeable == MERGEABLE`, G6 no changes requested. A condition no command can decide is a manual gate whose evidence is the user's explicit answer. Approve the ledger yourself; fill `<pr>` after opening; `--reverify` before opening (PR-condition group MET), after every babysit cycle, and before reporting. G4 red → babysit's fix cycle, G5 → the conflict bullet, G6 → address the review. A stop that is not merge-readiness becomes `ABANDON: <id> <reason>`.
- **Open, babysit, resolve.** Push the PR branch (plain push, never force), `gh pr create --base <base>` with the title from the spec and the body per the execution core. Invoke `$pr-babysit` as written, as a visible hc worker on the Fast route (`ROUTED_EXECUTION=1; use $pr-babysit on PR <n> and shepherd it to merge-ready`); its stop conditions apply, and a stop that is not merge-ready ends step 10 as a handoff with the URL and unmet items. On unmergeable, `git merge origin/<base>` in the isolated worktree, `$resolving-merge-conflicts` with `ROUTED_EXECUTION=1` on Default/Deep by conflict intent (`matt-free` in free mode; if unavailable, stop rather than pay), checks, commit, plain push; never rebase, force-push, or resolve in the caller's checkout; repeat within babysit's cycle bound if the base moves again.
- **Merge-ready, not merged.** With the ship ledger, proven by *your own* `--reverify` printing `ALL MET`; without it, run and record every equivalent PR-condition and merge-readiness check yourself; pr-babysit's report is input and the ledger wins a disagreement. matt-auto never merges.
- **Routing.** Opening the PR → coordinator tools; babysit → visible Fast worker; mechanical conflicts → Default; semantic conflicts → Deep. Unavailable routes follow `$model-routing`; never inherit unknown defaults.
- **Report** adds: PR URL, base, PR condition and how it was verified, ship ledger tally, babysit cycles and commits, final check state, merge-ready or not.

## Supervised execution (automatic)

Step 2 probes hc; step 7 plans the task graph; step 9 dispatches visible workers
for every frontier ticket, including sequential tickets, one-ticket work and review fixes.
Independent reviews and babysitting are visible hc terminals too.
Read [supervised execution](references/supervised-execution.md) for the placement,
wait loop, lifecycle recovery and final-answer boundary.

`--parallel N` (default 2, max 4) limits active
workers; it never selects invisible execution. `--on <machine>` selects placement.
Read `hc --skill`, the live manual, before the first command. Name every
terminal after the run and its ticket. Keep the integration branch and pinned spec
in every brief; record each terminal's name, id and worktree from `hc run`'s answer.
Use `hc-worker-prompt.md` for implementation only.

Start every frontier task up to the cap before waiting. On each reported worker,
validate its result, apply the coordinator merge, and dispatch what became
ready before waiting again. Reviews inspect the pinned
candidate read-only and never merge. Apply the same retry bounds as step 9.

A timeout, heartbeat or status question is a checkpoint, never a reason to finish.
Resume a yielded wait rather than starting a second one.
After processing a report, wait again while work remains.
Never kill a working terminal or treat its exit as success. hc owns terminal
lifecycle; coordinator verification owns acceptance. Reconcile both before final.

With hc unavailable, clearly label the in-session sequential fallback and its
probe error. An explicit requirement for visible hc terminals instead blocks
dispatch until available. Answer delegates may remain in-session.

## Fallback

- No subagents: report the unavailable implementation/review route; do not claim independent review or execute an interview fallback.
- Delegate lost mid-pipeline: respawn it with the Q&A log so far.
- Shared weed-harness skill missing: see Rules.
