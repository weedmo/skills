# Autocode — reference

Templates and schemas the coordinator writes during a run. `SKILL.md` names the section to read
at the point where each one is needed; nothing here changes the procedure.

## Interview fields (2B)

Use the calling skill's platform-specific question flow. Reuse answers from the user,
spec, and reconnaissance; propose defaults and ask only about unresolved choices.

| Field | Question | Default | `--spec` key |
|---|---|---|---|
| `target_files` | "Which file(s) or directories may experiments modify?" | — | metric.target_files |
| `metric_name` | "What metric measures success? (e.g. p95_latency_ms, bundle_bytes)" | — | metric.name |
| `metric_command` | "Shell command that prints the metric as a single number on the last line?" | — | metric.command |
| `metric_direction` | "Lower or higher is better?" | lower | metric.direction |
| `guard_command` | "Tests/lint/typecheck that must pass before a change is measured?" | detected test cmd | metric.guard |
| `worktree_setup` | "Command to prepare a fresh checkout so guard and metric run? (deps, build)" | none | — |
| `scope` | "How far may changes go? function / module / system" | module | — |
| `forbidden_zones` | "Files or areas that must not change?" | none | metric.forbidden |
| `max_experiments` | "Maximum number of experiments? (0 = unlimited)" | N or 20 | — |
| `performance_target` | "Target metric value for early termination?" | none | metric.target |
| `parallel` | "How many experiments may run concurrently? (1–4)" | 2 | — |
| `pr_base` | "Which branch should the PR of kept changes target? (none = no PR)" | current branch | — |

Follow-ups: a directory target → "Any hot-path files inside it?"; scope ≥ module → "Must public
interfaces stay compatible?"; system scope → "External systems or data formats involved?";
guard is tests only → "Add typecheck or lint to the guard?"; metric command runs > 60 s →
"Is there a shorter proxy metric for screening?" (store as `screen_command`, optional).

## program.md (2D)

~~~markdown
# Autocode Program
spec: {design-map spec path|null}

## Target
- **files**: {target_files}
- **read_only_context**: {reference-only files}

## Metric
- **name**: {metric_name}
- **command**: `{metric_command}`
- **direction**: {lower|higher}
- **screen_command**: `{screen_command|null}`

## Guard
```
{guard_command}
```

## Worktree
- **setup**: `{worktree_setup|null}`

## Constraints
- **scope**: {function|module|system}
- **interface_compat**: {true|false}
- **forbidden_zones**: [{forbidden_zones}]
- **immutable_constraints**: [{from follow-ups}]

## Budget
- **max_experiments**: {N} (0 = unlimited)
- **performance_target**: {value|null}
- **parallel**: {1-4}
- **pr_base**: {branch|none}

## Routing
- **problem_difficulty**: {standard|hard}
- **strategist_tier**: {deep|max}
- **experimenter_routes**: default | deep (per hypothesis, chosen by the strategist)

## Plateau
- **consecutive_discard_threshold**: 5
- **window**: 8
- **unlazy_gates**: {true|false}

## Strategy Hints
{user hints or extra context}
~~~

## state.json (3B)

```json
{
  "branch": "autocode/p95-latency-ms",
  "base_branch": "feat/validator",
  "base_commit": "a1b2c3d",
  "pr_base": "feat/validator",
  "pr_url": null,
  "baseline": 182.4,
  "noise_band": 2.1,
  "best_metric": 182.4,
  "best_commit": "a1b2c3d",
  "experiments_done": 0,
  "max_experiments": 20,
  "parallel": 2,
  "strategist_tier": "deep",
  "strategist_agent_id": null,
  "running": [],
  "consecutive_discards": 0,
  "escalated": false,
  "terminated_reason": null
}
```

## Hypothesis (3C)

`.autocode/hypotheses/H007.json`:

```json
{
  "id": "H007",
  "claim": "Per-request JSON schema compilation dominates p95; caching the compiled validator removes it.",
  "experiment": "Memoize compileSchema() by schema identity in src/validate.ts; public API unchanged.",
  "expected_delta": "-15% to -25% p95_latency_ms",
  "touches": ["src/validate.ts"],
  "depends_on": [],
  "difficulty": "default",
  "if_confirmed": ["Apply the same memoization to the response serializer (src/serialize.ts)", "Add an LRU bound once hit ratio is known"],
  "if_refuted": ["Schema compile is off the hot path; profile the handler (new hypothesis) before more caching"],
  "priority": 2,
  "status": "pending"
}
```

`status` moves `pending → running → measured → keep | discard | crash | conflict | interaction | cancelled`.

## Strategist reply (3C)

On every result event:

