---
name: autocode
description: "Hypothesis-driven parallel code improvement loop. A strategist on the expensive tier proposes falsifiable hypotheses with pre-committed if_confirmed / if_refuted actions; experimenters routed by difficulty implement them concurrently in git worktrees; the coordinator measures serially, keeps by arithmetic, and feeds every result back to the strategist so the frontier is revised as results arrive. Kept changes land as one squash commit each on an experiment branch in its own worktree — the user's checkout never moves — and the run ends by opening a PR of the kept changes (never merged). Subcommands: init [N] [--spec <path>], run [--parallel N] [--on <env>] [--pr <base> | --no-pr], status, resume."
argument-hint: "<subcommand: init|run|status|resume> [max experiments] [--spec <path>] [--parallel N] [--on <env>] [--pr <base> | --no-pr]"
---

# Autocode — Hypothesis-Driven Parallel Improvement

Autonomous loop that improves one measurable metric of a codebase as fast as possible per wall-clock hour. Three ideas make it fast:

1. **Hypotheses, not experiments.** The strategist emits falsifiable claims, each carrying the experiment that tests it, the files it touches, a difficulty tier, and what to do next in either outcome. Replanning after a result is a delta to the frontier, never a fresh plan.
2. **Parallel where safe, serial where not.** Hypotheses with disjoint `touches` run concurrently, each in its own worktree. Measurement is a serial critical section because concurrent benchmarks contaminate each other.
3. **Route by difficulty.** The strategist runs on the expensive tier; each experimenter on the cheapest tier its hypothesis needs. Keep/discard, scheduling, and merging are arithmetic — no model at all.

