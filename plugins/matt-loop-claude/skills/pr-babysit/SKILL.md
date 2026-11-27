---
name: pr-babysit
description: "Use when the user wants you to babysit, watch, monitor, or shepherd one open GitHub PR until it is merge-ready by handling its checks, review feedback, and PR-caused failures. Resolves merge/rebase conflicts. Does not merge unless explicitly requested. Claude Code edition: the coordinator runs in-session, fresh-context subtasks route through plugin agents (matt-default / matt-deep), and the check cycle waits with `/loop`."
---

# PR Babysit

Shepherd one existing PR to a merge-ready state. Watch checks, address actionable review feedback, fix failures caused by the PR, and push focused fixes to the PR branch. Do not merge unless the user explicitly asked for it.

## Merge-ready gates (unlazy)

When the [unlazy](https://github.com/Leonxlnx/unlazy) skill is installed (locate it as `$loop-gates` says; skip this section when absent), "merge-ready" is a measured verdict, not your judgment — the ledger conventions, the coordinator-side `--reverify`, and the retry bound are `$loop-gates`'. After workflow step 2, write `.unlazy/pr-babysit/<pr>.GATES.md`:

```markdown
- [ ] G1: every required check passes on the PR head
  CHECK: gh pr checks <pr> --required
  EXPECT: <a pass indicator from the command's output>
  EVIDENCE: pending

- [ ] G2: GitHub reports no merge conflict
  CHECK: gh pr view <pr> --json mergeable --jq .mergeable
  EXPECT: MERGEABLE
  EVIDENCE: pending

- [ ] G3: no reviewer is requesting changes
  CHECK: gh pr view <pr> --json reviewDecision --jq '.reviewDecision // "NONE"'
  EXPECT: (APPROVED|NONE|REVIEW_REQUIRED)
  EVIDENCE: pending
```

You authored these commands, so approve the ledger yourself (`gate-check.mjs --approve`) and run it between cycles. Wire gate failures to the existing machinery: G1 red → the fix cycle (step 5), G2 unmergeable → [merge conflicts](references/merge-conflicts.md) in the isolated worktree, G3 changes-requested → address the review feedback. A stop condition that is not merge-readiness (external blocker, material decision, repeated failure) becomes `ABANDON: <id> <reason>` — the run ends as an honest handoff, never as a quiet success. Report merge-ready only after `--reverify` prints `ALL MET`; unresolved-but-nonblocking review threads still go in the report as before.

## Routing (Claude Code)

When invoked directly, run the coordinator and deterministic PR commands in this session; do not delegate the whole skill. Fresh-context subtasks go through plugin agents (spawn by name, no `model` override). Include the PR context and `ROUTED_EXECUTION=1; use $pr-babysit and shepherd this PR to merge-ready.` in every child prompt. If `ROUTED_EXECUTION=1` is already present, execute locally. If the plugin agents are unavailable, use the Agent tool with `model: opus`, `effort: medium` (default) or `model: fable`, `effort: high` (deep) and say so once.

| Work | Agent |
|---|---|
| PR metadata, status/check commands | Direct tools |
| Trivial edit, small fix, test update, mechanical conflict, moderate work | `matt-loop:matt-default` |
| Difficult CI failure, semantic conflict, architecture-sensitive review | `matt-loop:matt-deep` |
| Very large logs or repository-wide evidence | Chunk and summarize with `matt-loop:matt-deep` (keep check names and source links), then hand the fix to default or deep |

Default to `matt-default`; escalate to `matt-deep` only on a concrete limit. A conflict alone does not justify deep.

## Running as an hc worker

When the prompt names a coordinator terminal and a result path (an explicit `hc run` launch; matt-auto's ship step usually stays in-session), run this workflow with `ROUTED_EXECUTION=1` and `$hc-workers`: `hc send` blocking `QUESTION:` / `ESCALATION:` lines, then finish once by writing the result file (`outcome: succeeded|failed`, ledger tally, stop condition) and `hc send <coordinator> "DONE|FAILED: <result_path>"`. A non-merge-ready stop is `outcome: failed` with unmet ids, never prose-only. The coordinator re-verifies its ship ledger after your report.

## Workflow

1. **Identify the PR.** Use the supplied number/URL, or infer the PR for the current branch with `gh pr view`. If inference is ambiguous, ask for the PR reference.
2. **Snapshot scope.** Read the PR title, body, base/head branches and repositories, commits, changed files, reviews, unresolved review threads, and check runs. Record the base SHA so pre-existing failures can be distinguished from PR-caused failures.
3. **Isolate the PR branch.** Before any edit, create an isolated worktree checked out to the PR's actual head repository and ref. Verify the push destination from GitHub metadata, including fork ownership and write permission. Never edit, commit, or push from the caller's original branch; if the head ref cannot be checked out or pushed safely, stop and report the blocker.
4. **Classify the state.** Separate actionable items into: pending external work, mechanical fixes, normal fixes, deep fixes, large-log analysis, material decisions, and failures already present on the base branch.
5. **Work one cycle.** Dispatch independent read-only analysis in parallel. Apply only PR-scoped fixes inside the isolated worktree, follow the repository's branch and verification rules, commit focused changes, and push normally to the exact PR head ref. Never force-push unless the user explicitly authorized a rebase workflow.
6. **Watch checks.** If checks are pending, use `gh pr checks <pr> --watch` whether or not this run pushed a fix. Re-read reviews and checks when they settle. Between cycles (waiting on reviewers, a re-run, or external work) do not sleep or poll in a tight loop: schedule the next cycle with the built-in `/loop` (for example `/loop 5m` re-invoking this skill's cycle on the PR). If the user needs to close the session before merge-ready, offer a `/schedule` routine that runs the next cycle.
7. **Repeat with a bound.** Continue for at most five fix-and-watch cycles. Stop earlier when the PR is merge-ready or a stop condition applies.
8. **Clean up and report.** Remove the isolated worktree. Give the PR URL, commits pushed, review items addressed, final checks, remaining blockers, and whether it is merge-ready.

## Stop conditions

- **Merge-ready:** required checks pass, no unresolved actionable review feedback, and GitHub reports no merge conflict.
- **External blocker:** pending human approval, unavailable secret/infrastructure, third-party outage, or a failure already present on the base branch. Report it; do not wait forever.
- **Material decision:** security, data meaning/migration, destructive operation, public interface change, or conflicting reviewer requirements. Ask the user with a recommended answer.
- **Repeated failure:** the same failure survives two focused fixes, or five total cycles complete. Report evidence and stop instead of thrashing.

## Rules

- Do not broaden scope to unrelated red checks or opportunistic cleanup.
- Do not dismiss review feedback without a concrete rationale; report any feedback intentionally left unresolved.
- Do not approve your own PR or fabricate another reviewer's approval.
- Do not merge, close, retarget, or convert the PR to draft unless explicitly requested.
- Never claim merge-ready from local tests alone; check GitHub's current PR state. With unlazy installed, that means `--reverify` on the merge-ready ledger prints `ALL MET` — your own reading of the checks page is not evidence.
