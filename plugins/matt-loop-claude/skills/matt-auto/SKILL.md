---
name: matt-auto
description: "Execute a confirmed local spec: create tickets, implement, verify, and independently review with bounded fix cycles. Use --spec PATH; design and user iteration belong to matt-design, visualization to design-map. Autonomous by default; --confirm requests a ticket/execution-plan gate. --dev / --main / --pr BASE enable PR shipping; --parallel N caps concurrency."
---

# Matt Auto (Claude Code)

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
- Use Claude Code built-ins and packaged agents below; `$interview-report`, `$loop-report`, and `$loop-gates` supply reporting and ship checks. Missing delivery falls back to a local report; unavailable gates means report checks directly, never claim ledger verification.
## Pipeline

1. **Precondition** — validate and pin the confirmed spec before any side effects; record the full baseline commit (`git rev-parse HEAD`). Recheck the spec hash before dispatch and at completion; a changed spec pauses affected work until its new revision is confirmed and explicitly adopted. Missing `docs/agents/issue-tracker.md` → `$setup-matt-pocock-skills` for the execution tracker only. Apply pending report edits under the change-control rule below. Prepare the feature branch before workers start in ship mode.
2. **Probe** — note on the board: the coordinator's model (from the session; Fable-class or not — it decides the delegate route in step 3); whether the plugin agents `matt-loop:matt-default` / `matt-loop:matt-deep` can be spawned (else the Agent fallback in Routing, said once); which built-ins this session lists (`/code-review`, `/simplify`, `/security-review`, `/batch`, `/deep-research`) — an absent one is not used in the plan; and that the page will be an Artifact link (if the Artifact tool is unavailable, the page is a path and the board says so once).
3. **Spawn the decision delegate** — if the coordinator runs on a Fable-class model, a **fork** (`subagent_type: "fork"`): it inherits this conversation, so the big frame needs no summary. Otherwise `matt-loop:matt-deep` with the confirmed spec summary, codebase access, and the delegate brief — `subagent_type` only, no `model` or `effort` argument (the agent file fixes fable / high; an override would run the delegate on the session's model). Keep the same agent alive across stages (`SendMessage`). The spec's `## 큰 틀` is the frame and its `## 결정` table is settled: the delegate closes any question the spec answers by citing the D-id, decides only the rest, and replies `ESCALATE: contradicts <D-id>` when a settled decision would have to be reversed.
4. **Load design** — populate the report's read-only `design` stage from the spec's D-ids and show interview as `⏭️ confirmed spec`. There is no interview or design gate here, even with `--confirm`. Keep the source spec unchanged.
5. **Size work** — choose ticket granularity from the implementation steps. Small work becomes one ticket and one in-session worker; it still receives verification and independent review. Never skip review based on size.
6. **Spec reference** — retain the local path, revision/hash, acceptance criteria and D-ids as the authority. Link them from the ticket context; do not run `$to-spec` again.
7. **Tickets** — run only `$to-tickets` gather/explore/draft/quiz against the confirmed spec; defer its publication stage to step 8; its breakdown quiz goes to the execution delegate, which may split/order work but cannot change the design. Include acceptance criteria, concrete verification commands and expected results per ticket; carry manual criteria explicitly. Plan dependency waves and estimates. On resume reconcile existing ticket references from the log instead of publishing duplicates.
8. **Execution plan** — record tickets, dependencies, routes, concurrency, placement, review and optional ship plan, then publish tickets and the report. Invocation authorizes these routine execution choices. Only `--confirm` holds publication/dispatch for a fresh user review of this concrete package. A design-changing objection follows change control, not delegate approval.
9. **Implement loop** — a ticket whose blockers are done goes to a fresh-context agent with "read ticket <ref>, then use $implement to build it; follow the pinned spec <path/revision/hash> and its D-ids; report open decisions back instead of guessing; defer $implement's code-review step to the coordinator, and commit only task-owned changes" on the route Routing assigns; a sequential wave one ticket at a time in-session, a parallel wave by the engine in the execution plan (Parallel execution). **Verification is yours.** Each ticket's acceptance criteria name its verification commands (test / build / lint, a check script); put them in the prompt as what "done" means. When the agent returns, run them yourself — in the ticket's worktree for a parallel ticket, in the checkout for a sequential one; the report is a signal, your run is the evidence. A failing command goes back to the same route with its output, at most twice; then the ticket stops as `⛔` with the failing command as its checkable reason and you escalate. Complete means every command passed on your run and each manual acceptance criterion has explicit evidence. Verification covers implementation only and never replaces escalation. **Review pass** after the last ticket: ensure task-owned implementation and subsequent fixes are committed before every range review; using the recorded execution plan: `/code-review <level> <baseline>..HEAD` (not per ticket; `ultra` only if explicitly requested), then `/simplify` if planned, then `/security-review` if planned; supply the pinned spec as the fidelity reference; record each as a `review.passes` entry with its finding count, fix what it confirms (`--fix` only on confirmed findings), re-run the affected tickets' commands. Repeat independent review of the updated candidate after fixes, at most two fix/review cycles. Unresolved confirmed findings at the bound stop the run with the findings and evidence; never mark it done. Completion requires clean independent review and passing coordinator verification on the final integrated candidate. Then the final report, and step 10 in ship mode.
10. **Ship (ship flag only)** — otherwise mark `⏭️ no --pr`. Ship ledger (when unlazy is installed) → verify the PR condition → push and open the PR → `$pr-babysit` in-session to merge-ready (`/loop` for its cycle) → conflicts via `$resolving-merge-conflicts` → `--reverify` the ship ledger → report. Never merge. Details in Ship mode.

## Progress board

One markdown table, printed at start, at every stage transition, on every escalation or gate, and on every ticket state change:

| # | Stage | Skill / route | Status |
|---|---|---|---|
| 1 | Precondition | setup-matt-pocock-skills | ✅ |
| 2 | Probe | fable · agents ok · /batch present | ✅ |
| 3 | Delegate | fork | ✅ |
| 4 | Load design | confirmed spec | ✅ |
| 5 | Size work | ticket granularity | ⏳ |
| 6 | Spec reference | pinned local spec | ✅ |
| 7 | Tickets | to-tickets | ⏳ |
| 8 | Execution plan | autonomous / --confirm | ⏳ |
| 9 | Implement loop | Agent / Workflow | ⏳ |
| 9b | Review pass | /code-review medium · /simplify | ⏳ |
| 10 | Ship | pr-babysit → matt-default | ⏭️ no --pr |

Statuses: `✅` done · `🔄` in progress with a short note (the current question, `cycle 2/5: CI red`) · `⏳` pending · `⏭️` skipped with why (`no --pr`) · `⛔` waiting on an escalation, a gate, or an unmet PR condition. Skill / route names the vendored skill and, once known, the routed agent or engine. During step 9 add a ticket board — Ticket · Route (agent, model/effort) · Engine (in-session / Workflow run id / batch PR) · Worktree · Checks (`passed/total` on your latest run) · Status. Step 10's note carries the ship ledger tally. Autonomous stretches append one stage-transition line per update to the decision log. The board is display only: never a file, never a stage's output.

**Every board update once tickets exist is also a republish**: hand `$interview-report` the regenerated data, run `render.py` as it says, and publish `docs/agents/matt-auto-log/<slug>.html` with the **Artifact tool on the same path** — the same path keeps the same URL; pass a favicon on the first publish only. Republish exactly when the board changes (stage transition, ticket status, verification result, gate, escalation raised or answered) — not on a timer, not per commit. The data follows `$interview-report`'s contract: `blocked` only with `blocker.reason` and the checkable fact in `blocker.detail` (a failing command after retries, an escalation waiting, CI red, a merge conflict, a stopped agent), otherwise `pending` with `blockedBy`; `progress.current` is the board's `🔄` note; every ticket node carries route, model/effort, engine, and worktree; `estimateMin` at planning, `startedAt` / `actualMin` as tickets run, re-estimated only when you learned something; the recorded execution plan is the page's `plan` block and stays; `review` in the review pass, `pr` in ship mode; per-ticket `acceptance`, `steps`, `gateList` (each command, expected-vs-actual), `files`, `commits` in the detail. Without the Artifact tool the page is a path, said once; "no link" never becomes "no report".

## Execution defaults (Claude Code)

Use sequential Agent for dependent/overlapping tickets and Workflow for independent
isolated waves, falling back to sequential Agent if unavailable. Record the plan
before dispatch. Use `/code-review` at `medium` when available; otherwise invoke
`$code-review` for independent standards and spec reviews with fresh read-only
agents. `/simplify`, `/security-review`, `/batch`, ultracode and ultra are optional,
selected only for a concrete task need or user request, with existing cost/tool
constraints preserved. Missing independent review capability blocks completion.
No extra spend/engine gate is added unless `--confirm` or the user requests one.

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

On `ESCALATE` or a material decision, follow Change control before resuming affected work. Never convert an open decision into an assumption.

## Change control

Routine implementation and ticket questions stay autonomous inside the confirmed
contract. A proposed change to a settled decision, acceptance criterion, scope,
external interface or data meaning is a design question: pause affected workers,
show the D-ids, evidence, recommendation and impact to the user, and return the
question to `$matt-design`. Do not edit the source spec or let a delegate approve
its replacement. Continue independent unaffected work only when its assumptions
remain valid. Resume affected work after the user confirms the revised spec and
requests continuation; record the newly adopted revision/hash and invalidate
stale ticket plans, verification and review as needed.

User report edits/comments are change requests, not approval. Apply routine
execution edits to affected tickets, the log/plan and active worker briefs; pause
affected dispatch while updating instructions, and invalidate checks/review when
their inputs change. Design edits follow the rule above. Preserve a
pending edit until resolved, then mark it consumed so it is not applied twice.
`--confirm` adds only the ticket/plan gate; it does not reopen settled design.

## Decision-graph report

Execution progress and decisions appear on the `$interview-report` page at `docs/agents/matt-auto-log/<slug>.html` — stages in order, decisions as editable nodes, escalations highlighted, the recorded execution plan as its `plan` block.

- **Generate** it after loading the confirmed design; **regenerate** on every board update once tickets exist; **regenerate last** with the `outcome` block and `progress.state: "done"` — after step 9's loop and your own verification run, or after step 10 in ship mode. Only after all required checks and independent review pass; unresolved findings or an unfinished ship step remain blocked, never done.
- **Round-trip.** Read `<slug>.edits.json` at startup and when the user reports edits. Apply Change control; pending design edits pause affected work and are not silently consumed. On Claude Code read Artifact comments when notified and preserve unresolved threads. Republish the same report after resolution.
- **Final report: measure, never estimate.** `git diff --numstat <baseline>..HEAD` and `git diff --name-status` (the PR branch tip in ship mode) fill `outcome` per interview-report's spec, one Korean line per file, `docs/agents/matt-auto-log/**` and `.unlazy/**` left out. Then a short terminal report: the link first, the headline counts, tickets completed, verification results, the review passes, the Workflow run ids or batch PRs when they ran — include unresolved decisions when any remain.

## Ship mode (`--dev` / `--main` / `--pr <base>`)

`--dev` targets `dev`, `--main` targets `main`, `--pr <base>` any base; without one, no PR ever.

- **PR branch.** Implementation never lands on the base: if the current branch *is* the base, create `matt-auto/<slug>` and check it out; keep an existing feature branch. The name is part of the ship plan. All `$implement` agents commit there. With `/batch` the wave's agents open their own PRs against this branch, and step 10 shepherds each.
- **PR condition.** Default: every ticket's verification commands pass on your own run and nothing escalated. A condition the user stated anywhere ("only after the full suite passes", "after #12–#14, leave #15") replaces or extends the default: write it into the ship plan, encode it as gates, verify before opening, never open while unmet — if it cannot be met, stop at `⛔`, report, hand off. Satisfaction is measured, never the delegate's call; ambiguous → escalate.
- **Ship ledger (unlazy installed).** Before opening the PR write `.unlazy/matt-auto/ship.GATES.md`: *PR condition* — G1 every ticket's verification commands pass on the PR branch tip (one gate per ticket: `CHECK:` its commands, `EXPECT:` their pass indicator), G2 one gate per user-stated condition; *Merge-ready* — G3 the PR exists against the base (`gh pr view <branch> --json baseRefName`), then pr-babysit's three gates with its commands: G4 required checks, G5 `mergeable == MERGEABLE`, G6 no changes requested. A condition no command can decide is a manual gate whose evidence is the user's explicit answer. Approve the ledger yourself; fill `<pr>` after opening; `--reverify` before opening (PR-condition group MET), after every babysit cycle, and before reporting. G4 red → babysit's fix cycle, G5 → the conflict bullet, G6 → address the review. A stop that is not merge-readiness becomes `ABANDON: <id> <reason>`.
- **Open, babysit, resolve.** Push the PR branch (plain push, never force), `gh pr create --base <base>` with title and body from the spec and tickets. Invoke `$pr-babysit` as written, in-session, its cycle on `/loop`; its stop conditions apply, and a stop that is not merge-ready ends step 10 as a handoff with the URL and unmet items. On unmergeable, `git merge origin/<base>` in an isolated worktree, `$resolving-merge-conflicts` on `matt-loop:matt-deep`, checks, commit, plain push; never rebase, force-push, or resolve in the caller's checkout; repeat within babysit's cycle bound if the base moves again. If the session must close before merge-ready, offer a `/schedule` routine for the next cycle instead of leaving the PR unattended.
- **Merge-ready, not merged.** With the ship ledger, proven by *your own* `--reverify` printing `ALL MET`; without it, run and record every equivalent PR-condition and merge-readiness check yourself; pr-babysit's report is input and the ledger wins a disagreement. matt-auto never merges.
- **Routing.** Opening the PR → in-session; babysit coordinator → `matt-default`; conflict resolution → `matt-deep`.
- **Report** adds: PR URL(s), base, PR condition and how it was verified, ship ledger tally, babysit cycles and commits, final check state, merge-ready or not.

## Parallel execution

Step 7 plans waves; step 8 records the engine per wave; step 9 runs each accordingly. `--parallel N` (default 2, max 4) caps concurrent agents in every engine.

**Planning waves (step 7)** — your call, recorded as the page's `plan` block, every wave with its reason. Start from `$to-tickets`' blocking edges; keep a wave **sequential** when its tickets touch the same files or section, when one's design changes the other's assumptions, when a ticket is exploratory, or when merging back would collide. Cap a parallel wave at the concurrency; prefer fewer, wider waves; give every ticket an honest `estimateMin`.

**Engines** — anything that runs alone runs in-session as an Agent; a parallel wave runs on the engine the execution plan selects:

- **Workflow** (default for a parallel wave that merges into one branch). One `Workflow` call per wave: `pipeline(tickets, t => agent(<the in-session prompt for t, plus: work only in your worktree, commit there, run the ticket's verification commands before you finish, never merge>, { agentType: <t's route>, isolation: 'worktree', phase: 'Wave <n>', schema: { branch, worktree, commits, summary, openDecisions } }))`. The worktree survives when the agent changed it; the schema tells you where. `ultracode` (exhaustive mode) only when the user explicitly requested it. Then, per returned ticket: run its verification commands in `worktree` yourself; a failure → an in-session Agent on the same route with the failing output and the worktree path, at most twice, then handoff; on a pass `git merge --no-ff <branch>` into the working/PR branch (a conflict is resolved right there via `$resolving-merge-conflicts` on `matt-deep`), re-run the commands of every ticket completed earlier on the merged code, complete the ticket and unblock dependents, `git worktree remove` it. An `openDecisions` entry goes to the delegate before merging. A Workflow that stops early is resumed with `resumeFromRunId`, never restarted.
- **`/batch`** (ship mode only, wave of independent tickets, one PR each). Give it the wave's tickets, one per agent, each with its verification commands and the PR branch as base. For each PR it opens: fetch the branch, run the ticket's commands locally, and treat the PR as that ticket's deliverable — step 10 shepherds every PR; the user decides the landing order. A failed ticket gets one in-session retry on its branch, then handoff.
- **Agent, several at once** (fallback when Workflow is unavailable): the wave's Agent calls in one message, each with `isolation: 'worktree'` and its route; verification and merge exactly as for Workflow.

Step 10 stays in-session. Add the Workflow run ids, batch PR numbers, worktrees, and merge order to the final report and the decision log.

## Fallback

- Plugin agents unavailable: the Agent tool with the same model / effort pairs, said once (Routing).
- Workflow unavailable: several Agent calls per wave (Parallel execution). `/batch` absent: use Workflow or sequential Agent.
- Artifact tool unavailable: the page is a path; the board says so once.
- Delegate lost mid-pipeline: respawn it with the Q&A log so far (a fork re-inherits the conversation).
- Shared weed-harness skill missing: see Rules.

## Red flags — you are drifting off the flow

- Interviewing or authoring a new spec here; treating design confirmation alone as execution authorization.
- Dispatching on a draft or changed spec, guessing a design answer, or reversing a settled D-id without a user-confirmed revision.
- Skipping ticket verification or independent review for small work, claiming completion with open findings, or trusting worker reports without running checks yourself.
- Stale report state, edits silently consumed, or counts not measured from git.
- A PR without a ship flag, before its measured conditions, or a merge, force-push or rebase of the PR branch.
