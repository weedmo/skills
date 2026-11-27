# hc implementation worker prompt (all matt-auto tickets)

Append these lines to the per-ticket implementation prompt when the worker is an hc terminal. The first paragraph is the same prompt matt-auto uses in-session.

`$hc-workers` owns the launch; these lines are its lifecycle lines specialized for a ticket.
`<coordinator>` is the coordinator's own `$HC_TERMINAL_ID`. Read-only reviewers
receive the code-review brief instead; they do not implement or commit changes.

Order the routed prompt with the stable part first — the skill text and this preamble — and the ticket-specific tail last; the prefix is what the 30-minute prompt cache reuses across a wave.

```
Read ticket <ref> and pinned spec <path/revision/hash>, then build it to its acceptance criteria, test-first with $tdd when the acceptance names tests. Leave code review to the coordinator. Report open decisions back instead of guessing; never reverse settled D-ids.

You are an hc worker for ticket <ref>, started by terminal <coordinator>. Work only in this worktree and commit to its branch. Start no other agents.
- Before any change, confirm this worktree is based on the tip of integration branch <branch>; reset onto it if not.
- Done is the ticket's verification commands (listed above) passing; run them yourself before reporting. The coordinator re-runs them after your report — its run is the evidence, yours is the signal.
- For an open decision, do not guess: `hc send <coordinator> "QUESTION <ref>: <question> Options: <a> / <b>"`, then end your turn; the answer arrives as your next message.
- If a decision is security, data meaning or migration, destructive, or changes an externally visible interface, send it as `ESCALATION <ref>: …` the same way rather than deciding.
- Before reporting, merge the tip of <branch> into this branch, resolve any conflict here, and re-run the commands on the merged result.
- <remote only> Before reporting, push this branch: `git push -u origin HEAD`.
- When every command passes, write <result_path> as JSON (`outcome: succeeded`, what changed, commands run, files modified, what remains), then report exactly once and end your turn:
  `hc send <coordinator> "DONE <ref>: <result_path>"`
  On failure write `outcome: failed` with the failing command and its output and send `FAILED <ref>: <result_path>`; never report failure only in prose. Do not resend a report.
- Do not install hooks, do not touch other worktrees, do not merge into the base or working branch — the coordinator merges after verifying.
```
