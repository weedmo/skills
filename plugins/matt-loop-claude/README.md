# matt-loop (Claude Code package)

The Claude Code root of the **matt loop**. `.claude-plugin/plugin.json` lists `skills/` and `agents/`.

- `skills/matt-auto` — the Claude Code edition of the conductor: a fork as the decision delegate (or `matt-deep` when the session is not Fable-class), plugin agents for tickets, background Agents in worktrees for the ticket frontier (Workflow or `/batch` where they fit), `$qa-gate` and `$review-gate` for the QA and review pass (`/simplify` · `/security-review` on request), `/loop` for PR shepherding, the Artifact tool for the decision-graph page; `core` mode implements in the session itself. Design comes from `$matt-design` in its own session; `--confirm` adds the only gate.
- `skills/pr-babysit`, `skills/resolving-merge-conflicts` — Claude Code editions (plugin-agent routing, `/loop` cycle).
- `agents/` — `matt-loop:matt-default` (opus / medium) and `matt-loop:matt-deep` (fable / high); each fixes model and effort.
- The remaining skill directories are vendored from [mattpocock/skills](https://github.com/mattpocock/skills) by `../matt-loop-codex/scripts/sync-upstream.sh` (this root skips `code-review`; the built-in `/code-review` is used instead). Do not hand-edit them.
- Requires weed-harness 7.1+ (`interview-report`, `loop-report`, `loop-gates`, `hc-workers`). Never reads `model-routing` or runs `deliver.py`.
