---
name: matt-auto
description: "Claude Code edition. Conducts Matt Pocock's full engineering flow — interview, spec, tickets, implementation — for an already-discussed idea, on Claude Code's built-ins: a fork as the decision delegate, plugin agents for tickets, Workflow or /batch for parallel waves, /code-review · /simplify · /security-review for the review pass, /loop for PR shepherding, the Artifact tool for the decision-graph page. Two gates always hold: the interview gate (is the design right) and the execution plan gate (engine, model, agents, review level, cost — approved by the user before anything runs). Not for small work: a one-file change under thirty minutes is answered with one question and built directly. Flags: `--spec <path>` starts from a confirmed design-map spec (design-map hands over in the same session); `--confirm` adds the ticket-content confirm to the execution plan gate; `--dev` / `--main` / `--pr <base>` also open a PR and shepherd it to merge-ready; `--parallel N` caps concurrent workers (default 2, max 4)."
---

# Matt Auto (Claude Code)

Drive Matt Pocock's main flow (idea → ship) end to end as a conductor: every stage is one of the vendored Matt skills, invoked as written. This edition is **built-ins first**: what Claude Code already does (spawn, isolate, wait, publish, review) is done by Claude Code; this file keeps only the policy — who decides what, what counts as done, when the user is asked.

The user settles the big frame *before* invoking this (in conversation, or in a confirmed design-map spec); what remains is implementation-level, so a **decision delegate** answers it and the run goes unattended between two gates. The human still gets material decisions (Escalation), one look at the design after the interview (Interview gate), one look at the spend before execution (Execution plan gate), and a decision-graph page to push changes back through (Decision-graph report). No PR without a ship flag (Ship mode).

## Rules

