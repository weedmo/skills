# Autocode v3 — Hypothesis-Driven Parallel Loop

**Date**: 2026-09-03
**Status**: Implemented in `SKILL.md` (supersedes the 2026-04-16 PGE design)
**Author**: weed + Claude

## Problem

The v2 autocode (single + PGE modes) improved a metric at roughly one experiment per
planning cycle:

- Every experiment was sequential — Planner → Generator → Evaluator, one change per iteration.
- Models were fixed per role (sonnet/sonnet/opus) regardless of how hard a given change was.
- Plans did not pre-commit what a result would imply, so every result triggered a fresh plan.
- Half the skill was `auto_research` baggage (23-stage researchclaw pipeline, PIVOT/REFINE
  stage rollbacks, three execution modes) that the user never used.

Goal for v3: **maximize metric improvement per wall-clock hour**, at lower token cost.

## Design

```
init → program.md (target, metric, guard, budget, parallel N, difficulty → strategist tier)
run
  Strategist (persistent; opus/high, or fable/xhigh when the problem is hard)
    baseline + noise band + results + lessons → hypotheses
    hypothesis = { claim, experiment, expected_delta, touches, depends_on,
                   difficulty, if_confirmed[], if_refuted[], priority }
          │
  Scheduler (coordinator = the session; deterministic rules, no model)
    frontier → up to N hypotheses with disjoint `touches`, each in its own git worktree
          ├─ Experimenter fast    (haiku)   ─┐
          ├─ Experimenter default (sonnet)  ─┼─ implement → guard → commit → result.json
          └─ Experimenter deep    (opus)    ─┘  (parallel; never runs the metric)
          │
    Measure — serial critical section, coordinator only
    Decide  — better_by(metric, best) > noise_band ? merge → re-measure → keep : discard
    Feed back one result → strategist replies with a frontier delta (add/cancel/reprioritize)
    Refill the freed slot immediately; repeat
  Plateau → retrospective → escalate strategist deep→max once
  Terminate on budget / target / exhaustion / plateau; unlazy gates back the claim
```

### Why hypotheses with pre-committed actions

A hypothesis is a claim about *why* the metric is where it is. The experiment tests the claim;
`if_confirmed` / `if_refuted` say what the answer implies. Because those are decided up front,
the strategist's response to a result is a small delta to the frontier rather than a new plan,
which keeps the expensive tier's per-event cost low and lets the scheduler refill a freed slot
within one message round trip.

### Why parallel implementation, serial measurement

Implementing and guarding are CPU-tolerant; two experimenters editing disjoint files in
separate worktrees do not affect each other's correctness. Benchmarks are not tolerant: two
metric runs on the same machine contaminate each other's latency, throughput, and memory
numbers. The coordinator therefore runs the metric itself, one at a time. The three-run
baseline gives a **noise band**; only improvements beyond it count. Kept changes are merged
into the experiment branch and re-measured, so an interaction between two individually good
changes is caught (`interaction` status) rather than assumed additive.

### Why route by difficulty

The strategist decides *what* to try and needs the strongest model; the experimenter decides
*how to type it* and usually does not. Each hypothesis carries a `difficulty` the strategist
assigned; the coordinator maps it to a route: fast (haiku) for one-site mechanical changes,
default (sonnet) for multi-site changes inside a module, deep (opus) for algorithm replacement
or invariant-touching work. A `beyond_scope` report re-routes one tier up, once. The strategist
itself starts on opus/high and moves to fable/xhigh either at init (problem classified hard)
or once, on plateau.

### Agents

Shipped in `plugins/auto-loop/agents/` so the plugin works without matt-loop:

| Agent | Model / effort | Role |
|---|---|---|
| `strategist` | opus / high | Default strategist tier |
| `strategist-max` | fable / xhigh | Hard problems and plateau escalation |
| `experimenter-fast` | haiku / low | One-site mechanical changes |
| `experimenter-default` | sonnet / medium | Multi-site changes inside a module |
| `experimenter-deep` | opus / high | Algorithm replacement, cross-module, concurrency |

On Codex the same routes are `spawn_agent` model/effort overrides
(luna/low, terra/medium, sol/high, sol/max). Other platforms fall back to the default subagent
and say so.

### Worker placement

Default: in-session background subagents in local `git worktree`s under `.autocode/worktrees/`.
Overhead is seconds, which matters because a single experiment can be a one-line change. hc
workers (`--on <machine>`, or chosen at init) are available for remote placement, following the
matt-auto supervised path (`hc run --bg` → `hc wait --children`), but they add
minutes per dispatch and are not the default.

## Removed from v2

- `auto_research` skill (entire directory).
- researchclaw 23-stage pipeline, `install` subcommand, stage selection UI.
- PIVOT / REFINE / PROCEED stage rollbacks.
- single / hybrid / PGE mode selection — one loop.
- `.omc/state/autocode-pge-state.json` and the `persistent-mode.mjs` hook reference (that hook
  belonged to another plugin and never existed in this repo).

## Kept from v2

Init interview (trimmed), `program.md`, `results.tsv`, lessons, unlazy runnable gates,
`status` / `resume`, final summary, the simplicity criterion (implicitly: the strategist is told
to prefer the smallest change that tests a claim).

## Open questions / follow-ups

- OpenCode routing agents for auto-loop (`opencode/agents/`), mirroring matt-loop's.
- A `screen_command` proxy metric is specified but its threshold reuses the full metric's noise
  band; a separate screen noise band may be needed for very cheap screens.
- Whether the strategist should be allowed to request a re-measure of `best` when the machine
  is suspected to have drifted (thermal, background load). Currently only re-baselined by
  `resume`.
