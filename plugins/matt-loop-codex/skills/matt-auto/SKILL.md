---
name: matt-auto
description: "Conducts interview, spec, tickets, and implementation for an already-discussed idea. Not for small work: a one-file change under thirty minutes is faster with `$implement` directly. Unattended by default: a decision delegate answers routine questions, unresolved material decisions escalate, and every decision lands in an editable decision-graph page. Flags: `--spec <path>` starts from a confirmed design-map spec; `--confirm` restores human gates; `--free` free-only OpenCode routing; `--dev` / `--main` / `--pr <base>` open and shepherd a PR; `--parallel N` / `--on <env>` override Orca worker concurrency and placement."
disable-model-invocation: true
---

# Matt Auto

Coordinate Matt Pocock's flow from idea through implementation and optional shipping using the stage skills below.

The user settles the big frame before invoking this. A persistent decision delegate handles routine implementation choices; unresolved material decisions go to the user. The decision graph accepts user corrections. No PR without a ship flag; independent tickets use Orca workers when available.

## Rules

- Use stage skills within the user's scope. Explicit user instructions override skill guidelines; reuse approval and settled decisions. Explain any required pause with the exact instruction and unresolved choice.
- A sub-skill's question to "the user" — interview, seam check, ticket quiz — goes to the delegate unless it is material. Discoverable facts are looked up, never asked.
- No gates or scores the vendored skills don't define. Artifacts are theirs (`CONTEXT.md`/ADRs, the spec on the tracker, tickets) plus exactly two matt-auto reports: the decision log and the `$interview-report` page (its edits round-trip and its link or tab are delivery of that page). The ship ledger under `.unlazy/` is working state; the PR is pr-babysit's artifact.
- The shared weed-harness skills are the runtime: `$model-routing` (tiers), `$loop-report` (page build and delivery, through `$interview-report`), `$loop-gates` (the ship ledger). If one is missing, say `weed-harness 4.x required: <skill> missing` once and use the fallback it names (platform subagent for every role; decision log as the only report; no ship ledger). Never reimplement them inline.

## Pipeline

