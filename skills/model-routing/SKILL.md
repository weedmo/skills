---
name: model-routing
description: "Codex · OpenCode · Orca only; the Claude Code editions route by their agent files and never read this. Two tiers, Default and Deep, their pair per platform and as Orca worker flags, dispatch rules, the one-step ladder. Reference skill, never invoked standalone."
---

# Model routing (shared)

Classify from the actual task, not keywords; take the lowest tier that is clearly sufficient. A loop's SKILL.md maps its *roles* to a tier here, plus any cap or reservation; pairs, dispatch, and the ladder live only here, so a rename is one edit.

## Tiers

| Tier | Codex `spawn_agent` | Claude Code agent | OpenCode | Use when |
|---|---|---|---|---|
| Default | gpt-5.6-terra / medium | opus / medium | gpt-5.6-terra / medium | Feature work, tests, moderate refactors, small fixes, mechanical edits |
| Deep | gpt-6-astra / high | fable / high | gpt-5.6-sol / high | Hard debugging, architecture, migrations, algorithms, concurrency, invariants, demanding review, whole-run decisions |
| Large context | chunk via Deep | chunk via Deep | Gemini | Repository-scale discovery; large documents, logs, media |

- Codex: Default is terra, Deep and the `max` retry astra. Design decisions never go below Deep.
- OpenCode lacks gpt-6-astra (2026-09-06); its Deep is sol.
- Both plausible → Default; a persistent whole-run role → Deep.
- **Ladder.** Default reaches a concrete reasoning limit → Deep once; Deep reaches its limit → Codex `max` once, otherwise handoff. A loop may reserve `max` for one role. Tier changes require a replacement `spawn_agent`, carrying the brief, findings, attempts, state paths, and constraints. End the previous role's ownership first and record the new id; messages cannot change effort.
- **No `ultra` in a loop.** Astra's `ultra` delegates inside the worker, outside the loop's worktrees, measurement, and re-verification. `max` is the Codex ceiling; `ultra` is for the user's own session.
- **Large context.** Chunk the material, summarize each chunk with source references on the routed agent, synthesize on Deep. OpenCode does the same when its Gemini agent cannot start; Gemini CLI is never needed.

## Dispatch per platform

- **Codex** — `spawn_agent` with the tier's `model` and `reasoning_effort`, `fork_turns: "none"`, and every required path, spec, constraint, and `ROUTED_EXECUTION=1`. Keep persistent ids: `send_message` updates running agents; `followup_task` starts another turn after completion. Messages alone do not restart idle agents. Inspect available schemas; if continuation is unavailable, replace with a context handoff.
- **Claude Code** — the loop's agents fix model and effort (`matt-loop:matt-default` / `matt-deep`, `auto-loop:experimenter-default` / `experimenter-deep` / `strategist`). Spawn by name, no `model` override.
- **OpenCode** — the packaged subagents (`matt-default` / `matt-deep` under `~/.config/opencode/agents/`); without them, the normal subagent, tier named in the prompt.
- **Orca workers** (`orca orchestration worker-start`) — Codex `--agent codex --model <tier model> --effort medium|high`; `--effort max` only with `--retry-of <dispatch>` after Deep reported the problem beyond it. Claude Code `--agent claude --model opus --effort medium` (Default), `--agent claude --model claude-fable-5-1 --effort high` (Deep). OpenCode `--agent opencode` with `ROUTED_EXECUTION=1; use <tier agent>` in the prompt (no model flags reach opencode). Rejected pair → retry without `--effort`; rejected flags → start without them, tier in the prompt; note it on the board.
- **Other platforms, or an unavailable route** — the normal subagent, tier in the prompt, fallback reported once; never a silent swap.
- **Free-only mode** — only the loop's free set (matt-loop's `matt-free` / `matt-free-fast` on OpenCode); a missing free agent stops the run rather than paying. Elsewhere, say it has no route and route normally.

## Red flags

- Asking the user for an effort on Codex, OpenCode, or Claude Code → routing is automatic there.
- A `model` override on a Claude Code routing agent → the agent already fixes both.
- Two retries on a rung, or Codex `max` after a Default failure → one step at a time.
- A routed role on `ultra`, Deep because the task sounds important, a loop with its own pairs → the loop owns orchestration; classify from need; map roles to tiers.
- Guessing pairs when this skill is missing → say `model-routing unavailable — using the platform's normal subagent for every role` once and continue.
