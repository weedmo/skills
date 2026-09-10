# matt-loop (Codex package)

This directory is the Codex · OpenCode · Orca root of the **matt loop**; the Claude Code edition lives in `../matt-loop-claude` and shares the vendored skills (synced into both roots by `scripts/sync-upstream.sh`) and the lock file kept here.

## Contents

- `.codex-plugin/plugin.json` for Codex plugin metadata
- `skills/matt-auto` — conductor that drives Matt Pocock's main flow end to end (grilling interview → spec → tracer-bullet tickets → per-ticket implementation); a decision delegate answers implementation-level questions, unresolved material decisions escalate to the human, and prior approval is reused (`--confirm` requests fresh review gates); with `--dev` / `--main` / `--pr <base>` it also opens a PR against that base and shepherds it to merge-ready (pr-babysit, conflict resolution, push); when Orca orchestration is available, independent ticket waves automatically run as parallel Orca-orchestrated workers (`--parallel N` / `--on <env>` override concurrency and placement) (Run → Task → Dispatch) in separate worktrees, optionally on another connected machine, while verification and merging stay with the coordinator
- `skills/pr-babysit` — shepherds one GitHub PR through review and CI without merging it
- `skills/resolving-merge-conflicts` — routed fork of the upstream conflict-resolution skill
- Routing — questions select Astra low/xhigh per difficulty; implementation uses `model-routing`'s six Codex pairs and designated Gemini-priority slots with Codex quota fallback; review is independent Astra xhigh
- `codex/agents/` — Codex roles for `matt-fast`, `matt-default`, `matt-batch`, `matt-standard`, `matt-deep`, `matt-deep-max`, `matt-reviewer`, `matt-answer`, and `matt-answer-deep`, installed to `~/.codex/agents/`; each pins model and effort, while Default also pins standard service tier and low verbosity
- `skills/interview-report` — matt-auto's decision-graph view (`assets/view.html` + `validate.py`); the page around it and its delivery (Orca artifact link or browser tab) come from weed-harness's shared `loop-report` skill, and completion gates follow its `loop-gates` convention — matt-loop requires weed-harness 4.x
- `opencode/agents/` — task-tier agents installed only for OpenCode; Codex execution uses six allowed pairs, with separate Astra low/xhigh answer roles; large context prioritizes strongest Gemini/max thinking, then Codex on quota exhaustion; unavailable allowed pairs stop dispatch
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
default_subagent_model = "gpt-5.6-luna"      # trivial work; select named roles for other tasks
default_subagent_reasoning_effort = "low"
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
  without complaint. That historical check predates the current pair policy;
  tier and verbosity are not visible in session logs — check the bill.
- Execution: trivial = Luna low; small fixes/tests/mechanical conflicts = Luna
  medium; bounded background = Luna max; moderate time-sensitive = Sol low;
  complex = Astra low; escalated/review = Astra xhigh. Never use Astra merely
  because a simple edit blocks the user.
- Questions: `matt-answer` (Astra low) for ordinary explanations/local decisions;
  `matt-answer-deep` (Astra xhigh) for difficult interacting constraints.
  Select before each question, including follow-ups; start hard questions on
  xhigh and return to low for the next easy question. Reuse matching delegates
  and transfer the current decision log when switching. These roles are read-only.
- This selects answer delegates, not the parent session's model or effort.
  Implementation uses its own routes regardless of which model discussed it.
  See `skills/matt-auto/references/answer-routing.md` for continuity and retries.
- Legacy `-max` names mean Astra xhigh. Reviewers independently inspect source
  and never fix it. Failed dispatch cannot inherit unspecified defaults.
