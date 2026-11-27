# matt-loop (Codex package)

This directory is the Codex · OpenCode root of the **matt loop**; the Claude Code edition lives in `../matt-loop-claude` and shares the vendored skills (synced into both roots by `scripts/sync-upstream.sh`) and the lock file kept here.

## Contents

- `.codex-plugin/plugin.json` for Codex plugin metadata
- `skills/matt-auto` — executes a confirmed spec in this session: tickets in the log, each implemented and verified in order, then QA and review by the other model family in parallel (at most two fix cycles); material decisions return to the user and `--confirm` adds a ticket-plan gate; with `--dev` / `--main` / `--pr <base>` it shows the As-Is / To-Be page (`pr-visual`), opens a PR against that base and shepherds it to merge-ready (a visible hc `pr-babysit` worker when available, with its conflict resolution)
- `skills/matt-auto/references/execution-core.md` — the execution rules both editions share (tickets, implement and verify, parallel QA/review, stops, change control); the same file ships in `../matt-loop-claude` and `npm test` fails when the copies differ
- `skills/pr-babysit` — shepherds one GitHub PR through review and CI without merging it; `references/merge-conflicts.md` is the routed conflict-resolution procedure
- `skills/matt-design` — the plan session; `references/visualize.md` renders the current design as a page on request
- Routing — pr-babysit and conflict work use `model-routing`'s six Codex pairs and designated Gemini-priority slots with Codex quota fallback; QA and review run through weed-harness `qa-gate` / `review-gate`, whose rule table makes the writer's other model family review (Sol medium / Sonnet by default, one step up on risk)
- `codex/agents/` — Codex roles for `matt-fast`, `matt-default`, `matt-batch`, `matt-standard`, `matt-deep`, `matt-deep-max`, `matt-reviewer`, `matt-answer`, and `matt-answer-deep`, installed to `~/.codex/agents/`; each pins model and effort, while Default also pins standard service tier and low verbosity
- Pages — matt-auto has no progress page; the As-Is / To-Be page and matt-design's design page are delivered with weed-harness `loop-report`'s `deliver.py` (opened once with the system opener, or the path); completion gates follow `loop-gates` — matt-loop requires weed-harness 9.0+
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
next sync. matt-design, matt-auto, and pr-babysit are
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
default_subagent_model = "gpt-6-luna"      # trivial work; select named roles for other tasks
default_subagent_reasoning_effort = "low"
max_concurrent_threads_per_session = 4       # parallel QA author + reviewer, lookups
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
- Execution: trivial = Luna low; small fixes/tests/mechanical conflicts = Terra
  medium; bounded background = Terra medium; moderate time-sensitive = Sol low;
  complex = Astra low; escalated = Astra xhigh; review = `review-gate`'s rule table (Sol medium, Sol high on risk). Never use Astra merely
  because a simple edit blocks the user.
- `matt-answer` / `matt-answer-deep` remain in `model-routing`'s table for
  read-only question answering; matt-auto itself no longer runs a delegate and
  answers implementation-level questions in its own session.
- Legacy `-max` names mean Astra xhigh. Reviewers independently inspect source
  and never fix it. Failed dispatch cannot inherit unspecified defaults.
