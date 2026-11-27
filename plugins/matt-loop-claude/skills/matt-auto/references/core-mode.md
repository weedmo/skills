# Core mode

`core` is matt-auto for one-ticket work. It drops coordination (delegate, ticket
publication, frontier dispatch, report page) and keeps quality: coordinator-run
verification, cross-family `$review-gate`, the verdict bound to `HEAD`, measured
reporting. **You implement and fix in this session**: the phases share one context,
so there is no implementation or fix worker. Design sources:
`docs/design/matt-auto-core.md`, `docs/design/purpose-loops.md`.

## Steps

| Full step | Core |
|---|---|
| 1 Precondition | Same; the mode is picked here, before tracker setup, and a missing `docs/agents/issue-tracker.md` does not trigger it |
| 2 Probe | Only the CLIs `$review-gate` and the lookup route can use |
| 3 Delegate | None |
| 4 Load design | No report page; pin spec path and hash in the log |
| 5–8 Size · Tickets · Plan | One ticket written to the log (acceptance, verify commands); no `$to-tickets`, no publication |
| 9 Implement | You, in this session: build to the ticket's acceptance against the pinned spec, test-first with `$tdd` when acceptance names tests; `$review-gate` is the only review; commit task-owned changes. Lookups whose path you do not need take the lookup route (`gate-route.mjs --role lookup --host <claude\|codex>`, this session's host) |
| 9 Verify | Same: you run the commands; a failure is yours to fix, at most twice more |
| 9b QA | `$qa-gate` only when a runnable surface exists and an acceptance item is behavioural; otherwise record `N/A` and why |
| 9b Review | `$review-gate` over `<baseline>..HEAD` with max cycles 1; you triage and fix its blocker/major findings in this session, then re-run verification; `/simplify` and `/security-review` only on user request |
| Report | Terminal board and one final summary from `git diff --numstat`; the log keeps every decision |
| 10 Ship | Same, ship flags only, never merge |

With unlazy installed the ledger still holds the verify commands, the review
verdict and, when it ran, the QA verdict. Implementation-level choices are yours:
decide, then log one line.

## Promotion and stops

| During core | Action |
|---|---|
| Two approaches to the same acceptance item failed, or the task needs the Deep route | Promote to full; the Deep retry follows full rules |
| Two or more independently verified deliverables appear | Promote to full; split the remaining work into tickets |
| Blocker/major findings remain after review cycle 1 | Promote to full for one more cycle; still unresolved → STOP handoff |
| A design choice, or a change to acceptance, scope, external interface or data meaning | Stop; show evidence and recommendation; return to `$matt-design` |
| Verify commands still fail after two retries | `⛔` handoff, as in full |

Promotion is automatic and logged as `core → full: <reason>` on the board. Done
work (commits, verification results) is kept. From promotion on, spawn the
delegate and publish the report page as full does.

## Who writes

The build session writes. Start it on the Default pair from model routing (Claude
Code: `/model opus`; Codex: the `matt-default` pair); design ran in its own session
(purpose-loops D4, D6). A worker is spawned only after promotion to full.