- Invoke each stage's skill and follow it exactly. Never reimplement, merge, or "improve" a stage.
- A sub-skill's question to "the user" — interview, seam check, ticket quiz — goes to the delegate unless it is material. Discoverable facts are looked up, never asked.
- No gates or scores the vendored skills don't define. Artifacts are theirs (`CONTEXT.md`/ADRs, the spec on the tracker, tickets) plus exactly two matt-auto reports: the decision log and the `$interview-report` page (its edits round-trip and its Artifact link are delivery of that page). The ship ledger under `.unlazy/` is working state; the PR is pr-babysit's artifact.
- The shared weed-harness skills are the runtime: `$interview-report` (the page's view and data contract), `$loop-report` (`render.py`), `$loop-gates` (the ship ledger). If one is missing, say `weed-harness 5.x required: <skill> missing` once and use the fallback it names (decision log as the only report; no ship ledger). Never reimplement them inline.
- Nothing that spends — a Workflow, `/batch`, a review level, an extra pass — runs before the execution plan gate approved it.

## Pipeline

1. **Precondition** — record the baseline commit (`git rev-parse --short HEAD`) in the decision log. With `--spec <path>`, read the spec first: frontmatter `status` other than `confirmed` → print `spec not confirmed: run /design-map first` and stop; otherwise the log opens with `spec: <path>` and `artifact: <url>`. Missing `docs/agents/issue-tracker.md` → run `$setup-matt-pocock-skills`. Apply an existing `<slug>.edits.json` first (Decision-graph report).
2. **Probe** — note on the board: the coordinator's model (from the session; Fable-class or not — it decides the delegate route in step 3); whether the plugin agents `matt-loop:matt-default` / `matt-loop:matt-deep` can be spawned (else the Agent fallback in Routing, said once); which built-ins this session lists (`/code-review`, `/simplify`, `/security-review`, `/batch`, `/deep-research`) — an absent one is simply not offered at the gate; and that the page will be an Artifact link (if the Artifact tool is unavailable, the page is a path and the board says so once).
3. **Spawn the decision delegate** — if the coordinator runs on a Fable-class model, a **fork** (`subagent_type: "fork"`): it inherits this conversation, so the big frame needs no summary. Otherwise `matt-loop:matt-deep` with the big-frame summary, codebase access, and the delegate brief — `subagent_type` only, no `model` or `effort` argument (the agent file fixes fable / high; an override would run the delegate on the session's model). Keep the same agent alive across stages (`SendMessage`). With `--spec`, the spec's `## 큰 틀` is the frame and its `## 결정` table is settled: the delegate closes any question the spec answers by citing the D-id, decides only the rest, and replies `ESCALATE: contradicts <D-id>` when a settled decision would have to be reversed.
4. **Interview** — `$grill-with-docs` in a codebase, `$grill-me` otherwise, one question at a time with a recommended answer, each to the delegate; record question → decision + rationale. A question that needs external sources detours via `/deep-research`; one that needs a runnable answer via `$prototype`. Then run `$interview-report` on the log and hold the **interview gate** until the user approves. With `--spec`, the graph's first stage is `design` — the spec's decisions as read-only nodes (see `$interview-report`); a change the user asks for at the gate becomes an interview-stage `redirect` logged as `design override <D-id>`; the spec file is never edited.
5. **Size branch** — three sizes, decided from the interview (with `--spec`, the length of its 구현 순서):
   - *One file, under thirty minutes* (`loop: implement` in a spec): no delegate, no tickets. Ask once — "지금 구현할까요?" with one engine line (in-session, `matt-loop:matt-default`, one agent) — then build it, run its verification commands yourself, and report. The interview gate is skipped only here.
   - *Fits one session* (small path): write the interview log to the decision log; the execution plan is one row (`$implement` in-session on the routed agent) and the gate question is "이어서 진행할까요?" with that row. On approval `$implement` as an in-session routed subagent, then the review pass (step 9), the final report, and step 10 in ship mode.
   - *More than that*: steps 6–10.
6. **Spec** — `$to-spec`, seam check answered by the delegate; it publishes the spec as written (with `--spec`, the design spec is its context); a later confirm that changes decisions updates it.
7. **Tickets** — `$to-tickets` with its breakdown quiz answered by the delegate, iterated to approval, **publication held** until step 8. Then plan the execution — waves and an `estimateMin` per ticket (Parallel execution) — and build the execution plan table (step 8).
8. **Execution plan gate (always)** — one table, one `AskUserQuestion`, nothing runs before approval. Columns: 웨이브 · 티켓 · 엔진 (Agent 직렬 / Workflow pipeline, with ultracode on or off / `/batch`) · 모델·effort · 에이전트 수 · 리뷰 level (`/code-review` low–max, or ultra) · 추가 패스 (`/simplify`, `/security-review`) · 실행 세션 (이 세션 / `/fork` 배경 세션) · 대략 비용 · 이유; one header line names the coordinator's model and the delegate route. Recommend the cheapest plan that fits: sequential Agent for a dependent or file-overlapping wave, Workflow for an independent wave that merges into one branch, `/batch` only in ship mode when the wave's tickets are independent and each should be its own PR; `/code-review` at `medium` and `/simplify` on by default; `/security-review` when a ticket touches auth, data, or an external interface; ultracode and ultra only with a reason. With `--confirm`, the same question also carries the ticket breakdown (title / blocked-by / delivers) and the ship plan. Approval publishes the tickets and the plan (page `plan` block); a change request reworks the plan (or, with `--confirm`, the affected stage) and asks again. Never convert a pending gate into a default.
9. **Implement loop** — a ticket whose blockers are done goes to a fresh-context agent with "read ticket <ref>, then use $implement to build it; report open decisions back instead of guessing" on the route Routing assigns; a sequential wave one ticket at a time in-session, a parallel wave by the engine the gate approved (Parallel execution). **Verification is yours.** Each ticket's acceptance criteria name its verification commands (test / build / lint, a check script); put them in the prompt as what "done" means. When the agent returns, run them yourself — in the ticket's worktree for a parallel ticket, in the checkout for a sequential one; the report is a signal, your run is the evidence. A failing command goes back to the same route with its output, at most twice; then the ticket stops as `⛔` with the failing command as its checkable reason and you escalate. Complete means every command passed on your run. Verification covers implementation only and never replaces escalation. **Review pass** after the last ticket, as approved at the gate: `/code-review <level> <baseline>..HEAD` (not per ticket; `ultra` only if approved), then `/simplify` if on, then `/security-review` if on; record each as a `review.passes` entry with its finding count, fix what it confirms (`--fix` only on confirmed findings), re-run the affected tickets' commands. Then the final report, and step 10 in ship mode.
10. **Ship (ship flag only)** — otherwise mark `⏭️ no --pr`. Ship ledger (when unlazy is installed) → verify the PR condition → push and open the PR → `$pr-babysit` in-session to merge-ready (`/loop` for its cycle) → conflicts via `$resolving-merge-conflicts` → `--reverify` the ship ledger → report. Never merge. Details in Ship mode.

## Progress board

One markdown table, printed at start, at every stage transition, on every escalation or gate, and on every ticket state change:

| # | Stage | Skill / route | Status |
|---|---|---|---|
| 1 | Precondition | setup-matt-pocock-skills | ✅ |
| 2 | Probe | fable · agents ok · /batch present | ✅ |
| 3 | Delegate | fork | ✅ |
| 4 | Interview | grill-with-docs → delegate | 🔄 Q7: error-handling seam |
| 5 | Size branch | — | ⏳ |
| 6 | Spec | to-spec | ⏳ |
| 7 | Tickets | to-tickets | ⏳ |
| 8 | Execution plan gate | human | ⏳ |
| 9 | Implement loop | Agent / Workflow | ⏳ |
| 9b | Review pass | /code-review medium · /simplify | ⏳ |
| 10 | Ship | pr-babysit → matt-default | ⏭️ no --pr |

Statuses: `✅` done · `🔄` in progress with a short note (the current question, `cycle 2/5: CI red`) · `⏳` pending · `⏭️` skipped with why (`small path`, `no --pr`) · `⛔` waiting on an escalation, a gate, or an unmet PR condition. Skill / route names the vendored skill and, once known, the routed agent or engine. Small path: 6–8 read `⏭️ small path`. During step 9 add a ticket board — Ticket · Route (agent, model/effort) · Engine (in-session / Workflow run id / batch PR) · Worktree · Checks (`passed/total` on your latest run) · Status. Step 10's note carries the ship ledger tally. Autonomous stretches append one stage-transition line per update to the decision log. The board is display only: never a file, never a stage's output.

**Every board update once tickets exist is also a republish**: hand `$interview-report` the regenerated data, run `render.py` as it says, and publish `docs/agents/matt-auto-log/<slug>.html` with the **Artifact tool on the same path** — the same path keeps the same URL; pass a favicon on the first publish only. Republish exactly when the board changes (stage transition, ticket status, verification result, gate, escalation raised or answered) — not on a timer, not per commit. The data follows `$interview-report`'s contract: `blocked` only with `blocker.reason` and the checkable fact in `blocker.detail` (a failing command after retries, an escalation waiting, CI red, a merge conflict, a stopped agent), otherwise `pending` with `blockedBy`; `progress.current` is the board's `🔄` note; every ticket node carries route, model/effort, engine, and worktree; `estimateMin` at planning, `startedAt` / `actualMin` as tickets run, re-estimated only when you learned something; the approved execution plan is the page's `plan` block and stays; `review` in the review pass, `pr` in ship mode; per-ticket `acceptance`, `steps`, `gateList` (each command, expected-vs-actual), `files`, `commits` in the detail. Without the Artifact tool the page is a path, said once; "no link" never becomes "no report".

## Routing (Claude Code)

The plugin's agent files fix model and effort; routing a ticket is choosing the agent. Spawn by name — the Agent call carries `subagent_type` and nothing about model or effort; a `model` or `effort` argument on top of a plugin agent is a routing error, not a refinement.

| Route | Agent | Model / effort | Use |
|---|---|---|---|
| Default | `matt-loop:matt-default` | opus / medium | Ordinary tickets, small fixes, the babysit coordinator; the default when both are plausible |
| Deep | `matt-loop:matt-deep` | fable / high | The delegate when the session is not Fable-class, hard tickets, conflict resolution |
| Delegate (Fable session) | fork | the session's model | The decision delegate; inherits the conversation |

A `--spec` step tagged `[deep]` / `[default]` fixes its ticket's route; otherwise classify each ticket from what it needs, lowest clearly sufficient route; `matt-default` reporting the task beyond it → retry once on `matt-deep`; `matt-deep` reporting the same → the ticket stops as a handoff (Deep is the ceiling). Large context: chunk the material, summarize each chunk on `matt-deep`, synthesize. If the plugin agents cannot be spawned on this machine, use the Agent tool with `model` / `effort` set to the same pairs and say so once on the board. In a Workflow, the same choice is `agentType: 'matt-loop:matt-default' | 'matt-loop:matt-deep'` (or `model` / `effort` in the fallback) — never the default workflow subagent, which inherits the session model and would run a Deep ticket on whatever the session is.

## Delegate brief and escalation

The delegate answers implementation-level questions with senior-engineer judgment, preferring the asker's recommended answer unless it sees a concrete flaw; replies with the decision plus a one-line rationale (the log is shown to the user verbatim); and never decides — replying `ESCALATE: <why>` — on security, data meaning or migration, destructive operations, externally visible interface changes, or anything contradicting the big frame.

On `ESCALATE`, or when a stage surfaces a material decision, pause, put the question to the real user with a recommended answer, feed the answer back to the delegate, resume. Never convert an open decision into an assumption. Autonomous stretches remove routine questions, never the safety net.

## Two gates

**Interview gate (never skipped past the small path).** Right after step 4's page is generated the pipeline stops until the user answers.

- **Deliver where the user reads.** Present the Artifact URL `$interview-report`'s publish returned (or the path when there is no Artifact tool), a one-line summary of what the interview settled, and what happens on approval.
- **Wait.** No spec, tickets, or `$implement` while it is open; step 4 reads `⛔ interview gate`. The wait is not a delegate question.
- **Say how to answer:** reply here, comment on the page, or edit/flag nodes in the page and press **수정 내보내기**.
- **Clearing it.** A clear go-ahead (진행, ok, go) → step 5. Anything else — a reply, a comment, a `<slug>.edits.json` saved into `docs/agents/matt-auto-log/`, or that JSON pasted into chat — is a change request: feed it to the delegate, rework the affected decisions, record it, republish the page (same path), delete a consumed edits file, present the gate again.

**Execution plan gate (always).** Step 8's question. It asks about spend and tools, not design: the user approves the engines, the agents and their models, the review level, the extra passes, the session, the cost. Until it is approved, step 9 reads `⛔ execution plan gate` and nothing is dispatched. Its answer is recorded in the decision log and the page's `plan` block. On the small path it collapses into one row inside "이어서 진행할까요?"; on the one-file path into the engine line of "지금 구현할까요?".

## Decision-graph report

What got decided is never reported as prose: it is the `$interview-report` page at `docs/agents/matt-auto-log/<slug>.html` — stages in order, decisions as editable nodes, escalations highlighted, the approved execution plan as its `plan` block.

- **Generate** it after the interview; **regenerate** on every board update once tickets exist; **regenerate last** with the `outcome` block and `progress.state: "done"` — after step 9's loop and your own verification run, after the small path's `$implement`, or after step 10 in ship mode. Never earlier.
- **Round-trip.** At step 1, or when the user says mid-run they edited the graph, read `<slug>.edits.json`: every edited or flagged node is a change request — feed it to the delegate, rework from the earliest affected stage, record it, regenerate, delete the consumed file so a stale edit is never applied twice. Comments left on the Artifact are the same input: read them when the user says so, apply, reply briefly, resolve the ones you handled.
- **Final report: measure, never estimate.** `git diff --numstat <baseline>..HEAD` and `git diff --name-status` (the PR branch tip in ship mode) fill `outcome` per interview-report's spec, one Korean line per file, `docs/agents/matt-auto-log/**` and `.unlazy/**` left out. Then a short terminal report: the link first, the headline counts, tickets completed, verification results, the review passes, the Workflow run ids or batch PRs when they ran — and point at the graph for the decisions, never restating them as prose.

## Ship mode (`--dev` / `--main` / `--pr <base>`)

`--dev` targets `dev`, `--main` targets `main`, `--pr <base>` any base; without one, no PR ever.

- **PR branch.** Implementation never lands on the base: if the current branch *is* the base, create `matt-auto/<slug>` and check it out; keep an existing feature branch. The name is part of the ship plan. All `$implement` agents commit there. With `/batch` the wave's agents open their own PRs against this branch, and step 10 shepherds each.
- **PR condition.** Default: every ticket's verification commands pass on your own run and nothing escalated. A condition the user stated anywhere ("only after the full suite passes", "after #12–#14, leave #15") replaces or extends the default: write it into the ship plan, encode it as gates, verify before opening, never open while unmet — if it cannot be met, stop at `⛔`, report, hand off. Satisfaction is measured, never the delegate's call; ambiguous → escalate.
- **Ship ledger (unlazy installed).** Before opening the PR write `.unlazy/matt-auto/ship.GATES.md`: *PR condition* — G1 every ticket's verification commands pass on the PR branch tip (one gate per ticket: `CHECK:` its commands, `EXPECT:` their pass indicator), G2 one gate per user-stated condition; *Merge-ready* — G3 the PR exists against the base (`gh pr view <branch> --json baseRefName`), then pr-babysit's three gates with its commands: G4 required checks, G5 `mergeable == MERGEABLE`, G6 no changes requested. A condition no command can decide is a manual gate whose evidence is the user's explicit answer. Approve the ledger yourself; fill `<pr>` after opening; `--reverify` before opening (PR-condition group MET), after every babysit cycle, and before reporting. G4 red → babysit's fix cycle, G5 → the conflict bullet, G6 → address the review. A stop that is not merge-readiness becomes `ABANDON: <id> <reason>`.
- **Open, babysit, resolve.** Push the PR branch (plain push, never force), `gh pr create --base <base>` with title and body from the spec and tickets. Invoke `$pr-babysit` as written, in-session, its cycle on `/loop`; its stop conditions apply, and a stop that is not merge-ready ends step 10 as a handoff with the URL and unmet items. On unmergeable, `git merge origin/<base>` in an isolated worktree, `$resolving-merge-conflicts` on `matt-loop:matt-deep`, checks, commit, plain push; never rebase, force-push, or resolve in the caller's checkout; repeat within babysit's cycle bound if the base moves again. If the session must close before merge-ready, offer a `/schedule` routine for the next cycle instead of leaving the PR unattended.
- **Merge-ready, not merged.** Proven only by *your own* `--reverify` printing `ALL MET`; pr-babysit's report is input and the ledger wins a disagreement. matt-auto never merges.
- **Routing.** Opening the PR → in-session; babysit coordinator → `matt-default`; conflict resolution → `matt-deep`.
- **Report** adds: PR URL(s), base, PR condition and how it was verified, ship ledger tally, babysit cycles and commits, final check state, merge-ready or not.

## Parallel execution

Step 7 plans waves; step 8 approves the engine per wave; step 9 runs each accordingly. `--parallel N` (default 2, max 4) caps concurrent agents in every engine.

**Planning waves (step 7)** — your call, recorded as the page's `plan` block, every wave with its reason. Start from `$to-tickets`' blocking edges; keep a wave **sequential** when its tickets touch the same files or section, when one's design changes the other's assumptions, when a ticket is exploratory, or when merging back would collide. Cap a parallel wave at the concurrency; prefer fewer, wider waves; give every ticket an honest `estimateMin`.

**Engines** — anything that runs alone runs in-session as an Agent; a parallel wave runs on the engine the gate approved:

- **Workflow** (default for a parallel wave that merges into one branch). One `Workflow` call per wave: `pipeline(tickets, t => agent(<the in-session prompt for t, plus: work only in your worktree, commit there, run the ticket's verification commands before you finish, never merge>, { agentType: <t's route>, isolation: 'worktree', phase: 'Wave <n>', schema: { branch, worktree, commits, summary, openDecisions } }))`. The worktree survives when the agent changed it; the schema tells you where. `ultracode` (exhaustive mode) only when the gate approved it. Then, per returned ticket: run its verification commands in `worktree` yourself; a failure → an in-session Agent on the same route with the failing output and the worktree path, at most twice, then handoff; on a pass `git merge --no-ff <branch>` into the working/PR branch (a conflict is resolved right there via `$resolving-merge-conflicts` on `matt-deep`), re-run the commands of every ticket completed earlier on the merged code, complete the ticket and unblock dependents, `git worktree remove` it. An `openDecisions` entry goes to the delegate before merging. A Workflow that stops early is resumed with `resumeFromRunId`, never restarted.
- **`/batch`** (ship mode only, wave of independent tickets, one PR each). Give it the wave's tickets, one per agent, each with its verification commands and the PR branch as base. For each PR it opens: fetch the branch, run the ticket's commands locally, and treat the PR as that ticket's deliverable — step 10 shepherds every PR; the user decides the landing order. A failed ticket gets one in-session retry on its branch, then handoff.
- **Agent, several at once** (fallback when Workflow is unavailable): the wave's Agent calls in one message, each with `isolation: 'worktree'` and its route; verification and merge exactly as for Workflow.

Step 10 stays in-session. Add the Workflow run ids, batch PR numbers, worktrees, and merge order to the final report and the decision log.

## Continuing from design-map

When design-map hands over in this session ("지금 이어서 진행할까요?" answered with 이 세션 or `/fork`), start at step 1 with `--spec <the committed spec>`: the delegate fork already holds the design conversation, the interview asks only what the spec leaves open, and the interview gate presents what changed rather than the whole design. Nothing else differs.

## Fallback

- Plugin agents unavailable: the Agent tool with the same model / effort pairs, said once (Routing).
- Workflow unavailable: several Agent calls per wave (Parallel execution). `/batch` absent: not offered at the gate.
- Artifact tool unavailable: the page is a path; the board and the gate say so once.
- Delegate lost mid-pipeline: respawn it with the Q&A log so far (a fork re-inherits the conversation).
- Shared weed-harness skill missing: see Rules.

## Red flags — you are drifting off the flow

- Answering a sub-skill's question yourself, asking the user about non-material decisions, turning an open decision into an assumption, or reversing a `--spec` decision.
- Starting the spec, tickets, or `$implement` while the interview gate is unanswered; dispatching a Workflow, `/batch`, a review, or an extra pass before the execution plan gate approved it.
- A Workflow agent left on the default subagent (session model) for a routed ticket, or a `model` override on top of a plugin agent.
- A stale page or board, a `blocked` ticket without the checkable reason, a second Artifact for the same run, or a report dropped because publishing failed.
- Decisions as prose, an unconsumed `<slug>.edits.json`, an autonomous stretch without a decision log, or counts not measured from `git diff --numstat`.
- Completing a ticket with a failing command, or trusting an agent's or a Workflow's "done" instead of your own run of its commands, before and after merge.
- A PR without a ship flag or before the PR condition is measured, a merge, force-push, or rebase of the PR branch, or "merge-ready" from anything but the ship ledger's `ALL MET`.
