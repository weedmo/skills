# matt-loop (Codex package)

This directory is the Codex · OpenCode · Orca root of the **matt loop**; the Claude Code edition lives in `../matt-loop-claude` and shares the vendored skills (synced into both roots by `scripts/sync-upstream.sh`) and the lock file kept here.

## Contents

- `.codex-plugin/plugin.json` for Codex plugin metadata
- `skills/matt-auto` — conductor that drives Matt Pocock's main flow end to end (grilling interview → spec → tracer-bullet tickets → per-ticket implementation); a decision delegate answers implementation-level questions, unresolved material decisions escalate to the human, and prior approval is reused (`--confirm` requests fresh review gates); with `--dev` / `--main` / `--pr <base>` it also opens a PR against that base and shepherds it to merge-ready (pr-babysit, conflict resolution, push); when Orca orchestration is available, independent ticket waves automatically run as parallel Orca-orchestrated workers (`--parallel N` / `--on <env>` override concurrency and placement) (Run → Task → Dispatch) in separate worktrees, optionally on another connected machine, while verification and merging stay with the coordinator
- `skills/pr-babysit` — shepherds one GitHub PR through review and CI without merging it
- `skills/resolving-merge-conflicts` — routed fork of the upstream conflict-resolution skill
- Routing — implementation maps to Default/Deep while independent review is reserved to Sol; on Codex every route dispatches by role name through `spawn_agent`
- `codex/agents/` — Codex roles for `matt-default`, `matt-deep`, `matt-deep-max`, and Sol-only `matt-reviewer`, installed to `~/.codex/agents/`; each pins model and effort, while Default also pins standard service tier and low verbosity
- `skills/interview-report` — matt-auto's decision-graph view (`assets/view.html` + `validate.py`); the page around it and its delivery (Orca artifact link or browser tab) come from weed-harness's shared `loop-report` skill, and completion gates follow its `loop-gates` convention — matt-loop requires weed-harness 4.x
- `opencode/agents/` — task-tier agents installed only for OpenCode; authored skills route fast, ordinary, deep, large-context, and explicitly free-only work to the configured models, with chunked OpenAI fallback when Gemini is unavailable
- Remaining skill directories are vendored from [mattpocock/skills](https://github.com/mattpocock/skills) and remain directly invocable for partial work
- `mattpocock.lock.json` — pinned upstream commit and the list of vendored skills
- `scripts/sync-upstream.sh` — re-vendors the pinned skill list from upstream and refreshes the lock file
- `AGENTS.md` with Codex-specific notes

## Upstream sync

The vendored skills are managed automatically: the `sync-mattpocock.yml`
GitHub Actions workflow runs daily, re-runs `scripts/sync-upstream.sh`, and —
when upstream changed — bumps the matt-loop patch version and commits. Do not
hand-edit the vendored skill directories; changes will be overwritten on the
next sync. matt-auto, pr-babysit, and resolving-merge-conflicts are
weedmo-authored and are never touched by the sync.

## Installation

Normally you do not install this package directly: cherry-pick the skills into
`~/.codex/skills/` once, and the `auto-update.sh` SessionStart hook (registered
by `/setup hooks` in Claude Code) keeps them in sync with the marketplace clone
afterwards.

Root installation instructions live in the repository `README.md`.

## Codex cost settings (documented, never written by the installer)

The role files under `~/.codex/agents/` carry the per-role model, effort, tier,
and verbosity. Two things they cannot carry belong in your own
`~/.codex/config.toml` — the installer never edits that file:

```toml
[agents]
default_subagent_model = "gpt-5.6-terra"      # any spawn without a role stays on the Default tier
default_subagent_reasoning_effort = "medium"
max_concurrent_threads_per_session = 4       # matt-auto's --parallel ceiling; do not go below it
```

- Do not set a low `model_auto_compact_token_limit` for worker roles: compaction
  resets the prompt cache mid-ticket, and the routed prompt is ordered stable
  prefix first so a wave of workers shares it (30-minute TTL).
- `service_tier` in `config.toml` is global. If a Codex version ignores the
  role files' `service_tier`, the choice is "priority everywhere" (your session
  and every worker at fast-mode prices) or "standard everywhere" — there is no
  per-worker fallback. Verified on Codex 0.153.4 (2026-09-07): `--strict-config`
  loads the role files with `service_tier`, `model_verbosity`, and `xhigh`
  without complaint and a `matt-default` spawn runs on `gpt-5.6-terra`; whether
  tier and verbosity are applied is not visible in session logs — check the bill.
- Not adopted: a `gpt-5.6-luna` tier for mechanical tickets (10× cheaper than
  terra). Kept as an autocode experiment candidate — metric: cost per passed
  ticket — because a luna failure costs a terra retry.
- `matt-reviewer` always uses `gpt-5.6-sol` at high effort and never implements
  fixes; Astra, Grok, and Default-tier output therefore gets an independent prior.