Inspired by [autoresearch](https://github.com/karpathy/autoresearch). The run is visible the whole time on a live **experiment board** built and delivered by the shared `$loop-report` skill, republished on every state change (3I), and termination is backed by runnable [unlazy](https://github.com/Leonxlnx/unlazy) gates through the shared `$loop-gates` convention (2E). If a shared skill is missing, say `weed-harness 4.x required: <skill> missing` once and continue with the fallback it names.

Templates, schemas, verbatim prompts, the board view, and its data checks live in the shared `$autocode-board` skill (weed-harness); `<autocode-board's dir>` is the directory holding its SKILL.md. Read the named section of its `<autocode-board's dir>/assets/reference.md` only at the step that writes or sends that data.

## Subcommands

| Command | Action | User Confirmation |
|---|---|---|
| `/autocode init [N] [--spec <path>]` | Interview → `program.md`. N = max experiments (default 20, 0 = unlimited). `--spec` replaces the interview with a confirmed design-map spec | Reuse prior answers and approval; ask for unresolved choices |
| `/autocode run [--parallel N] [--on <env>] [--pr <base> \| --no-pr]` | Run the loop until budget, target, or exhaustion; then open the PR of kept changes | None (autonomous) |
| `/autocode status` | Frontier, running experiments, best metric, routing tally | None |
| `/autocode resume` | Continue from `state.json` after interruption | None |

## Step 0: Paths

`PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)`; `AUTOCODE_DIR=$PROJECT_ROOT/.autocode`. Under it: `PROGRAM_FILE=program.md`, `RESULTS_FILE=results.tsv`, `STATE_FILE=state.json`, `HYP_DIR=hypotheses/`, `WORKTREE_DIR=worktrees/`, `LESSONS_DIR=lessons/`, `LOGS_DIR=logs/`, `RETRO_DIR=retrospectives/`, `REPORT_DIR=report/` (autocode.data.json / autocode.html / autocode.delivery.json). Full tree: `<autocode-board's dir>/assets/reference.md` § File structure.

## Step 1: Parse Subcommand

- No args or `init` → Step 2. Optional integer N = `max_experiments`. `--spec <path>` names a design-map spec: read it; frontmatter `status` other than `confirmed` → print `spec not confirmed: run /design-map first` and stop.
- `run` → Step 3. `--parallel N` (default from program.md, max 4), `--on <env>` (Orca environment for remote workers), and `--pr <base>` / `--no-pr` override program.md for this run only.
- `status` → Step 4. `resume` → Step 5.

---

## Step 2: Init (`/autocode init [N]`)

### 2A: Reconnaissance (no questions yet)

Scan the repo before asking anything: language and build system, test command, existing benchmark or profiling scripts, hot-path candidates (large functions, loops over collections, I/O in request paths), and how many modules the target spans. Use these facts to propose defaults in the interview and to classify difficulty in 2C. With `--spec`, read the spec's `## 큰 틀` and `## 확정 구조` alongside.

### 2B: Interview (one question at a time, dynamic follow-ups)

Reuse user and reconnaissance answers. Ask only unresolved choices affecting the outcome, using Codex's available clarification tool (e.g. `request_user_input_async`) or chat; `AskUserQuestion` requires a platform exposing it. Continue independent work while required answers are pending. Fields and defaults: `target_files`, `metric_name`, `metric_command` (last line: one number), `metric_direction` (lower), `guard_command` (detected tests), `worktree_setup`, `scope` (module), `forbidden_zones`, `max_experiments` (N or 20), `performance_target`, `parallel` (1–4, default 2), `pr_base` (current branch; `none` disables PR). Wording, spec keys, and follow-ups are in `<autocode-board's dir>/assets/reference.md` § Interview fields.

With `--spec` skip the interview: design-map's self-grill and the user's confirmation were it; the `metric` block fills its keys (§ Interview fields), the rest and the follow-ups take recon or defaults; nothing is asked.

### 2C: Difficulty classification (strategist tier)

Classify the problem from the recon and the answers, and show the classification in the approval step so the user can override it:

- **standard** → strategist on the Deep route (`strategist`).
- **hard** → on Codex, the `strategist-max` role from the start; on Claude Code and OpenCode the Deep `strategist` with `escalated = true` recorded at init (Deep is their ceiling). Either way the escalation budget (3E) is spent.

Classify **hard** when any of: scope is system-wide; the target spans more than three modules; the metric is already within a known bound (prior optimization attempts plateaued); concurrency, distributed state, or numerical stability is involved; or the user says it is hard. Otherwise **standard**. With `--spec`, the reach of its 확정 구조 is evidence.

### 2D: Generate `program.md`

Template: `<autocode-board's dir>/assets/reference.md` § program.md (Target, Metric, Guard, Worktree, Constraints, Budget — including `pr_base` — Routing, Plateau — `consecutive_discard_threshold: 5`, `window: 8`, `unlazy_gates` — Strategy Hints); fill every field from 2B/2C. With `--spec`, set the template's `spec` line to the path and put the spec's `## 큰 틀` and `## 결정` table under Strategy Hints. Create `results.tsv` with header `seq\thypothesis\troute\tcommit\tmetric\tdelta\tstatus\tnote`, the directories from Step 0, and add `.autocode/` to `.gitignore` as part of the requested initialization (preserve existing entries; worktrees live under it and must never be committed).

### 2E: Runnable completion gates (unlazy, optional)

Follow `$loop-gates`: locate unlazy once; if missing, ask once whether to install it (`npx skills add Leonxlnx/unlazy -g`), on decline set `unlazy_gates: false` and continue. If present, write `$AUTOCODE_DIR/GATES.md` with one gate per script under `$AUTOCODE_DIR/verify/` (portable Node, no dependencies):

- `verify-guard.mjs` — runs the guard inside `.autocode/worktrees/best`; prints `autocode gate passed: guard` on exit 0.
- `verify-metric.mjs` — re-runs the metric inside `.autocode/worktrees/best` and asserts it is at least as good as `best_metric` in `state.json` within the noise band; prints `autocode gate passed: metric`. It re-measures; it never trusts the recorded number.
- `verify-target.mjs` — only with `performance_target`; re-measures and asserts the target is met; prints `autocode gate passed: target`.

Scripts read thresholds from `program.md` / `state.json`, so `CHECK:` lines never change and one approval keeps the loop autonomous. Read every check and approve the coordinator-authored ledger once (`gate-check.mjs --approve`) as specified by `$loop-gates`, provided its commands stay within the user's authorized scope. New external or destructive actions still require authorization. The coordinator re-verifies it at termination (3F); the retry bound, the handoff on unmet gates, and the Orca boundaries are loop-gates'. Do not install unlazy's Stop hook.

### 2F: Approval

Present `program.md` with difficulty, tier, scope, budget, and PR destination. Reuse prior approval covering these choices (a confirmed `--spec` is prior approval); otherwise request it through the platform's permitted approval flow, not a clarification-only tool. Silence is not approval; initialization alone does not authorize a run.

---

## Step 3: Run (`/autocode run`)

The session running this skill is the **coordinator**. It owns scheduling, measurement, keep/discard, merging, state, and the conversation with the strategist. It never edits target code and never reasons about what to try next — that is the strategist's job.

### 3A: Pre-flight

1. `program.md` exists, target files exist, working tree clean (else stop and say so).
2. Create the experiment branch in its own worktree — the user's checkout is never moved. If `$WORKTREE_DIR/best` already exists: a `state.json` whose `terminated_reason` is null means an interrupted run → stop and say `run /autocode resume`; otherwise `git worktree remove --force` it. Then `git worktree prune` and `git worktree add "$WORKTREE_DIR/best" -b "autocode/<slug>" HEAD`. `<slug>` is the spec's `slug` when program.md names a spec, else `metric_name` slugified (`p95_latency_ms` → `p95-latency-ms`); if the branch exists, append `-2`, `-3`, …. Run `worktree_setup` inside it if set. Record `base_branch` and `base_commit` (this HEAD) in `state.json`. `best` always means the head of this branch, and every command that touches it runs inside `$WORKTREE_DIR/best`. Resolve `pr_base`: `--pr <base>` / `--no-pr` → else program.md `pr_base` → else `base_branch`.
3. Run the guard on the unmodified code inside `$WORKTREE_DIR/best`; abort if it fails.
4. Resolve routing (3H). Probe Orca only if `--on <env>` was given or program.md `parallel` > 1 and the user asked for Orca at init: `orca status --json`, `orca orchestration run-list --json` (on `bad option: --no-sandbox`, retry with `orca-ide`). Without Orca, workers are in-session subagents in local worktrees — the default, not a degraded mode.
5. Load lessons from `$LESSONS_DIR/*.json`.
6. **Probe report delivery** — `python3 <loop-report's dir>/assets/deliver.py probe --page .autocode/report/autocode.html` (the page need not exist yet) and print its answer with the other pre-flight facts (`Report delivery: link` / `tab — <why>` / `path — <why>`). Print `PR: autocode/<slug> → <pr_base>` (or `PR: none`) in the same block.

### 3B: Baseline and noise band

Run the metric command **three times** on the unmodified code in `$WORKTREE_DIR/best`, serially. Validate each value is a finite number (abort with the raw output otherwise). Record `baseline` = median of the three and `noise_band` = max |run − median|, floored at 0.5% of |median|. A change counts as an improvement only when it beats `best_metric` by more than `noise_band` in the configured direction. This is the only keep/discard rule in the whole loop.

Write `state.json` (`<autocode-board's dir>/assets/reference.md` § state.json: branch, base_branch, base_commit, pr_base, pr_url, baseline, noise_band, best_metric, best_commit, experiments_done, max_experiments, parallel, strategist_tier, strategist_agent_id, running, consecutive_discards, escalated, terminated_reason). Display the baseline, noise band, branch, PR base, parallelism, strategist tier, and worker placement, then **publish the board for the first time** (3I) — `progress.state: running`, the metric strip, an empty frontier. From here on every state change republishes it.

### 3C: Spawn the strategist (persistent)

Spawn one persistent strategist (`auto-loop:strategist` on Claude Code; Codex `strategist`, or `strategist-max` for hard; see 3H). Keep its id in `state.json`. Codex: `send_message` while running, `followup_task` after completion. Other platforms use their continuation tool. Follow `$model-routing` for fallbacks and effort-changing handoffs; preserve context except on escalation or session loss.

Its first prompt carries the **strategist brief** (`<autocode-board's dir>/assets/reference.md` § Strategist brief, verbatim), `program.md`, the baseline and noise band, the lessons, the target file paths, and the hypothesis schema (§ Hypothesis: id, claim, experiment, expected_delta, touches, depends_on, difficulty default|deep, if_confirmed, if_refuted, priority, status), and asks for the **initial frontier**: at least `2 × parallel` hypotheses, preferring disjoint `touches`. Hypothesis `status` moves `pending → running → measured → keep | discard | crash | conflict | interaction | cancelled`. On every result event the strategist replies with a frontier delta — `add`, `cancel`, `reprioritize`, `escalate`, `note` (§ Strategist reply) — never a new plan.

### 3D: Scheduler loop (event-driven)

The coordinator runs this loop until 3F terminates it. Every state change is written to `state.json` immediately (atomic write), every result appended to `results.tsv`, and every state change **republishes the board** (3I): a dispatch, a measurement, a keep/discard, a strategist delta applied, a plateau or escalation. Not on a timer, not per commit.

```
loop:
  # 1. FILL — keep `parallel` experiments running
  frontier = hypotheses with status=pending whose depends_on are all keep, sorted by priority
  for H in frontier while len(running) < parallel:
      skip H if H.touches intersects touches of any running hypothesis
      dispatch(H)                              # 3D-1
  # 2. WAIT for the first completion (never for the whole batch)
  H = next finished experimenter (task notification)
  # 3. MEASURE — serial critical section (3D-2)
  # 4. DECIDE + MERGE — arithmetic (3D-3)
  # 5. FEED BACK — one message to the strategist, apply its delta (3D-4)
  # 6. TERMINATE? (3F) else loop
```

If the frontier is empty while nothing is running, ask the strategist for a refill once; if it returns nothing twice in a row, terminate with `exhausted`.

#### 3D-1: Dispatch one hypothesis

1. Worktree: `git worktree add "$WORKTREE_DIR/H{id}" -b "autocode/H{id}" "$best_commit"`. Run `worktree_setup` inside it if set (note the duration on the first run; if it dominates, say so in the final summary).
2. Route by `difficulty` (3H) and spawn the experimenter **in the background** with the **experimenter prompt** (`<autocode-board's dir>/assets/reference.md` § Experimenter prompt, verbatim): edit only `touches`, never `forbidden_zones`, respect `immutable_constraints`; smallest change; guard with at most two fix-and-retry rounds; commit `experiment(H{id}): {short}`; write `.autocode/hypotheses/H{id}.result.json` (`status: implemented | crash | beyond_scope`, `commit`, `summary`, `observations`, `obstacle`) in the main checkout; never run the metric, merge, touch other worktrees, or install hooks. Orca placement (only when `--on <env>` was given or the user chose Orca at init and 3A's probe succeeded): `orca orchestration run-create` once per run, then `task-create` + `worker-start --task <id> --worktree path:<worktree> <route flags>` with the same prompt plus Orca lifecycle lines (report with `worker_done`, ask with `orchestration ask`); route flags from `$model-routing`'s Orca table. A `worker_done` is verified by reading the result file and the branch; it is a signal, not evidence.
3. Set `H.status = running`, add to `state.running`, log the route in `results.tsv` later.

#### 3D-2: Measure (serial)

The coordinator itself runs the metric, one experiment at a time, in the worktree:

1. `result.status` `crash` → record `crash`, skip measurement.
2. `beyond_scope` → re-dispatch once on the next route up (default→deep); a `deep` `beyond_scope` becomes `discard` with note `beyond_scope`. Do not count it as an experiment.
3. Otherwise run `metric_command` in the worktree, output to `$LOGS_DIR/H{id}.log`, parse the last line as a number. Non-finite → `crash`. If `screen_command` exists, run it first and skip the full metric when the screen is worse than `best` by more than `noise_band` (record `discard`, note `screened`).
4. Nothing else may run the metric while this step runs. Experimenters never run it.

#### 3D-3: Decide and merge (arithmetic)

```
improved = better_by(metric, best_metric) > noise_band   # in metric_direction
if not improved:
    status = discard; consecutive_discards += 1
else:                                                     # inside $WORKTREE_DIR/best
    git merge --squash autocode/H{id}
    if conflict:  git reset --hard; status = conflict     # another keep touched the same lines
    else:
        re-measure once on the squashed tree (serial, same rules)
        if merged is not finite: git reset --hard; pause the run (3G)
        if better_by(merged, best_metric) > noise_band:
            git commit -m "perf(H{id}): {claim, one line}" -m "{measurement body}"
            status = keep; best_metric = merged; best_commit = HEAD; consecutive_discards = 0
        else:
            git reset --hard; status = interaction        # kept changes cancelled each other
```

One kept hypothesis is one commit on the experiment branch, its message carrying the measurement body (`<autocode-board's dir>/assets/reference.md` § Keep commit — metric before → after with delta, noise band, route, claim, board link). The experimenter's `experiment(H{id})` commit stays on `autocode/H{id}` as the squash's source and is deleted with the branch below; `reset --hard` after a failed re-measure discards the staged squash and leaves `best_commit` untouched.

Then: append `results.tsv` (`seq, H{id}, route, commit, metric, delta, status, note`), write a lesson to `$LESSONS_DIR/lesson_{seq}.json` (`{iteration, type, description, action, tags}`), `git worktree remove --force "$WORKTREE_DIR/H{id}"`, `git branch -D autocode/H{id}`, `experiments_done += 1`. `conflict` and `interaction` mean two hypotheses were not independent; both go to the strategist as such.

#### 3D-4: Feed back one result

Send the strategist a single message (`<autocode-board's dir>/assets/reference.md` § Result message: status, metric vs best and noise band, delta, experimenter summary and observations, consecutive discards, the frontier now, and the instruction to execute H{id}'s pre-committed `if_confirmed` / `if_refuted` as concrete hypotheses or cancellations and reply with a frontier delta).

Apply the delta: write new hypothesis files, mark cancelled ones (a cancelled hypothesis already running is left to finish — its result is still evidence), update priorities. Go back to FILL immediately; never wait for other running experiments.

### 3E: Plateau and escalation

Plateau when `consecutive_discards ≥ 5` **or** no `keep` in the last 8 measured results.

1. Ask the strategist for a retrospective → `$RETRO_DIR/retro_{n}.md` (metric trend, effective patterns, refuted directions, remaining opportunities).
2. If not yet `escalated`: on Codex, spawn `strategist-max` with the retrospective, `program.md`, `results.tsv`, and the lessons, replacing `strategist_agent_id`; on Claude Code and OpenCode, hand the same retrospective to the existing `strategist` (Deep is the ceiling). Set `escalated = true`; request a fresh frontier. Once per run.
3. If already `escalated` (or the strategist itself replied `escalate: true` while escalated): ask it for one final frontier; if that also yields no keep, terminate with `plateau`.

### 3F: Termination

Stop the loop when the first of these holds, after letting running experiments finish and be measured (their evidence is still useful):

- `experiments_done ≥ max_experiments` (when > 0) → `budget_exhausted`
- `best_metric` meets `performance_target` → `target_reached`
- frontier empty and the strategist returned nothing twice → `exhausted`
- plateau persisted through 3E → `plateau`

Then remove leftover hypothesis worktrees and release any Orca dispatches. The user's checkout is where it was; the experiment branch sits at `best_commit` in `$WORKTREE_DIR/best`.

When `unlazy_gates: true`, run `node "$UNLAZY_DIR/scripts/gate-check.mjs" --reverify $AUTOCODE_DIR/GATES.md` first, per `$loop-gates`. Compose the summary only on `ALL MET`; otherwise record `ABANDON: <id> <reason>` in the ledger and end as an explicit handoff naming the unmet gates. `target_reached` must be backed by the target gate's measured evidence. **Gates caught** = gates UNMET on that `--reverify`; write it into the last experiment's lesson file as `"gates_caught": n` (`null` when `unlazy_gates` is false) and print it in the summary (`—` when false).

**Collect the kept changes into a PR** — three cases, decided by arithmetic:

- **No keep** → `git worktree remove --force "$WORKTREE_DIR/best"`, `git branch -D autocode/<slug>`; the summary says `PR: none — nothing kept`. The evidence stays in `results.tsv`, the lessons, and the board.
- **keep ≥ 1 and `pr_base` is `none`** → leave the branch and its worktree; the summary prints the branch and `PR: skipped (--no-pr)`.
- **keep ≥ 1 with a `pr_base`** → from `$WORKTREE_DIR/best`: `git push -u origin autocode/<slug>` (plain push, never force), then `gh pr create --base <pr_base> --head autocode/<slug>` with title `perf: <metric_name> <baseline> → <best> (<improvement>%)` and the final summary as the body, the board link (or its path) as the first line. Record the URL in `state.json` `pr_url` and in the board (`run.pr`). Never merge, never babysit. Check `git ls-remote --heads origin <pr_base>` first: no `origin`, the base not on it (a design-map branch never pushed), a refused push, or `gh` missing or unauthenticated → one line with the reason (`PR: not opened — base not on origin`), the branch name, and the exact `git push` + `gh pr create` lines for the user; the run still ends normally. Never push the base branch yourself.

Then **publish the board one last time** (3I) with `progress.state: "done"`, `run.terminatedReason` set, and the `outcome` block: `outcome.files` measured with `git diff --numstat <base_commit>..<best_commit>` / `--name-status` (`base_commit` from `state.json`, not the base branch — the user may have kept committing there), one Korean line per file, `.autocode/**` left out. That final page is the report the user keeps; the terminal summary points at it.

**Final summary**: `<autocode-board's dir>/assets/reference.md` § Final summary — branch @ best_commit, baseline → best with improvement % and noise band, experiment tally by status, wall clock / experiments per hour / measurement time share, strategist tier and escalation, route tally and re-routes, `Gates caught: {n}`, termination reason, the PR line (URL, or why none), kept changes in commit order, refuted hypotheses worth remembering.

### 3G: Failure handling

- An experimenter that produces no result file within the time budget (default 60 min, or `worktree_setup` + guard duration × 3 once known, whichever is larger) is stopped and recorded as `crash` with note `timeout`. A single Deep turn can legitimately run a quarter of an hour; the budget is for a worker that stopped, not one that is still working.
- A worktree that cannot be created (dirty state, name clash) is removed and re-created once; then the hypothesis is `discard`ed with note `worktree`.
- If the metric command fails on the squashed tree in `$WORKTREE_DIR/best`, the staged squash is discarded (`git reset --hard`, `best_commit` untouched) and the run pauses with a clear message — a broken measurement is not something to loop past.

### 3H: Model routing

Tiers, pairs, dispatch mechanics, and the escalation ladder live in the shared **`$model-routing`** skill. Read it; do not restate pairs here. autocode's roles:

| autocode role | Tier | Claude Code agent | Use when |
|---|---|---|---|
| Strategist | Deep | `auto-loop:strategist` | Default strategist tier |
| Strategist (escalated) | Codex `strategist-max` | `auto-loop:strategist` | `problem_difficulty: hard`, or escalation in 3E — the only role on the `max` rung; role missing → the table's pair, reported once |
| Experimenter default | Background | `auto-loop:experimenter-default` | One-site or multi-site change inside a module: constant/flag tuning, API swap, new helper, data-structure swap, loop restructuring |
| Experimenter deep | Deep | `auto-loop:experimenter-deep` | Algorithm replacement, cross-module restructuring, concurrency, invariants |

- The strategist assigns `difficulty`; the coordinator only translates it into a route. When an experimenter reports `beyond_scope`, re-dispatch once on Deep (3D-2) and mark the hypothesis `rerouted`. **Deep is the ceiling for experimenters**; `strategist-max` is the strategist's alone.
- Orca workers take the tier's `worker-start` flags from `$model-routing`'s Orca table.
- Without an enforceable allowed pair, stop dispatch and report the unavailable route; never inherit the platform's default model or effort.

### 3I: The experiment board

The board is the run's status page and, at the end, its report — built and delivered by `$loop-report` with autocode's own view (`$autocode-board`'s `assets/view.html`, its data checks in `assets/validate.py` beside it). autocode owns the data; loop-report owns the page and the route. Delivery is `deliver.py`'s alone: autocode runs it and relays its answer, never the underlying Orca commands.

**Publish** = write `$REPORT_DIR/autocode.data.json`, then:

```
python3 <loop-report's dir>/assets/render.py \
  --data .autocode/report/autocode.data.json \
  --out  .autocode/report/autocode.html \
  --view <autocode-board's dir>/assets/view.html
python3 <loop-report's dir>/assets/deliver.py publish --page .autocode/report/autocode.html
```

`deliver.py` keeps the route beside the page so every republish lands on the same link or tab; that record is the script's — autocode never reads it. Relay the one-line JSON answer (`route`, `url` or `browserPageId`, `reason`) to the user. `deliver.py probe --page …` is 3A step 6; `deliver.py show --page …` prints the current route without publishing (Step 4). Publish first after the baseline (3B), then on every state change (3D), on plateau/escalation (3E), and last at termination (3F) with `progress.state: "done"` and the `outcome`.

**Data** — the common keys follow loop-report's contract (`title`, `slug: "autocode"`, `generated`, `summary`, `progress`, `outcome`); the view's keys are `run` (including `run.pr { base, url }`) and `hypotheses`, with the JSON and its rules (Korean one-liners for claims/notes/obstacles, `terminatedReason` null until 3F, `progress.current` / `blockers`, never pre-sum what the page derives) in `<autocode-board's dir>/assets/reference.md` § Board data. Read it before the first publish.

---

## Step 4: Status (`/autocode status`)

Read `state.json`, `results.tsv`, and `hypotheses/*.json`; display the block from `<autocode-board's dir>/assets/reference.md` § Status (branch and PR base, best vs baseline, experiment tally, kept commits, running, frontier, strategist, routes used, rate, the PR URL once opened, and the board route from `python3 <loop-report's dir>/assets/deliver.py show --page .autocode/report/autocode.html`).

## Step 5: Resume (`/autocode resume`)

1. Require `program.md` and `state.json`; otherwise say `No run to resume. Run /autocode init then /autocode run.`
2. Make sure the experiment branch is in its worktree — if `$WORKTREE_DIR/best` is missing, `git worktree prune` then `git worktree add "$WORKTREE_DIR/best" "<branch>"` and run `worktree_setup` inside it if set; never check the branch out in the user's checkout. For every id in `state.running`: if its worktree and result file exist, measure it (3D-2/3D-3); if the worktree exists without a result, remove it and set the hypothesis back to `pending`.
3. Respawn the strategist on the recorded tier with `program.md`, `results.tsv`, the lessons, the latest retrospective if any, and the current frontier — this prompt is its whole context.
4. Continue at 3D.

---

## Anti-patterns

- Coordinator editing target code or proposing hypotheses itself → the expensive reasoning is spent once, on hypotheses.
- Experimenter running the metric → measurement is serial by design; a parallel benchmark is noise.
- Waiting for a whole batch before replanning, or respawning the strategist per result → the frontier is revised per result, and the strategist's context is what makes a delta cheap.
- Keeping a change inside the noise band, or trusting a `worker_done` or an experimenter's "it's faster" → status comes from the coordinator's own measurement, nothing else.
- Running one hypothesis at a time when `parallel > 1` and the frontier has disjoint `touches` → that is the sequential loop this design replaces.
- Letting the board go stale, skipping a publish because the link was refused, or delivering with anything but `deliver.py` → the page is the user's window into the run; delivery and the build have one owner.
- Checking the experiment branch out in the user's checkout, merging a keep with `--no-ff`, pushing after every keep, or merging the PR → the branch lives in `$WORKTREE_DIR/best`, one keep is one squash commit, the PR is opened once at 3F, and merging it is the user's call.
