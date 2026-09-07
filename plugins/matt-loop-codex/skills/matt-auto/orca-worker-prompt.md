# Orca worker prompt (matt-auto parallel waves)

Append these lines to the per-ticket implementation prompt when the worker is an Orca dispatch. The first paragraph is the same prompt matt-auto uses in-session.

Order the routed prompt with the stable part first — the skill text and this preamble — and the ticket-specific tail last; the prefix is what the 30-minute prompt cache reuses across a wave.

```
Read ticket <ref>, then use $implement to build it. Report open decisions back instead of guessing.

You are an Orca-orchestrated worker for task <task_id> (dispatch <dispatch_id>). Work only in this worktree and commit to its branch.
- Done is the ticket's verification commands (listed above) passing; run them yourself before reporting. The coordinator re-runs them after your report — its run is the evidence, yours is the signal.
- For an open decision, do not guess: `orca orchestration ask --question "<question>" --options "<a>,<b>" --timeout-ms 600000 --json`, and wait for the reply. Resume a timed-out question with `ask --resume <message_id>`.
- If a decision is security, data meaning or migration, destructive, or changes an externally visible interface, send it as an escalation (`orca orchestration send --type escalation …`) rather than deciding.
- <remote only> Before reporting, push this branch: `git push -u origin HEAD`.
- When every command passes, report exactly once and end your turn:
  `orca orchestration send --type worker_done --subject "<status>" --body "<what changed, commands run, what remains>" --task-id <task_id> --dispatch-id <dispatch_id> --outcome succeeded --files-modified "<paths>" --json`
  On failure use `--outcome failed` with the failing command and its output in the body; never report failure only in prose. If Orca answers that the dispatch capability is revoked, do not resend — the coordinator still receives the rejected report and verifies your branch.
- Do not install hooks, do not touch other worktrees, do not merge into the base or working branch — the coordinator merges after verifying.
```