```json
{
  "add": [ { "...hypothesis..." } ],
  "cancel": ["H003"],
  "reprioritize": { "H005": 1 },
  "escalate": false,
  "note": "H007 confirmed at -19%; H003 assumed compile was cheap, cancelled."
}
```

## Strategist brief (3C)

Include verbatim in the strategist's first prompt:

> You are the strategist of an autocode run. You only produce hypotheses; you never edit code
> and never run the metric. Each hypothesis is a JSON object written to
> `.autocode/hypotheses/H{NNN}.json` with the schema in your prompt. Prefer hypotheses that are
> independent (disjoint `touches`) so they can run concurrently. Assign `difficulty` honestly:
> `default` for one-site or multi-site changes within a module,
> `deep` for algorithm replacement, cross-module restructuring, or anything touching invariants.
> Pre-commit `if_confirmed` and `if_refuted`: the concrete next hypotheses or cancellations each
> outcome implies. When the coordinator sends you a result, reply with a frontier delta
> (`add`, `cancel`, `reprioritize`, `escalate`, `note`) — not a new plan. Respect
> `forbidden_zones`, `scope`, and `immutable_constraints`. If the current framing is spent, set
> `escalate: true` and say why instead of producing variations of refuted ideas.

## Experimenter prompt (3D-1)

> Implement exactly hypothesis `{id}` in the worktree `{path}` (branch `autocode/H{id}`).
> Hypothesis: {claim}. Experiment: {experiment}. Expected: {expected_delta}. You may edit only
> {touches}; never touch {forbidden_zones}; respect {immutable_constraints}. Steps: (1) read the
> relevant code, (2) make the smallest change that tests the hypothesis, (3) run the guard
> `{guard_command}` — on failure fix and retry at most twice, (4) `git add -A && git commit -m
> "experiment(H{id}): {short}"`, (5) write `.autocode/hypotheses/H{id}.result.json` in the main
> checkout with `{ "status": "implemented" | "crash" | "beyond_scope", "commit": "<sha>",
> "summary": "<what changed>", "observations": "<anything the strategist should know>",
> "obstacle": "<only for crash/beyond_scope>" }`. Do **not** run the metric command; the
> coordinator measures. Do not merge, do not touch other worktrees, do not install hooks.

For an Orca worker, append the lifecycle lines (report with `worker_done`, ask with
`orchestration ask`).

## Keep commit (3D-3)

One squash commit per kept hypothesis, written by the coordinator inside `worktrees/best`:

```
perf(H007): memoize the compiled validator by schema identity

metric   p95_latency_ms 182.4 -> 147.3 (-19.2%)
noise    ±2.1
route    experimenter-default (opus/medium)
claim    per-request schema compilation dominates p95
board    https://claude.ai/code/artifact/… (or the page path)
```

The subject is `perf(H{id}): ` + the claim's action in one line; the body is the measurement
the experimenter's commit could not know. `metric` is best-before → measured-after on the
squashed tree (the re-measure, not the worktree number).

## Result message (3D-4)

One message per measured result, to the same strategist conversation:

> Result for H{id}: status={status}, metric={metric} (best {best_metric}, noise ±{noise_band}),
> delta={delta}. Experimenter summary: {summary}. Observations: {observations}. Consecutive
> discards: {n}. Frontier now: {ids and statuses}. Execute the pre-committed
> `if_confirmed` / `if_refuted` of H{id} as concrete hypotheses or cancellations, then reply
> with a frontier delta.

## Board data (3I)

The common keys follow loop-report's contract (`title`, `slug: "autocode"`, `generated`,
`summary`, `progress { state, updated (from the clock), startedAt, current, note, blockers }`,
`outcome`); the view's keys are:

```json
"run": {
  "branch": "autocode/p95-latency-ms", "bestCommit": "a1b2c3d",
  "pr": { "base": "feat/validator", "url": null },
  "metric": { "name": "p95_latency_ms", "direction": "lower", "baseline": 182.4, "noiseBand": 2.1, "best": 151.0, "target": 120 },
  "budget": { "done": 6, "max": 20, "parallel": 2, "placement": "local" },
  "strategist": { "tier": "deep", "escalated": false, "consecutiveDiscards": 1 },
  "terminatedReason": null
},
"hypotheses": [
  { "id": "H007", "seq": 5, "claim": "…", "experiment": "…", "expectedDelta": "-15% ~ -25%",
    "status": "keep", "difficulty": "default", "route": "experimenter-default",
    "worker": { "model": "opus", "effort": "medium", "worktree": ".autocode/worktrees/H007", "dispatchId": "" },
    "touches": ["src/validate.ts"], "dependsOn": [], "priority": 2,
    "metric": 151.0, "delta": -19.2, "commit": "9f8e7d6", "startedAt": "…", "measuredAt": "…",
    "ifConfirmed": ["…"], "ifRefuted": ["…"], "note": "…", "obstacle": "", "rerouted": false }
]
```

