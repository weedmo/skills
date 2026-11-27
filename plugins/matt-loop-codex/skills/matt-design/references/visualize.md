# Visualize the design

Read this file when the user asks to see the current design as a page, diagram,
or map ("그림으로 보여줘", "artifact로"). It renders the design this session
holds; it does not make decisions, confirm a spec, or start execution.

1. **Collect the current design.** Use the current goals, actual module names,
   structure, alternatives, the decision table and open questions. Read
   relevant files only to resolve factual gaps. A draft with open questions is
   a valid input; do not invent missing decisions to fill the page.
2. **Map the evidence.** Distinguish existing structure, proposed changes,
   user-settled decisions, and open choices. Mark unknowns explicitly and keep
   the D-ids.
3. **Render.** Follow [artifact-page.md](artifact-page.md) for the page,
   diagram geometry, theme checks and feedback. On Codex also read
   [codex-delivery.md](codex-delivery.md). The request is already a request
   for the page; do not ask again. Korean prose and labels, real code
   identifiers. Keep diagrams small; split overview and detail instead of
   compressing a large structure.
4. **Deliver and iterate.** Verify the rendered page, then give its artifact
   link, delivered route, or local HTML path and reason. Reuse the same route
   for updates. Visual corrections update the page. Design feedback on the page
   is a change request for the workflow's step 4: preserve it, settle it with
   the user, then render the updated design.

The page visualizes the design; it never replaces the spec or authorizes work.
If tools cannot publish, return the HTML file and explain the limitation. If
render verification cannot run, report that explicitly.
