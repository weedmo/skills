# Execution core

The **integration branch** is the working branch, or the PR branch in ship mode.

## Frontier dispatch

The **frontier** is every ticket whose blockers are
merged into the integration branch. Keep it running up to the concurrency cap:
when a ticket merges, recompute it and dispatch what became ready. Hold a ready
ticket back only while a running ticket touches the same files or section, its
assumptions depend on that ticket, it is exploratory, or merging would collide.
The plan's `waves` are the page's forecast of dependency layers, not a barrier.

## Shared exploration (optional)

With three or more tickets, or tickets reading the same unfamiliar module, run
one exploration worker first. It saves markdown notes outside the repo for later
workers; record the path in the log. Brief every worker with **context
pointers** (ticket ref, pinned spec, notes path, earlier commits), not restated
content.

## Worker contract

Every implementation worker also:

- before any change, confirms its worktree is based on the integration branch
  tip and resets onto it if not;
- before reporting, merges the integration branch tip into its own branch,
  resolves any conflict there, and re-runs the ticket's verification commands;
- never merges into the integration branch itself.

## Coordinator merge

When a worker reports, run the ticket's verification commands yourself in its
worktree, then `git merge --no-ff <branch>` into the integration branch. If the
tip moved after the worker merged it, re-run that ticket's commands on the
merged branch. A conflict returns to the same worker once; a second goes to
`$resolving-merge-conflicts` on the Deep route. Then complete the ticket, remove
its worktree and recompute the frontier. Earlier tickets' commands re-run once, below, not
per merge.

## Final candidate, QA and review

After the last ticket merges, re-run every ticket's verification commands once
on the integrated candidate; a failure goes to a fix worker before any gate.
Commit task-owned implementation and later fixes before every range review.
First `$qa-gate` on the candidate (scenarios from the pinned spec's acceptance
criteria; library-only work is N/A), then `$review-gate` over `<baseline>..HEAD`
(not per ticket) with `writer` from the actual implementation/retry history,
`deep` when any ticket is `[deep]`, and the pinned spec as the fidelity
reference. Its rule table picks the other-family reviewer and tier, never you.
Both gates go in the run's ledger; record each pass as a `review.passes` entry
with its finding count.

**Fixes go to one fresh implementation worker, not the coordinator.** Hand it
the pass's confirmed findings by pointer, on Deep when any ticket was `[deep]`,
otherwise Default. Then re-run the affected tickets' commands and the QA scripts
yourself and repeat independent review, at most two fix/review cycles.
Unresolved confirmed findings at the bound stop the run with the findings and
evidence; never mark it done. Completion requires clean independent review and
passing coordinator verification on the final integrated candidate.

## PR body and retro candidates

In ship mode write the PR body with `$pr`: Summary from the spec and tickets,
Evidence from measured results (`gateList`, the QA run, `git diff --numstat`),
Merge Danger from the spec's externally visible changes.

The final report lists every ticket that needed a retry, stopped as `⛔`,
escalated, or drew confirmed review findings, with its checkable fact, as
candidates for `$retro`. List only; the user runs it.

## Change control

Routine implementation and ticket questions stay autonomous inside the confirmed
contract. A proposed change to a settled decision, acceptance criterion, scope,
external interface or data meaning is a design question: pause affected workers,
show the D-ids, evidence, recommendation and impact to the user, and return the
question to `$matt-design`. Do not edit the source spec or let a delegate approve
its replacement. Continue independent unaffected work only when its assumptions
remain valid. Resume affected work after the user confirms the revised spec and
requests continuation; record the newly adopted revision/hash and invalidate
stale ticket plans, verification and review as needed.

User report edits/comments are change requests, not approval. Apply routine
execution edits to affected tickets, the log/plan and active worker briefs; pause
affected dispatch while updating instructions, and invalidate checks/review when
their inputs change. Design edits follow the rule above. Preserve a
pending edit until resolved, then mark it consumed so it is not applied twice.
`--confirm` adds only the ticket/plan gate; it does not reopen settled design.

## Red flags — you are drifting off the flow

- Interviewing or authoring a new spec here; treating design confirmation alone as execution authorization.
- Dispatching on a draft or changed spec, guessing a design answer, or reversing a settled D-id without a user-confirmed revision.
- Skipping ticket verification or independent review for small work, claiming completion with open findings, or trusting worker reports without running checks yourself.
- Holding a ready ticket for a wave, fixing review findings yourself, or accepting a worker report without the integration tip merged.
- Stale report state, edits silently consumed, or counts not measured from git.
- A PR without a ship flag, before its measured conditions, or a merge, force-push or rebase of the PR branch.
