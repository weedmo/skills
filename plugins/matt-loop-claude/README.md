# matt-loop (Claude Code package)

The Claude Code root of the **matt loop**. `.claude-plugin/plugin.json` lists `skills/` and `agents/`.

- `skills/matt-auto` — the Claude Code edition of the conductor: this session implements each ticket in order and verifies it itself; `$qa-gate` and `$review-gate` run in parallel on Codex with at most two fix cycles; in ship mode `$pr-visual` shows the As-Is / To-Be page as an Artifact before the PR and `/loop` drives PR shepherding. No workers, delegate or progress page. Design comes from `$matt-design` in its own session; `--confirm` adds the only gate.
- `skills/pr-babysit` — Claude Code edition (plugin-agent routing, `/loop` cycle); merge and rebase conflicts are its `references/merge-conflicts.md`.
- `skills/matt-design` — the plan session; `references/visualize.md` renders the current design as a page on request.
- `agents/` — `matt-loop:matt-default` (opus / medium) and `matt-loop:matt-deep` (fable / high); each fixes model and effort.
- The remaining skill directories are vendored from [mattpocock/skills](https://github.com/mattpocock/skills) by `../matt-loop-codex/scripts/sync-upstream.sh` (this root skips `code-review`; the built-in `/code-review` is used instead). Do not hand-edit them.
- Requires weed-harness 9.0+ (`qa-gate`, `review-gate`, `pr-visual`, `loop-gates`, `hc-workers` for pr-babysit). Never reads `model-routing` or runs `deliver.py`.
