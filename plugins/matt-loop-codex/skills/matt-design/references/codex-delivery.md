# Codex design page

Read this file only when the design is visualized on Codex.

## Page and delivery

Applies to a requested visualization ([visualize.md](visualize.md) step 3 and
[artifact-page.md](artifact-page.md)). Write one self-contained HTML file at
`${TMPDIR:-/tmp}/matt-design-<repo>-<slug>.html`; reuse that exact path for the
whole design. Keep the design state as JSON inside the source and regenerate
the document from it. The page contains the same current/proposed SVGs,
decision list, and available review log as the Claude Artifact route. It is read-only;
Codex feedback returns through chat.

Use the installed `loop-report` delivery helper; do not open the page yourself:

```bash
python3 <loop-report-dir>/assets/deliver.py probe --page <page>
python3 <loop-report-dir>/assets/deliver.py publish --page <page>
python3 <loop-report-dir>/assets/deliver.py show --page <page>
```

Probe once before the first publish. Publish after every regeneration and relay
the returned route: opened plus path, or path and reason. The `.delivery.json` next
to the page preserves the route. If the helper is absent, report the HTML path.

Run the render check from artifact-page.md on the delivered page. For a path route,
serve the page over localhost and use the in-app browser; do not treat the
filesystem rendering alone as evidence. Keep delivery metadata outside confirmed specs; matt-design may record the
route while authoring a draft.

## Feedback and source of truth

Chat is the Codex feedback channel. When a page exists, apply each change to
the embedded state, regenerate the same file, publish, and recheck it, and read
that local state again before rendering the next version. Claude-only Artifact comments, in-page save, and
`claude.use("artifact")` do not apply.
