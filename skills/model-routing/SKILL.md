---
name: model-routing
description: "Codex · OpenCode · Orca routing reference: Default and Deep task tiers, the Sol review reservation, platform pairs, dispatch, and the one-step ladder. Never invoked standalone."
---

# Model routing (shared)

Use the lowest sufficient tier for the actual task. Loops map roles here with caps or reservations; pairs, dispatch, and the ladder live here.

## Tiers

| Tier | Codex `spawn_agent` | Claude Code agent | OpenCode | Use when |
|---|---|---|---|---|
| Default | gpt-5.6-terra / medium | opus / medium | gpt-5.6-terra / medium | Feature work, tests, moderate refactors, small fixes, mechanical edits |
| Deep | gpt-6-astra / high | fable / high | gpt-5.6-sol / high | Hard debugging, architecture, migrations, algorithms, concurrency, invariants, demanding review, whole-run decisions |
| Large context | chunk via Deep | chunk via Deep | Gemini | Repository-scale discovery; large documents, logs, media |

- Codex: Default is terra, Deep and `max` astra. Design decisions never go below Deep.
- OpenCode lacks gpt-6-astra; its Deep is sol.
- **Review.** Codex reserves `matt-reviewer` (gpt-5.6-sol / high) for independent implementation review. Missing role → use that pair, reported once. Never implements fixes.
- **Grok.** Fallback only for absent Gemini credentials or exhausted token quota; see design-map's execution reference.
- Both plausible → Default; a persistent whole-run role → Deep.
- **Ladder.** Default reaches a concrete reasoning limit → Deep once; Deep reaches its limit → `matt-deep-max` / `strategist-max` once, otherwise handoff. A loop may reserve `max` for one role. Tier changes require a replacement `spawn_agent`, carrying the brief, findings, attempts, state paths, and constraints. End the previous role's ownership first and record the new id; messages cannot change effort.
- **No `ultra` in a loop.** Astra's `ultra` delegates inside the worker, outside the loop's worktrees, measurement, and re-verification. `max` is the ceiling; `ultra` is the user's own.
- **Large context.** Chunk the material, summarize each chunk with source references on the routed agent, synthesize on Deep. OpenCode does the same when its Gemini agent cannot start; Gemini CLI is never needed.

## Dispatch per platform

- **Codex** — `spawn_agent` by role (`matt-default` / `matt-deep` / `matt-deep-max` / `matt-reviewer`; autocode `experimenter-default` / `experimenter-deep` / `strategist` / `strategist-max`), `fork_turns: "none"`, with required context and `ROUTED_EXECUTION=1`. Role files fix model and effort; missing role → the named pair, reported once. Use messages for a running role and follow-up for an idle one.
- **Claude Code** — the loop's agents fix model and effort (`matt-loop:matt-default` / `matt-deep`, `auto-loop:experimenter-default` / `experimenter-deep` / `strategist`). Spawn by name, no `model` override.
- **OpenCode** — the packaged subagents (`matt-default` / `matt-deep` under `~/.config/opencode/agents/`); without them, the normal subagent, tier named in the prompt.
- **Orca workers** (`orca orchestration worker-start`) — Codex `--agent codex --model <tier model> --effort medium|high`; `--effort max` only with `--retry-of <dispatch>` after Deep reported its limit. Claude Code `--agent claude --model opus --effort medium` (Default), `--agent claude --model claude-fable-5-1 --effort high` (Deep). OpenCode `--agent opencode` with `ROUTED_EXECUTION=1; use <tier agent>` in the prompt (no model flags reach opencode). Rejected pair → retry without `--effort`; rejected flags → start without them, tier in the prompt; note it on the board. Orca workers keep the user's tier.
- **Other platforms or unavailable route** — the normal subagent, tier in the prompt, fallback reported once.
- **Free-only mode** — only the loop's free set (matt-loop's `matt-free` / `matt-free-fast` on OpenCode); a missing free agent stops the run rather than paying. Elsewhere, say it has no route and route normally.

## Red flags

- Asking the user for an effort → routing is automatic.
- A `model` override on a Claude Code routing agent → the agent already fixes both.
- Two retries on a rung, or Codex `max` after a Default failure → one step at a time.
- A routed role on `ultra`, Deep because the task sounds important, a loop with its own pairs → the loop owns orchestration; classify from need; map roles to tiers.
- Guessing pairs when this skill is missing → say `model-routing unavailable — using the platform's normal subagent for every role` once and continue.
