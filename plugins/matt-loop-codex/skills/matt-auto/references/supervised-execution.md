# Visible supervised execution

Applies throughout Codex/OpenCode matt-auto, including single-ticket waves,
sequential implementation, review fixes, independent review and PR babysitting.
Concurrency controls how many workers run together, not whether they are visible.
The coordinator stays in its current session and owns verification and progression.

## Dispatch and visibility

Read the installed orchestration skill's live guide and its coordinator-loop,
placement and recovery references when those operations are needed. Reuse the
resolved Orca executable throughout. In an Orca environment, every implementation
or review task uses `worker-start` with the required model/effort. Do not replace
these tasks with native invisible `spawn_agent`, even for one ticket or a fix.
Read-only answer delegates and short coordinator commands may remain in-session.

Implementation workers receive isolated child worktrees based on the integration
branch. Sequential means one active implementation worker; integrate and verify
its result before dispatching dependents. Review workers inspect the same pinned
candidate commit read-only; do not give them implementation ownership. Pass both
axes from code-review, its standards/spec context and exact model route. Use
separate visible review tasks; respect the run's concurrency cap. Do not dispatch
code-review inside a worker merely to spawn hidden review subagents.

Record each worker's Run, Task, Dispatch, worktree and terminal/session handle
from actual receipts. Publish them at launch and on meaningful changes in the
existing progress report. Show current phase, last verified action, timestamp,
next action and whether working, waiting on a worker, verifying or blocked.
For read-only reviews and shipping, use a visible task row or progress note even
when they are not implementation tickets. Never label a task working solely
because its PTY is running; distinguish agent liveness from terminal liveness.

If Orca cannot be used, report the exact probe error and clearly label the
in-session fallback on the board. If the user specifically requires visible Orca
sessions, resolve the probe or report a blocker; never silently use hidden agents.

## Stay responsible until settlement

After dispatch, enter the orchestration blocking inbox wait. If a shell/tool
wait yields a session/cell handle, resume that same wait; do not start another
inbox consumer or mistake the yield for a completed command. Bound each wait to
60 seconds so the coordinator can give a concise progress update at least once
per minute without ending the turn. An empty wait is a checkpoint. After three
empty waits, inspect the live guide's fleet liveness/attention/next-action data,
then resume the prescribed action; silence is not permission to kill or retry.

On an inbox notification, read and process the whole delivery. Acknowledge only
after replies, verification and ownership decisions are made. Then re-enter the
wait while work is outstanding. Do not rely on a later notification or another
user message to restart coordination. "Where are we?" gets a commentary update,
not a final answer; resume the outstanding task immediately after that update.

An accepted worker_done settles an Orca attempt, not the whole matt-auto run.
Verify implementation commands yourself and integrate before unblocking dependent
tickets. For findings or failed checks, create the next bounded fix attempt using
the live retry contract; do not manually mark a settled task dispatched. Never
merge read-only review branches. Process both review axes before deciding fixes.

Release/reuse/retain only settled workers per the live guide. Failed launch,
rejected worker_done, unknown outcome or uncertain release goes through its
recovery reference; never invent task completion or relaunch on silence. Keep
known handles and outcomes on the board during recovery.

## Final-answer boundary

Before final, check the run inventory and pinned-spec acceptance evidence:
all planned implementation is verified, both review axes completed cleanly after
any fixes, requested shipping reached its target, and settled workers have an
ownership decision. Otherwise continue or state the concrete blocking condition.
Worker/reviewer launch, a status reply, ack, timeout and heartbeat never justify
final. Explicit user cancellation is a terminal condition; mere status requests
are not. On required approval, list the affected D-ids, completed work, waiting
workers and exact resumption condition; continue unaffected work where possible.

The observed regression was a review launch followed by "reviewing" as final,
then status-only turns and an ack followed by "fixing" as final. Neither sequence
is a completion or handoff under this contract.
