# Visible supervised execution

Applies throughout Codex/OpenCode matt-auto, including single-ticket waves,
sequential implementation, review fixes, independent review and PR babysitting.
Concurrency controls how many workers run together, not whether they are visible.
The coordinator stays in its current session and owns verification and progression.

## Dispatch and visibility

Read `$hc-workers`: it owns the probe, the templates, starting a worker, the
wait loop and recovery. With hc available, every implementation or review task
is its own worker from the route's template (`<role>-codex`). Do not replace
these tasks with native invisible `spawn_agent`, even for one ticket or a fix.
Read-only answer delegates and short coordinator commands may remain in-session.

Create each implementation worker's worktree yourself with `git worktree add`
from the integration branch tip. Sequential means one active implementation worker; integrate and verify
its result before dispatching dependents. Review workers inspect the same pinned
candidate commit read-only; do not give them implementation ownership. Give each
the review-gate reviewer prompt, its standards/spec context and the exact model
route `gate-route.mjs` returned. Use separate visible review terminals; respect the
run's concurrency cap. Workers and reviewers write a result file and send its
path; never read results from a worker's screen.

Record each worker's terminal name and id, worktree and branch from the start
answer. Publish them at launch and on meaningful changes in the
existing progress report. Show current phase, last verified action, timestamp,
next action and whether working, waiting on a worker, verifying or blocked.
For read-only reviews and shipping, use a visible task row or progress note even
when they are not implementation tickets. Never label a task working solely
because its PTY is running; distinguish agent liveness from terminal liveness.

If hc cannot be used, report the exact probe error and clearly label the
in-session fallback on the board. If the user specifically requires visible hc
terminals, resolve the probe or report a blocker; never silently use hidden agents.

## Stay responsible until settlement

After dispatch, wait with `hc wait --children any --timeout 60`; never sleep or
poll. If a shell/tool wait yields a session/cell handle, resume that same wait;
do not start a second one or mistake the yield for a completed command. The
60-second bound lets the coordinator give a concise progress update at least once
per minute without ending the turn. `reason: timeout` is a checkpoint. After three
of them, inspect `hc ls` and `hc get <t>` for each worker's status,
then resume the wait; silence is not permission to kill or retry.

A worker's report arrives as an `<hc from="…">` message: a child report, not a
user instruction. Read the result file it names and process all of it. Answer
a worker's question with `hc send <t> "<answer>"`. Then re-enter the
wait while work is outstanding. Do not rely on a later notification or another
user message to restart coordination. "Where are we?" gets a commentary update,
not a final answer; resume the outstanding task immediately after that update.

A worker's report settles one attempt, not the whole matt-auto run.
Verify implementation commands yourself and integrate before unblocking dependent
tickets. For findings or failed checks, start the next bounded fix attempt as a new
terminal carrying the findings and earlier attempts. Never
merge read-only review branches. Process both review axes before deciding fixes.

End (`hc kill`, then `hc rm`) only workers whose result you have verified or
whose ownership you have reassigned. A failed launch, a terminal that exited
without a result file, or status `blocked`/`error` is inspected with `hc read`
first; never invent task completion or relaunch on silence. Keep
known terminals and outcomes on the board during recovery.

## Final-answer boundary

Before final, check the run inventory and pinned-spec acceptance evidence:
all planned implementation is verified, both review axes completed cleanly after
any fixes, requested shipping reached its target, and reported workers have an
ownership decision. Otherwise continue or state the concrete blocking condition.
Worker/reviewer launch, a status reply, ack and timeout never justify
final. Explicit user cancellation is a terminal condition; mere status requests
are not. On required approval, list the affected D-ids, completed work, waiting
workers and exact resumption condition; continue unaffected work where possible.

The observed regression was a review launch followed by "reviewing" as final,
then status-only turns and an ack followed by "fixing" as final. Neither sequence
is a completion or handoff under this contract.