1. **Precondition** — record the baseline commit (`git rev-parse --short HEAD`) in the decision log. With `--spec <path>`, read the spec first: frontmatter `status` other than `confirmed` → print `spec not confirmed: run /design-map first` and stop; otherwise the log opens with `spec: <path>` and `artifact: <url>`. Missing `docs/agents/issue-tracker.md` → run `$setup-matt-pocock-skills`. Apply an existing `<slug>.edits.json` first (Decision-graph report).
2. **Select routing and probe** — routing is automatic on Codex, OpenCode, and Claude Code (Model routing); never ask for an effort there. `--free` selects free-only routing on OpenCode; elsewhere report that it has no route and continue. With neither named agents nor model overrides, use **high** (ask only with `--confirm`). Probe Orca: `orca status --json`, then `orca orchestration run-list --json`; on `bad option: --no-sandbox` use `orca-ide` for the rest of the run; if both fail, print `Orca unavailable: <why>` and plan every wave sequential — never another parallel mechanism. Have `$interview-report` **probe** report delivery and put its answer on the board (`Report delivery: link` / `tab — <why>` / `path — <why>`). Delivery is `deliver.py`'s job; matt-auto never runs `orca artifacts`, `tab`, or `reload`.
3. **Spawn the decision delegate** — one persistent Deep-route subagent (`matt-deep`; `matt-free` in free-only mode) with the big-frame summary, codebase access, and the delegate brief; on Codex `fork_turns: "none"`. Keep the same conversation across stages; with only one-shot subagents, carry the running Q&A log into each call. With `--spec`, the summary is the spec's `## 큰 틀` verbatim and its `## 결정` table is settled: the delegate closes any question the spec answers by citing the D-id, decides only the rest, and replies `ESCALATE: contradicts <D-id>` when a settled decision would have to be reversed.
4. **Interview** — `$grill-with-docs` in a codebase, `$grill-me` otherwise, each unresolved question with a recommended answer to the delegate; record question → decision + rationale; a runnable question detours via `$prototype`. Then run `$interview-report` on the log and evaluate the **interview gate** below. With `--spec` there is no interview — design-map's self-grill and the user's confirmation were it; the log opens with the spec's 결정 table as the read-only `design` stage, the interview stage reads `⏭️ design-map spec`, and the gate is passed by the spec. Open questions reach the delegate from later stages; one reversing a spec decision escalates as `design override <D-id>`; the spec file is never edited.
5. **Size branch** — fits one session (with `--spec`, one or two steps in its 구현 순서)? Then write the interview log to the decision log and go straight to `$implement` as an **in-session** routed subagent, never an Orca worker (with `--confirm`, present the interview log first). Then the review pass (step 9), the final report, and step 10 in ship mode.
6. **Spec** — `$to-spec`, seam check answered by the delegate; it publishes the spec as written (with `--spec`, the design spec is its context); a later confirm that changes decisions updates it.
7. **Tickets** — `$to-tickets` with its breakdown quiz answered by the delegate, iterated to approval, **publication held** until step 8. Then plan the execution — waves, an `estimateMin` per ticket (Parallel execution) — and republish the page with the plan before the run starts.
8. **Confirm (`--confirm` only)** — by default publish the tickets once the delegate approves the breakdown and write the confirm package to the decision log. With `--confirm`, present it — interview Q&A with rationales, escalations and answers, the spec reference, the ticket breakdown (title / blocked-by / delivers), the ship plan (branch → base, PR condition), the execution plan (waves with reasons, concurrency, placement, worktree naming, each ticket's route). Approval publishes; change requests rework from the affected stage and re-confirm.
9. **Implement loop** — a ticket whose blockers are done goes to a fresh-context subagent — "read ticket <ref>, then use $implement to build it; report open decisions back instead of guessing" — on the route Model routing assigns; a sequential wave one ticket at a time in-session, a parallel wave as concurrent Orca workers (Parallel execution). **Verification is yours.** Each ticket's acceptance criteria name its verification commands (test / build / lint, a check script); put them in the prompt as what "done" means. When the subagent returns, run them yourself — in the ticket's `matt-auto/<ticket>` worktree for a parallel ticket, in the checkout for a sequential one; the report is a signal, your run is the evidence. A failing command goes back to the same route with its output, at most twice; then the ticket stops as `⛔` with the failing command as its checkable reason and you escalate. Complete means every command passed on your run. Verification covers implementation only and never replaces escalation. **Review pass** after the last ticket: `$code-review` over `<baseline>..HEAD` (not per ticket); Codex uses Sol reviewers; record each dimension as a `review.passes` entry with its finding count, fix what it confirms, re-run the affected tickets' commands. Then the final report, and step 10 in ship mode.
10. **Ship (ship flag only)** — otherwise mark `⏭️ no --pr`. Ship ledger (when unlazy is installed) → verify the PR condition → push and open the PR → `$pr-babysit` in-session to merge-ready → conflicts via `$resolving-merge-conflicts` → `--reverify` the ship ledger → report. Never merge. Details in Ship mode.

## Progress board

One markdown table, identical on every platform, printed at start, at every stage transition, on every escalation, and on every ticket state change:

| # | Stage | Skill / route | Status |
|---|---|---|---|
| 1 | Precondition | setup-matt-pocock-skills | ✅ |
| 2 | Routing | matt-* (+ Orca run_7c…) | ✅ |
| 3 | Delegate | matt-deep | ✅ |
| 4 | Interview | grill-with-docs → delegate | 🔄 Q7: error-handling seam |
| 5 | Size branch | — | ⏳ |
| 6 | Spec | to-spec | ⏳ |
| 7 | Tickets | to-tickets | ⏳ |
| 8 | Confirm | human | ⏳ |
| 9 | Implement loop | per-ticket routing | ⏳ |
| 9b | Review pass | `$code-review` | ⏳ |
| 10 | Ship | pr-babysit → matt-default | ⏭️ no --pr |

Statuses: `✅` done · `🔄` in progress with a short note (the current question, `cycle 2/5: CI red`) · `⏳` pending · `⏭️` skipped with why (`small path`, `autonomous`) · `⛔` waiting on an escalation, the gate, or an unmet PR condition. Skill / route names the vendored skill and, once known, the routed agent. Small path: 6–9 read `⏭️ small path`. During step 9 add a ticket board — Ticket · Route (model/effort) · Worker (dispatch id, worktree, environment; `—` in-session) · Checks (`passed/total` on your latest run) · Status. Step 10's note carries the ship ledger tally. Autonomous mode appends one stage-transition line per update to the decision log. The board is display only: never a file, never a stage's output, never restyled per platform.

**Every board update once tickets exist is also a republish**: hand `$interview-report` the regenerated data and let it build and publish; it keeps the route (link or tab) stable. Republish exactly when the board changes (stage transition, ticket status, verification result, escalation raised or answered) — not on a timer, not per commit. The data follows `$interview-report`'s contract: `blocked` only with `blocker.reason` and the checkable fact in `blocker.detail` (a failing command after retries, an escalation waiting, CI red, a merge conflict, a stopped worker), otherwise `pending` with `blockedBy`; `progress.current` is the board's `🔄` note; every ticket node carries route, model/effort, and for an Orca worker dispatch id and worktree; `estimateMin` at planning, `startedAt` / `actualMin` as tickets run, re-estimated only when you learned something; `review` in the review pass, `pr` in ship mode; per-ticket `acceptance`, `steps`, `gateList` (each command, expected-vs-actual), `files`, `commits` in the detail. "No link" never becomes "no report".

## Model routing (Codex, OpenCode, Claude Code)

Tiers, pairs, dispatch, and the ladder live in **`$model-routing`**. matt-loop's roles:

| matt role | Tier | Claude Code agent | Use |
|---|---|---|---|
| `matt-default` | Default | `matt-loop:matt-default` | Ordinary tickets, small fixes, the babysit coordinator; the default when both are plausible |
| `matt-deep` | Deep | `matt-loop:matt-deep` | The decision delegate, hard tickets, conflict resolution |
| `matt-large-context` | Large context | chunk via `matt-deep` | Gemini on OpenCode; chunked Deep elsewhere |
| `matt-free` / `matt-free-fast` | free-only (OpenCode) | — | `--free` only; never mix a paid route in |

A `--spec` step tagged `[deep]` / `[default]` fixes its ticket's tier; otherwise classify each ticket from what it needs, lowest clearly sufficient tier; `matt-default` reporting the task beyond it → retry once on `matt-deep`; `matt-deep` reporting the same → Codex retries once on `matt-deep-max` using the replacement-agent handoff in `$model-routing`, other platforms stop the ticket as a handoff. Use that skill's running-message versus idle-follow-up rules for persistent roles.

## Delegate brief and escalation

The delegate answers routine implementation questions with a decision and one-line rationale, reusing settled choices. Return `ESCALATE: <why>` for unresolved changes to security, data meaning, migrations, destructive scope, external interfaces, or the big frame. Implementing an already approved choice is not a new escalation.

On an unresolved material decision, ask the user with a recommended answer, return their answer to the delegate, then resume. Never substitute an assumption for required approval.

## Autonomous by default (`--confirm` to opt out)

Steps 5 and 8's confirms are skipped and tickets publish once the delegate approves the breakdown; `--confirm` restores them. The interview gate below reuses prior approval; unresolved material decisions still escalate. Write every question → decision + rationale (interview, seam check, ticket quiz, escalations and answers, implement-loop decisions) to `docs/agents/matt-auto-log/<slug>.md` as the run goes — the only textual record when nothing is presented live. At the end add `gates_caught: <n>` — ship-ledger gates UNMET on your `--reverify` runs (`—` without unlazy or a ship step) — and, with `--spec`, `spec_questions_reasked: <n>` (interview questions the spec had already answered; target 0). Report the log's path in the final report. (`--confirm` presents decisions live and keeps no log.)

## Interview gate (reuse prior approval)

After publishing step 4's page, reuse existing implementation approval if no material decision remains unresolved. A `--spec` run is already approved (step 4). Record the approval and continue to step 5. Otherwise present the concrete unresolved choices and wait. `--confirm` requests a fresh gate. Silence is never approval.

- **Deliver where the user reads.** Present exactly what `$interview-report` returned — a public URL, or the Orca browser tab plus the path with its one-line reason — a one-line summary of what the interview settled, and what happens on approval. A missing link is no reason to skip the live board or the final report.
- **Wait.** No spec, tickets, or `$implement` while it is open; step 4 reads `⛔ interview gate`. The wait is not a delegate question.
- **Say how to answer:** reply here, or edit/flag nodes in the page and press **수정 내보내기** (on a hosted link, export before reloading).
- **Clearing it.** A clear go-ahead (진행, ok, go) → step 5. Anything else — a reply, a `<slug>.edits.json` saved into `docs/agents/matt-auto-log/`, or that JSON pasted into chat — is a change request: feed it to the delegate, rework the affected decisions, record it, regenerate the page (same link or tab), delete a consumed edits file, present the gate again.

## Decision-graph report

What got decided is never reported as prose: it is the `$interview-report` page at `docs/agents/matt-auto-log/<slug>.html` — stages in order, decisions as editable nodes, escalations highlighted.

- **Generate** it after the interview; **regenerate** on every board update once tickets exist; **regenerate last** with the `outcome` block and `progress.state: "done"` — after step 9's loop and your own verification run, after the small path's `$implement`, or after step 10 in ship mode. Never earlier.
- **Round-trip.** At step 1, or when the user says mid-run they edited the graph, read `<slug>.edits.json`: every edited or flagged node is a change request — feed it to the delegate, rework from the earliest affected stage, record it, regenerate, delete the consumed file so a stale edit is never applied twice.
- **Final report: measure, never estimate.** `git diff --numstat <baseline>..HEAD` and `git diff --name-status` (the PR branch tip in ship mode) fill `outcome` per interview-report's spec, one Korean line per file, `docs/agents/matt-auto-log/**` and `.unlazy/**` left out. Then a short terminal report: the link (or tab + path) first, the headline counts, tickets completed, verification results, the Run id and dispatch ids when workers ran — and point at the graph for the decisions, never restating them as prose.

## Ship mode (`--dev` / `--main` / `--pr <base>`)

`--dev` targets `dev`, `--main` targets `main`, `--pr <base>` any base; without one, no PR ever.

- **PR branch.** Implementation never lands on the base: if the current branch *is* the base, create `matt-auto/<slug>` and check it out; keep an existing feature branch. The name is part of the ship plan. All `$implement` subagents commit there.
- **PR condition.** Default: every ticket's verification commands pass on your own run and nothing escalated. A condition the user stated anywhere ("only after the full suite passes", "after #12–#14, leave #15") replaces or extends the default: write it into the ship plan, encode it as gates, verify before opening, never open while unmet — if it cannot be met, stop at `⛔`, report, hand off. Satisfaction is measured, never the delegate's call; ambiguous → escalate.
- **Ship ledger (unlazy installed).** Before opening the PR write `.unlazy/matt-auto/ship.GATES.md`: *PR condition* — G1 every ticket's verification commands pass on the PR branch tip (one gate per ticket: `CHECK:` its commands, `EXPECT:` their pass indicator), G2 one gate per user-stated condition; *Merge-ready* — G3 the PR exists against the base (`gh pr view <branch> --json baseRefName`), then pr-babysit's three gates with its commands: G4 required checks, G5 `mergeable == MERGEABLE`, G6 no changes requested. A condition no command can decide is a manual gate whose evidence is the user's explicit answer. Approve the ledger yourself; fill `<pr>` after opening; `--reverify` before opening (PR-condition group MET), after every babysit cycle, and before reporting. G4 red → babysit's fix cycle, G5 → the conflict bullet, G6 → address the review. A stop that is not merge-readiness becomes `ABANDON: <id> <reason>`.
- **Open, babysit, resolve.** Push the PR branch (plain push, never force), `gh pr create --base <base>` with title and body from the spec and tickets. Invoke `$pr-babysit` as written, in-session on the Default route (`ROUTED_EXECUTION=1; use $pr-babysit on PR <n> and shepherd it to merge-ready`); its stop conditions apply, and a stop that is not merge-ready ends step 10 as a handoff with the URL and unmet items. On unmergeable, `git merge origin/<base>` in the isolated worktree, `$resolving-merge-conflicts` with `ROUTED_EXECUTION=1` on `matt-deep` (`matt-free` in free mode; if unavailable, stop rather than pay), checks, commit, plain push; never rebase, force-push, or resolve in the caller's checkout; repeat within babysit's cycle bound if the base moves again.
- **Merge-ready, not merged.** Proven only by *your own* `--reverify` printing `ALL MET`; pr-babysit's report is input and the ledger wins a disagreement. matt-auto never merges.
- **Routing.** Opening the PR → in-session; babysit coordinator → `matt-default`; conflict resolution → `matt-deep`. Without automatic routing, the platform's subagent at step 2's effort, conflicts at `high` or above.
- **Report** adds: PR URL, base, PR condition and how it was verified, ship ledger tally, babysit cycles and commits, final check state, merge-ready or not.

## Parallel execution (automatic)

Step 2 probes Orca; step 7 plans waves; step 9 runs each accordingly. Only *where implementation workers run* changes. `--parallel N` (default 2, max 4) and `--on <env>` override concurrency and placement.

**Planning waves (step 7)** — your call, recorded as the page's `plan` block, every wave with its reason. Start from `$to-tickets`' blocking edges; keep a wave **sequential** when its tickets touch the same files or section, when one's design changes the other's assumptions, when a ticket is exploratory, or when merging back would collide. Cap a parallel wave at the concurrency; prefer fewer, wider waves; give every ticket an honest `estimateMin`. With Orca unreachable every wave is sequential and `plan.note` says why.

**Workers buy concurrency and isolation; anything that runs alone runs in-session.** Orca orchestration (Run → Task → Dispatch) dispatches a parallel wave and only that: the small path, a sequential wave, a one-ticket wave, and step 10's babysit stay in-session routed subagents. matt-auto is a *supervised* coordinator — the `orchestration` skill's supervised path (`run-create → task-create → worker-start → check --wait`), never `orca-cli`'s full handoff, never a non-Orca subagent tool for workers (`task-list --json` / `dispatch-show` proves orchestration). Preconditions: a running runtime and `run-list --json` answering (orchestration enabled in Settings › Experimental); every new shell binds the Run with `run-use --id <run>` first (else `run_required`); `--on <env>` naming an unlisted environment is escalated. Translate each ticket's tier into `worker-start` flags per `$model-routing`'s Orca table (in `--free` mode only `matt-free*`).

**The loop (step 9):**

1. `run-create --objective "<spec title>" --json` once, then `task-create --spec "<worker prompt>" --deps '[<blocker task ids>]' --json` per ticket; the worker prompt is the in-session one plus `orca-worker-prompt.md` next to this file. Print the Run id on the board.
2. For each ready ticket (`task-list --ready --brief --json`), up to the concurrency: `orca worktree create --name matt-auto/<ticket> --json` parented on the working/PR branch (remote: `new-top-level` with an explicit `--repo` after pushing the branch); pre-trust the worktree for Claude Code (`~/.claude.json` `projects` → `hasTrustDialogAccepted: true`, else `codex-trust-workspace`); then `worker-start --task <id> --worktree path:<worktree> <route flags> --json`.
3. Wait with `check --wait --types worker_done,escalation,question --timeout-ms 900000 --json` — never sleep/poll; a timeout or `{count:0}` is a checkpoint, and visible activity means alive. Process the whole Delivery, then `check --ack <delivery_id> --wait …`. A `question` goes to the delegate and back via `reply --id <msg_id>`; `ESCALATE` and `escalation` go to the user.
4. On `worker_done`, run the ticket's verification commands yourself in the worker's worktree (remote: fetch the pushed branch into a local temporary worktree). A failure → `send --to dispatch:<id> --subject "failed: <command>"` with the output (max two retries, then handoff) and `task-update` the task back to `dispatched` so the DAG does not advance. On a pass, `git merge --no-ff` into the working/PR branch (a conflict is resolved right there via `$resolving-merge-conflicts` on `matt-deep` in-session), then re-run the commands of every ticket completed earlier on the merged code. Only that second pass completes the ticket and unblocks dependents. Then `worker-release --dispatch <id> --json`.
5. `worker-start` may return `failed` at `dispatch_input` with `agent_prompt_stalled` while the prompt was delivered. If the terminal shows the agent working, do **not** retry — keep waiting; its report arrives as `Rejected worker_done`; verify as in 4, `task-update --id <task> --status completed` yourself, `worker-stop`, note the stall on the board.
6. Recovery: `worker-show` `ready` → keep waiting; `failed`/`stopped` → `worker-start --task <task> --retry-of <id>` with explicit `--worktree` and agent; `outcome_unknown` → `worker-stop`, inspect, retry. Never abandon a worker for a timeout, idle TUI, heartbeat, or question. Session lost → `run-list`, `run-use`, rebuild the frontier from `task-list`.

Step 10 stays in-session; release the Run's workers before it. Orca owns dispatch, waiting, and retry; you own verification. Add the Run id, dispatch ids, worktrees, placements, and merge order to the final report and the decision log; release every worker before reporting unless asked to keep one.

## Fallback

- No subagents on the platform: human-in-the-loop — every sub-skill question goes to the user, step 8 is to-tickets' own approval, behave as if `--confirm` was passed.
- Delegate lost mid-pipeline: respawn it with the Q&A log so far.
- Shared weed-harness skill missing: see Rules.

## Red flags — you are drifting off the flow

- Answering a sub-skill's question yourself, asking the user about non-material decisions, turning an open decision into an assumption, or reversing a `--spec` decision.
- Starting the spec, tickets, or `$implement` while a required interview gate is open.
- A stale page or board, a `blocked` ticket without the checkable reason, a report dropped because the link was refused, or running `orca artifacts` / `tab` / `reload` yourself.
- Decisions as prose, an unconsumed `<slug>.edits.json`, an autonomous run without a decision log, or counts not measured from `git diff --numstat`.
- Completing a ticket with a failing command, or trusting a subagent's or worker's "done" instead of your own run of its commands, before and after merge.
- An Orca worker for work that runs alone, workers outside a declared parallel wave, or a worker abandoned for a timeout, idle TUI, or heartbeat.
- A PR without a ship flag or before the PR condition is measured, a merge, force-push, or rebase of the PR branch, or "merge-ready" from anything but the ship ledger's `ALL MET`.
