# Codex design page

Read this file only when `design-map` runs on Codex.

## Delegate

Run the self-grill on one persistent Astra delegate. Prefer the installed
`matt-deep` role; otherwise use `spawn_agent` with `gpt-6-astra`, `high`, and
`fork_turns: "none"`, supplying the scope, survey, settled decisions, and every
frontier round. Keep the same agent with `send_message` while it runs and
`followup_task` after it finishes. The delegate never edits files.

## Page and delivery

Write one self-contained HTML file at
`${TMPDIR:-/tmp}/design-map-<repo>-<slug>.html`; reuse that exact path for the
whole design. Keep the design state as JSON inside the source and regenerate
the document from it. The page contains the same current/proposed SVGs,
decision list, and collapsed self-grill log as the Claude route. It is read-only;
Codex feedback returns through chat.

Use the installed `loop-report` delivery helper without calling Orca directly:

```bash
python3 <loop-report-dir>/assets/deliver.py probe --page <page>
python3 <loop-report-dir>/assets/deliver.py publish --page <page>
python3 <loop-report-dir>/assets/deliver.py show --page <page>
```

Probe once before the first publish. Publish after every regeneration and relay
the returned link, tab plus path, or path and reason. The `.delivery.json` next
to the page preserves the route. If the helper is absent, report the HTML path.

Run the main skill's render check on the delivered page. For a path route,
serve the page over localhost and use the in-app browser; do not treat the
filesystem rendering alone as evidence. Preserve the final delivery value in
the spec's `artifact` field even when it is a local path.

## Feedback and source of truth

Chat is the Codex feedback channel. Apply each change to the embedded state,
regenerate the same file, publish, and recheck it. Before writing the spec,
read that local state again. Claude-only Artifact comments, in-page save, and
`claude.use("artifact")` do not apply.
