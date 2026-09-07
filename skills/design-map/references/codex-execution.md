# Codex execution after design-map

Read this file when Codex receives a confirmed design-map spec for execution,
or when a Codex design-map session continues directly into implementation.

## Contract

The spec selects the primary implementation engine under `execution`:

```yaml
execution:
  implementer: grok       # astra | grok
  reviewer: sol           # fixed
  support: antigravity    # optional supporting work
```

Recommend `astra` for `[deep]` work: architecture, public seams, migrations,
algorithms, concurrency, or invariants. Recommend `grok` for a clear, bounded
feature whose steps are mostly `[default]`. The user may override the
recommendation at handoff. Sol is mandatory and independent in both cases.

Antigravity may handle independent discovery, documentation, fixture work,
test/log triage, or other mechanical preparation. Give it explicit files and a
verification target through an Orca `agy` terminal when that shortens the run.
Its output is input to the primary implementer or coordinator; it never owns a
core invariant, performs the final implementation, or replaces Sol review.

## Run

1. Record `baseline=$(git rev-parse HEAD)`, confirm the spec is `confirmed`,
   and make the execution prompt from its goal, constraints, decisions, every
   step's verify command, and definition of done. Show the prompt before work.
2. For `astra`, use the current session only when it is Astra; otherwise spawn
   `matt-deep` with `fork_turns: "none"` (role missing: direct
   `gpt-6-astra`/`high`). Give it the prompt and branch. For `grok`, write the
   prompt to a temporary file. First require `command -v grok` and confirm
   `grok models` lists `grok-4.6`; if either fails, report it and use the Astra
   route (stop instead when the user explicitly required Grok). Otherwise run:

   ```bash
   grok --cwd <repo> --model grok-4.6 --reasoning-effort high \
     --always-approve --deny 'Bash(git push*)' --deny 'Bash(git reset --hard*)' \
     --deny 'Bash(rm -rf*)' --output-format json --prompt-file <prompt-file>
   ```

   Save the returned `sessionId`. The prompt tells Grok to implement on the
   already-authorized branch, stay within the spec, run every verify command,
   avoid push/force/delete operations, and report open material decisions.
3. Run every verify command yourself. A failure returns to the same implementer
   with the exact output; allow two fix attempts. For Grok, resume the captured
   session with `--resume <sessionId> -p <fix-prompt>` and the same safety flags.
   When verification passes, stage only the explicit files belonging to the spec
   and commit the review candidate. Never stage pre-existing user changes.
4. Run `$code-review <baseline> <spec-path>` against that committed candidate.
   Its Codex route assigns both axes
   to independent `matt-reviewer` agents on `gpt-5.6-sol`/`high`. If that skill
   is unavailable, refuses because issue-tracker setup is absent, or the role is
   missing, spawn two Sol agents directly: one for repository standards and one
   for spec fidelity. Reviewers are read-only.
5. Send confirmed findings back to the same implementer, rerun affected verify
   commands, commit the explicit fix files, then repeat Sol review. Stop after
   two review/fix cycles and report
   unresolved findings instead of declaring completion. A clean Sol review and
   passing verification are both required.
6. Confirm every reviewed change is committed, then follow the user's requested
   ship mode. Never let the implementation agent approve its own work.
