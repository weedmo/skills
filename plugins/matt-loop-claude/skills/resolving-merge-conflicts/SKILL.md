---
name: resolving-merge-conflicts
description: "Use when you need to resolve an in-progress git merge/rebase conflict. Claude Code edition: inspect first, then route mechanical conflicts to matt-default and intent-sensitive ones to matt-deep."
---

## Routing (Claude Code)

When invoked directly, inspect the merge state and conflicting hunks before routing. Mechanical conflicts (imports, formatting, lockfile regeneration) start on `matt-loop:matt-default`; intent-sensitive conflicts start on `matt-loop:matt-deep`. Never escalate solely because Git reports a conflict.

- Spawn the plugin agent by name with no `model` override. If that agent is unavailable, use the Agent tool with `model: opus`, `effort: medium` (default) or `model: fable`, `effort: high` (deep) and report the fallback.
- Include the user's request, merge/rebase state, repository path, and the exact instruction: `ROUTED_EXECUTION=1; use $resolving-merge-conflicts and complete the conflict resolution.`
- Wait for the routed agent and report its result. Do not duplicate its work in the caller.

If `ROUTED_EXECUTION=1` is present, or this is an internally routed step, execute the steps below locally and do not delegate again.

1. **See the current state** of the merge/rebase. Check git history, and the conflicting files.

2. **Find the primary sources** for each conflict. Understand deeply why each change was made, and what the original intent was. Read the commit messages, check the PRs, check original issues/tickets.

3. **Resolve each hunk.** Preserve both intents where possible. Where incompatible, pick the one matching the merge's stated goal and note the trade-off. Do **not** invent new behaviour. Always resolve; never `--abort`.

4. Discover the project's **automated checks** and run them — typically typecheck, then tests, then format. Fix anything the merge broke.

5. **Finish the merge/rebase.** Stage everything and commit. If rebasing, continue the rebase process until all commits are rebased.
