# Execution core

Both editions run matt-auto the same way: **this session implements, verifies,
fixes and reports**. There are no implementation or fix workers, no decision
delegate and no progress page. Subagents run only for the QA author and the
reviewer (the other model family: Codex when this session is Claude, Claude
when it is Codex), lookups whose path the session does not need, and the Codex
As-Is / To-Be page. Design sources: `docs/design/matt-auto-core.md`,
`docs/design/purpose-loops.md`.

## Tickets in the log

Write the tickets into `docs/agents/matt-auto-log/<slug>.md`, nowhere else: one
ticket per implementation step of the spec, or one ticket for a brief, in the
spec's order. Each ticket has its acceptance criteria as written, concrete
verification commands with the expected result, and any manual criterion with
the evidence it needs. No tracker and no publication.
Implementation-level choices are yours: decide, then log one line.

## Implement and verify, one ticket at a time

For each ticket in order: build it to its acceptance against the pinned spec,
test-first with `$tdd` when the acceptance names tests; commit task-owned
changes; then run its verification commands yourself. A failure is yours to
fix, at most twice more; then the run stops as `⛔` with the failing command
and its output. A ticket is done when every command passed on your run and each
manual criterion has explicit evidence. After the last ticket, re-run every
ticket's commands once on HEAD.

## QA and review, in parallel on the other family

On that verified, committed HEAD start both gates at once, as two background
runs launched together, each writing its own files:

- `$qa-gate` — its QA author is the route `gate-route.mjs --role qa-author`
  returns (Codex for a Claude session); you run the scenarios yourself. Library-only work is `N/A` with the
  reason, and review runs alone.
- `$review-gate` over `<baseline>..HEAD` with `--cycles 2`, `writer` this
  session's family, `deep` when any spec step is tagged `[deep]`, the pinned spec
  as fidelity reference. Its rule table picks the reviewer (Codex for a Claude session) and tier, never you.

Wait for both, then triage once: QA failures plus the review's blocker/major
findings. Fix them in this session, commit, re-run the verification commands,
then start the next cycle with both gates in parallel again: the QA scenarios
re-run, and the next review round's prompt also carries `.qa/<unit>/scenarios/`
so weak assertions get reviewed. At most two cycles. Findings still open at the
bound stop the run with the findings and evidence; never mark it done. Done
means verification passed on HEAD, `qa-gate: PASS` (or `N/A`), and
`review-gate: PASS` bound to that HEAD. With unlazy installed both gates go in
the run's ledger.

## PR body and retro candidates

In ship mode first run `$pr-visual` (the As-Is / To-Be change-point page shown
before the PR, its text section added to the body), then write the PR body with
`$pr`: Summary from the spec and tickets, Evidence from measured results (each
command, the QA run, the review verdict, `git diff --numstat`), Merge Danger
from the spec's externally visible changes.

The final report lists every ticket that needed a retry or stopped as `⛔`, and
every confirmed review finding, with its checkable fact, as candidates for
`$retro`. List only; the user runs it.

## Stops

| During the run | Action |
|---|---|
| Verification still fails after two retries | `⛔` handoff with the failing command |
| Findings open after review cycle 2 | STOP handoff with the findings and evidence |
| A design choice, or a change to acceptance, scope, external interface or data meaning | Stop; show the D-ids, evidence, recommendation and impact; return to `$matt-design` |

## Change control

Routine implementation questions stay autonomous inside the confirmed contract.
A proposed change to a settled decision, acceptance criterion, scope, external
interface or data meaning is a design question: stop the affected ticket, show
the D-ids, evidence, recommendation and impact to the user, and return the
question to `$matt-design`. Do not edit the source spec. Resume after the user
confirms the revised spec and requests continuation; record the newly adopted
revision/hash and invalidate stale verification and review.
`--confirm` adds only the ticket-plan gate; it does not reopen settled design.

## Red flags — you are drifting off the flow

- Interviewing or authoring a new spec here; treating design confirmation alone as execution authorization.
- Running on a draft or changed spec, guessing a design answer, or reversing a settled D-id without a user-confirmed revision.
- Spawning an implementation or fix worker, or running QA and review one after the other instead of together.
- Skipping verification or review for small work, or claiming completion with open findings.
- Counts not measured from git.
- A PR without a ship flag, before its measured conditions, or a merge, force-push or rebase of the PR branch.
