# Skill & Framework Routing Guide

A decision aid for picking the right approach per task. Built from the installed
harness (superpowers + graphify) and the native Workflow tool.

> **Golden rule:** Ceremony scales to the task. Three *independent* inputs decide
> the approach — never collapse them into one axis.

---

## 0. The three independent inputs

| Input | Question | Decides |
| :-- | :-- | :-- |
| **Clarity** | Are the requirements unambiguous? | How much **interview / human gating** |
| **Scale** | How big, and do the parts run in parallel? | Which **execution engine** |
| **Risk** | How costly is a wrong direction / a bad change? | How deep the **verification gates** |

These are orthogonal. A task can be *clear + large + high-risk* (skip interview,
fan out with a workflow, but add adversarial verification gates).

---

## 1. TL;DR decision flow

```
[1] Requirements clear?
      ├─ NO  → clarify first: brainstorming (superpowers)
      │         (resolve ambiguity, THEN re-evaluate)
      └─ YES → skip heavy interview and execute

[2] Now pick the EXECUTION ENGINE by scale:
      trivial (typo, 1-liner, obvious fix) → just do it directly (NO skill)
      small / sequential                   → single skill: test-driven-development / systematic-debugging
      large / sequential + review matters   → subagent-driven-development (superpowers)
      large / parallel / audit / migration  → Workflow tool (ultracode)

[3] Apply RISK modifier (independent of clarity):
      high risk → add gates even when clear:
                  verification-before-completion + /code-review before merging
```

---

## 2. Decision matrix

| Clarity | Risk | Scale | Recommended path |
| :-- | :-- | :-- | :-- |
| Vague | — | — | **brainstorming first**, then re-judge |
| Clear | Low | trivial / small | **Direct** or single skill (test-driven-development / systematic-debugging) |
| Clear | Low | large · parallel | **Workflow / ultracode** |
| Clear | Low | large · sequential | **subagent-driven-development** (autonomous) |
| Clear | **High** | large | Autonomous + **verification gates** (verification-before-completion → /code-review) |

**Anti-pattern:** Running brainstorming's HARD-GATE or a workflow on a trivial fix.
That is over-engineering and contradicts "Simplicity First". superpowers is NOT
the "simple/auto" tier — it is ceremony-heavy.

---

## 3. The execution engines (same layer, different shapes)

All of these are *execution-layer* tools. They differ on **autonomy**,
**parallelism**, and **who drives the control flow**.

| Engine | Source | Flow driver | Parallel? | When |
| :-- | :-- | :-- | :-- | :-- |
| **Direct** | — | me | no | trivial / small |
| **subagent-driven-development** | superpowers | model (me) | sequential, review-gated | large sequential, review quality matters, same session |
| **executing-plans** | superpowers | model (me) | sequential, parallel session | large sequential, separate session |
| **Workflow / ultracode** | native tool | **code (JS script)** | **massively parallel** fan-out | large, independent units, audits, migrations |

**Loop vs Workflow:** a loop repeats over *time* (1 context, N iterations). A
workflow distributes over *space* (N agents, parallel — and may *contain* loops).
They are different axes, not synonyms.

---

## 4. Skill catalog by category (Claude side)

### Design / planning (front of the pipeline)
- **brainstorming** (superpowers) — idea → approved spec, HARD-GATE before any code
- **writing-plans** (superpowers) — spec → multi-step implementation plan

### Execution
- **subagent-driven-development** (superpowers) — fresh impl agent + review per task
- **executing-plans** (superpowers) — same, in a parallel session
- **Workflow / ultracode** (native) — parallel agent fan-out, adversarial verify
### Debugging
- **systematic-debugging** (superpowers) — disciplined debugging loop

### Verification / quality
- **verification-before-completion** (superpowers) — evidence before claiming done
- **code-review** (`/code-review`, `ultra` for cloud multi-agent)
- **simplify** — reuse/simplification/efficiency cleanups (quality, not bugs)
- **receiving/requesting-code-review** (superpowers)

### Infrastructure
- **using-git-worktrees** (superpowers) — isolated workspace before feature work;
  prerequisite for parallel/subagent execution
- **worktree-spawn** (weed-harness) — deterministic PORT_BASE for parallel
  multi-port dev servers

### Architecture / knowledge
- **graphify** (standalone, `~/.claude/skills/graphify` via `graphify install`) —
  any input → knowledge graph (code/docs/papers/images)
- **understand-anything** — codebase → interactive knowledge graph

---

## 5. Cross-agent loop skills

Long-running delegated loops share one runtime, shipped in **weed-harness** (repo root
`skills/`, installed on every platform):

- **loop-report** — the live progress page of a run and its delivery (Orca artifact link →
  Orca browser tab → path); each loop plugs in its own view
- **model-routing** — Codex · OpenCode · Orca only: the one table of Default / Deep tiers with the model and
  reasoning-effort pair per platform (Codex `spawn_agent`, Claude Code agents, OpenCode, Orca
  `worker-start` flags) and the escalation ladder
- **loop-gates** — how the loops use the upstream unlazy skill so "done" is a re-verified
  ledger, not a report

On top of it, two loops with different graphs:

- **matt-loop** (`plugins/matt-loop-claude/skills/` on Claude Code, `plugins/matt-loop-codex/skills/` elsewhere): **matt-auto** conducts Matt Pocock's main flow
  (interview → spec → tickets → implementation → optional PR via `--dev`/`--main`; `--spec`
  starts from a confirmed design-map spec whose step tags fix the ticket tiers), publishing
  its decision graph through loop-report and running independent tickets as parallel Orca
  workers; **pr-babysit** shepherds one open PR without merging; **resolving-merge-conflicts**
  resolves an active merge/rebase on the Deep tier
- **auto-loop** (`plugins/auto-loop-claude/skills/` on Claude Code, `plugins/auto-loop-codex/skills/` elsewhere): **autocode** runs a hypothesis-driven parallel
  improvement loop (`init --spec` pre-fills it from a design-map spec), publishing its
  experiment board through loop-report and ending in a PR of the kept changes (one squash
  commit each, on a worktree branch; `run --pr <base>` / `--no-pr`)
- **graphify** (`graphify install --platform codex`) stays a standalone install

Native plugin and npx installation availability differs by platform; see the repository README.

---

## 6. The canonical pipeline (substantial work)

```
brainstorming                 ← clarify (if vague)
        ↓
writing-plans                 ← plan
        ↓
using-git-worktrees           ← isolated workspace
        ↓
EXECUTE  ── pick by scale ──→  subagent-driven / executing-plans / Workflow
        ↓
verification-before-completion + code-review
        ↓
finishing-a-development-branch
```

Not every task uses every stage. Trivial work skips the whole thing — just do it.

---

## 7. Quick anti-pattern checks

- Trivial fix → reaching for brainstorming/workflow = **over-engineering**
- Treating superpowers as the "simple/auto" tier = **backwards** (it is heavy)
- Picking "superpowers vs workflow" by clarity = **wrong axis** (clarity → interview;
  scale → engine)
- Running a workflow on tightly-coupled sequential tasks = **wasted parallelism**
  (use subagent-driven instead)
- Autonomous execution on a vague spec = **fast path to confidently-wrong output**
