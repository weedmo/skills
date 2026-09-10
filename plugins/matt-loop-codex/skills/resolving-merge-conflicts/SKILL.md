---
name: resolving-merge-conflicts
description: "Resolve an in-progress git merge/rebase conflict. Codex and OpenCode start with latency-sensitive routing and escalate only on a concrete reasoning limit."
---

## Standalone routing (Codex, OpenCode, Claude Code)

When invoked directly, inspect the merge state and conflicting hunks before routing. Mechanical conflicts (imports, formatting, lockfile regeneration) start on Default; intent-sensitive conflicts start on Deep. Never escalate solely because Git reports a conflict.

- Read `$model-routing`. On Codex use `matt-default` or `matt-deep` with `fork_turns: "none"`; OpenCode uses the corresponding agent. Use direct tools when already on the selected pair. Claude Code uses `matt-loop:matt-deep` without a model override.
- A concrete reasoning limit follows `$model-routing`'s execution ladder; only a Deep limit permits its extra-high retry. Unsupported routes stop rather than silently changing pairs.
- Use `matt-free` instead when the user explicitly requested free-only models. If that agent is unavailable, stop and report the blocker; never fall back to a potentially paid model.
- Include the user's request, merge/rebase state, repository path, and the exact instruction: `ROUTED_EXECUTION=1; use $resolving-merge-conflicts and complete the conflict resolution.`
- Wait for the routed agent and report its result. Do not duplicate its work in the caller.

If `ROUTED_EXECUTION=1` is present, or this is an internally routed step, execute locally on the assigned allowed pair. Missing/stale roles require an explicit allowed pair; if it cannot be enforced, stop dispatch and report it.

1. **See the current state** of the merge/rebase. Check git history, and the conflicting files.

2. **Find the primary sources** for each conflict. Understand deeply why each change was made, and what the original intent was. Read the commit messages, check the PRs, check original issues/tickets.

3. **Resolve each hunk.** Preserve both intents where possible. Where incompatible, pick the one matching the merge's stated goal and note the trade-off. Do **not** invent new behaviour. Always resolve; never `--abort`.

4. Discover the project's **automated checks** and run them — typically typecheck, then tests, then format. Fix anything the merge broke.

5. **Finish the merge/rebase.** Stage everything and commit. If rebasing, continue the rebase process until all commits are rebased.
