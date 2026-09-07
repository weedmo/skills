# matt-loop (Codex package)

This directory is the Codex · OpenCode · Orca root of the **matt loop**; the Claude Code edition lives in `../matt-loop-claude` and shares the vendored skills (synced into both roots by `scripts/sync-upstream.sh`) and the lock file kept here.

## Contents

- `.codex-plugin/plugin.json` for Codex plugin metadata
- `skills/matt-auto` — conductor that drives Matt Pocock's main flow end to end (grilling interview → spec → tracer-bullet tickets → per-ticket implementation); a decision delegate answers implementation-level questions, unresolved material decisions escalate to the human, and prior approval is reused (`--confirm` requests fresh review gates); with `--dev` / `--main` / `--pr <base>` it also opens a PR against that base and shepherds it to merge-ready (pr-babysit, conflict resolution, push); when Orca orchestration is available, independent ticket waves automatically run as parallel Orca-orchestrated workers (`--parallel N` / `--on <env>` override concurrency and placement) (Run → Task → Dispatch) in separate worktrees, optionally on another connected machine, while verification and merging stay with the coordinator
- `skills/pr-babysit` — shepherds one GitHub PR through review and CI without merging it
- `skills/resolving-merge-conflicts` — routed fork of the upstream conflict-resolution skill
- Routing — the authored skills map their roles (matt-default / matt-deep) onto the tiers of weed-harness's shared `model-routing` skill, which holds the model/effort pair per platform and the escalation ladder; on Codex that dispatches through `spawn_agent` overrides
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