- `hypotheses` mirrors `hypotheses/*.json` + `results.tsv`: every hypothesis the run has seen,
  with `status` as in 3C (`pending … cancelled`), `seq` = measurement order (measured ones
  only), `metric` the measured value, `delta` the signed percent against the best at the time,
  `worker` the model/effort the route resolved to (plus worktree, and the dispatch id for an
  Orca worker). Claims, notes, and obstacles are translated into one plain Korean line each;
  the strategist's English JSON is not pasted through.
- `run.pr` is `{ base, url }` — `base` the resolved `pr_base` (`"none"` when the PR is off),
  `url` null until 3F opens it; the page shows the tile only when `run.pr` is present.
- `run.terminatedReason` is null until 3F, then one of `budget_exhausted`, `target_reached`,
  `exhausted`, `plateau`, or `paused` (3G's measurement pause). `validate.py` refuses an
  `outcome` without it.
- `progress.current` is the one line the coordinator is on right now ("H007 측정 중", "전략가
  프론티어 갱신 대기"); `progress.blockers` carries anything that stops the run — 3G's paused
  measurement, a worktree that cannot be created — with the checkable fact in `detail`.
- The page derives everything else (improvement %, the trend chart, routes tally, ETA from the
  median experiment duration); never pre-sum numbers into the data.

## Final summary (3F)

```
## Autocode Final Summary

- Branch: autocode/{slug} @ {best_commit} (in .autocode/worktrees/best; your checkout is unchanged) | removed — nothing kept
- Baseline: {baseline} → Best: {best_metric} ({improvement}%), noise band ±{noise_band}
- Experiments: {done} ({kept} keep, {discarded} discard, {crashed} crash, {conflict} conflict, {interaction} interaction)
- Wall clock: {elapsed}; {experiments/hour}; measurement time share {pct}%
- Strategist: {deep|max}{, escalated at experiment N}
- Experimenter routes: default {n} / deep {n}; re-routed {n}
- Gates caught: {n}
- Termination: {reason}
- PR: {url} → {pr_base} | none — nothing kept | skipped (--no-pr) | not opened — {reason}, then `git push -u origin {branch}` + `gh pr create --base {pr_base} --head {branch}`

### Kept changes (in commit order)
1. H{id} — {claim} ({delta}%)
...

### Refuted hypotheses worth remembering
- H{id} — {claim} → {what the result showed}
```

`Gates caught` is the number of gates that came back UNMET on the 3F `--reverify`; `—` when
`unlazy_gates` is false. The same number goes into the lesson file of the last experiment as
`"gates_caught": n` (`null` when `unlazy_gates` is false).

## Status (Step 4)

```
## Autocode Status

**Branch**: autocode/{slug} @ {best_commit} (in .autocode/worktrees/best; removed after a run with nothing kept) → PR base {pr_base|none}
**Best**: {metric_name} {best_metric} (baseline {baseline}, {improvement}%, noise ±{noise_band})
**Experiments**: {done}/{max} — {kept} keep · {discarded} discard · {crashed} crash · {conflict} conflict · {interaction} interaction
**Kept commits**: {kept} on the branch{ · PR {pr_url}}
**Running** ({n}/{parallel}): H012 (default, 4 min) · H015 (deep, 1 min)
**Frontier**: {pending count} pending — next: H016 (p1), H013 (p2)
**Strategist**: {deep|max}{ (escalated)} · consecutive discards {n}
**Routes used**: default {n} / deep {n}
**Rate**: {experiments/hour}, measurement share {pct}%
**Board**: {link | tab + path | path} (from `deliver.py show --page .autocode/report/autocode.html`)
```

## File structure

```
.autocode/                          # gitignored
├── program.md                      # init output
├── state.json                      # coordinator state, rewritten on every event
├── results.tsv                     # append-only experiment log
├── hypotheses/
│   ├── H001.json                   # strategist output
│   └── H001.result.json            # experimenter output
├── worktrees/best/                 # the experiment branch autocode/<slug>; the user's checkout never moves
├── worktrees/H001/                 # one git worktree per running experiment (removed after measure)
├── lessons/lesson_001.json
├── logs/H001.log                   # metric stdout/stderr
├── retrospectives/retro_1.md       # written on plateau
├── GATES.md                        # [unlazy] runnable termination gates
├── verify/*.mjs                    # [unlazy] gate scripts
└── report/                         # the experiment board (see 3I)
    ├── autocode.data.json          # what autocode writes
    ├── autocode.html               # what loop-report renders
    └── autocode.delivery.json      # deliver.py's route record; autocode never reads it (use `deliver.py show`)
```
