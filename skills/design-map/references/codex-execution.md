# Codex execution after design-map

Read this when Codex receives a confirmed design-map spec for execution,
or a design session continues into implementation. Read `$model-routing`;
read its `references/gemini-priority.md` for eligible Gemini work and quota fallback.

## Contract

```yaml
execution:
  implementer: gemini    # bounded Default work; astra for Deep work
  support: antigravity   # eligible independent preparation
  fallback: codex       # on confirmed quota exhaustion
  reviewer: astra        # independent extra-high review
```

Route trivial edits to `matt-fast`, small changes to `matt-default`, moderate
time-sensitive work to `matt-standard`, bounded background work to `matt-batch`,
and architecture, public seams, migrations, algorithms, concurrency, or invariants to
`matt-deep`. Escalate only by model-routing's ladder.
These Codex tiers apply to Deep work and quota fallbacks. Prefer Gemini via
Antigravity for bounded Default implementation and independent discovery,
documentation, fixtures and test/log triage. Pin the strongest available model
and maximum supported thinking/budgets using the shared Gemini reference.

Legacy `implementer: routed` selects Gemini for eligible work, Codex otherwise;
`astra` selects Deep. Replace legacy Grok fallback with Codex continuation.
Legacy `reviewer: sol` becomes Astra xhigh. Preserve `support: antigravity`.

## Run

1. Record `baseline=$(git rev-parse HEAD)`, confirm the spec is `confirmed`,
   and make the execution prompt from its goal, constraints, decisions,
   every verify command, and definition of done. Show the prompt before work.
2. For Gemini, follow the shared priority reference: dispatch the explicitly
   pinned Antigravity worker with the prompt and authorized branch. On confirmed
   quota exhaustion, checkpoint and continue with Codex; never overlap writers.
   For Codex, spawn the selected implementation role with `fork_turns: "none"`,
   `ROUTED_EXECUTION=1`, the prompt, and the authorized branch.
   Reuse the current session only when its exact model and effort are known
   to match that role. Missing or stale roles require an explicit allowed
   pair; if it cannot be enforced, report the unavailable route and stop.
3. Run every verify command yourself. Return failures to the same implementer
   with exact output; allow two fix attempts. When verification passes,
   stage only files belonging to the spec and commit the review candidate.
   Never stage pre-existing user changes.
4. Run `$code-review <baseline> <spec-path>` against that candidate.
   Both axes use fresh read-only `matt-reviewer` agents (Astra xhigh).
   If the skill is unavailable or issue-tracker setup is absent, dispatch
   those reviewers directly, one for standards and one for spec fidelity.
   Missing roles follow model-routing's allowed-pair fallback.
5. Return confirmed findings to the implementer, rerun affected checks,
   commit the explicit fix files, and repeat independent review. Stop after
   two review/fix cycles with unresolved findings. Completion requires clean
   independent review and passing verification.
6. Confirm every reviewed change is committed, then follow the requested
   ship mode. The implementer never approves its own work.
