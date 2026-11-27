# Design page (Artifact / delivered HTML)

Read this file only when the user asked for a visual design page ("그림으로
보여줘", "artifact로", "페이지로 만들어줘"). The supplied design discussion/spec
stays the source of truth; the page is a rendering of it, republished
to the same route for the rest of the session — never fork a new one.

Never hand the user a page before the render check below has passed on the
version that is live. A diagram with clipped, overflowing, or overlapping text
is not a verified deliverable, even if the design behind it is right.
If rendering tools are unavailable, return only the local HTML source explicitly
labeled unverified; do not present it as a verified artifact.

## Page contents

On Claude Code load `artifact-diagramming`; on Codex load
[codex-delivery.md](codex-delivery.md). Build one page containing:
- **Current structure** — how it is wired today (only if something exists already).
- **Proposed structure** — the design. When a real fork in the road exists, show
  two alternatives side by side (design-it-twice) with a short tradeoff table and
  a recommendation; otherwise one proposal is fine.
- **Decision list** — the supplied decision table, one row per entry. Unresolved
  rows come first, marked 사용자 결정 필요, with the existing recommendation (if any) as a proposal, not the
  pick; the user's answer settles them.
- **Review log (when supplied)** (collapsed by default, `<details>`) — the supplied review log as a
  table: 질문 · 결정 · 이유 · 설계에 미친 변화.
Every diagram on the page is hand-drawn inline SVG under the drawing rules
below — from the first publish, not only after confirmation. Mermaid stays in
chat and in the spec's 확정 구조, never on the page.

## Drawing rules

Every diagram, every round — adapted from
cathrynlavery/diagram-design; its fonts, palette, brand onboarding and
separate light/dark variants are deliberately not adopted — our tokens and
theme switch stay):
- **Budget.** At most 9 nodes, 12 arrows and 2 accent-colored elements per
  diagram. Over budget → split into an overview and a detail diagram, never
  compress. Before drawing, try to remove each node, merge any two that
  always travel together, drop any arrow the layout already implies, and
  drop any label that color or shape already carries. If a table says the
  same thing, use the table.
- **Plan first.** One line in chat before drawing: the diagram type and what
  the budget forces out. Skip it only when the user already pinned both.
- **Right the first time.** There is no draft round. The Artifact exists so
  the user understands the design, and understanding starts at the first
  look — so the first publish is drawn to the same standard as the last:
  full geometry and a11y rules, real names, settled choices and open alternatives visibly distinguished. Each later round edits that SVG; nothing is deferred to a
  "polish" pass.
- **Inline SVG geometry.** Everything on a 4px grid: font sizes (12, 16, 20),
  coordinates, box sizes, gaps, padding. Paint arrows before boxes. A
  connector between nodes that share no axis is orthogonal with rounded
  right-angle bends (`r=8`); a straight line only when the endpoints share
  an x or y. An arrow label sits on an opaque rect filled with the page
  background token, 6–10px off the stroke, over open canvas — never over a
  box painted after it. No two connectors share a path or a segment;
  connectors leaving the same edge of a box get their own attach points
  ≥12px apart; a connector never passes behind a box that is not its
  endpoint — reroute, and when geometry makes that impossible draw it dashed
  with the label at the visible end.
- **Accessible SVG.** Each `<svg>` carries `role="img"` and `aria-labelledby`
  naming a `<title id="<slug>-title">` (first child; the diagram's name, in
  Korean) and a `<desc id="<slug>-desc">` (one Korean sentence on what it
  shows, not its geometry). IDs are prefixed per diagram, never bare
  `title` / `desc`.

Theme check (MANDATORY before every publish): the page must be legible in both
light and dark viewer themes. Define the complete palette as CSS tokens on bare
`:root` (light values), redefine only the tokens under
`@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])`,
and again under `:root[data-theme="dark"]`; give `body` an explicit token
background. Never let any color's only definition live inside one theme block,
and never hardcode text/stroke colors in diagrams (SVG included) that assume one
background — that is the dark-background-with-black-text bug. Scan the stylesheet
for this before publishing.

On Claude Code, make the page itself editable (load `artifact-capabilities` first —
it is the authority; declare only what its roster serves):
- Declare `capabilities: {artifact: {}}` on the first publish.
- Decision-list cells and description blocks are editable in place: keep the
  design state as data embedded in the page, render from it, and on an explicit
  save action (a visible "저장" button, not on every keystroke) regenerate the
  full document from that state and call `artifact.publish(html)`. Never
  serialize the live DOM. `await claude.use("artifact")` can resolve `null` —
  then hide the editing affordances and the page stays a plain view.

Korean text is wide — size everything for it before drawing. Budget one
font-size per Hangul glyph (Latin needs about half). Put each box and its
label in one `<g>`, and make the rect at least `chars × font-size + 24px`
wide, rounded up to the 4px grid; a label that does not fit gets split across
lines or shortened, never squeezed. In the spec's mermaid: always quote
labels (`A["라벨"]`), keep them to roughly 12 Hangul characters, break longer
ones with `<br/>` — mermaid estimates CJK width badly.

Publish, then run the render check below. Only when it passes, hand the user
the route. On Claude Code explain chat, comments, and in-page 저장; on Codex
ask for feedback in chat and republish the same delivered HTML.

Render check (MANDATORY after every publish that touches a diagram or layout):
the host lays the page out with its own fonts, so what the
local file looks like proves nothing — check the live page.
1. Open the published route in a browser. On Claude Code use a browser carrying
   the user's claude.ai login (new tab, never one the user is working in).
   On Codex use the in-app browser or the tab returned by `deliver.py`.
   Fallback when the delivered route is unreachable: serve a scratch copy of
   the file with `python3 -m http.server <port>` and open it over
   `http://localhost` with the playwright or chrome-devtools tools (`file://`
   is blocked there). Say in the handoff that the check ran on a local render.
2. Run this in the page and read the result; anything but `OK` is a defect:
   ```js
   (() => {
     const out = [];
     const sel = ':scope > rect, :scope > path, :scope > polygon, :scope > circle, :scope > ellipse';
     const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
     const hit = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
     if (document.body.innerText.includes('\uFFFD')) out.push('garbled: U+FFFD in page text');
     document.querySelectorAll('body *').forEach(el => {
       if (getComputedStyle(el).overflow !== 'visible' && el.scrollWidth > el.clientWidth + 1)
         out.push('clipped: "' + (el.textContent || '').trim().slice(0, 30) + '"');
     });
     document.querySelectorAll('svg').forEach((svg, i) => {
       const shapeOf = g => [...g.querySelectorAll(sel)].map(s => s.getBoundingClientRect()).find(r => r.width > 2 && r.height > 2);
       const gs = [...svg.querySelectorAll('g')].filter(shapeOf);
       const leaves = gs.filter(g => !gs.some(o => o !== g && g.contains(o)));
       const boxes = [];
       leaves.forEach(g => {
         const s = shapeOf(g);
         const texts = [...g.querySelectorAll('text, foreignObject')];
         if (!texts.length) return;
         const label = texts[0].textContent.trim().slice(0, 20);
         boxes.push({ s, label });
         texts.forEach(t => {
           if (!inside((t.querySelector('span') || t).getBoundingClientRect(), s)) out.push(`overflow svg#${i}: "${label}"`);
         });
       });
       for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
         const A = boxes[a].s, B = boxes[b].s;
         if (hit(A, B) && !inside(A, B) && !inside(B, A)) out.push(`overlap svg#${i}: "${boxes[a].label}" x "${boxes[b].label}"`);
       }
       if (!svg.hasAttribute('aria-roledescription') && !svg.closest('.mermaid')) {
         const k = svg.getBoundingClientRect().width / (svg.viewBox.baseVal.width || svg.getBoundingClientRect().width || 1);
         const rs = [...svg.querySelectorAll('rect')].map(r => r.getBoundingClientRect());
         rs.forEach((m, a) => {
           if (m.width < 20 * k || m.height < 8 * k || m.height > 20 * k) return;
           if (rs.slice(a + 1).some(n => n.width >= 60 * k && n.height >= 40 * k && hit(m, n) && !inside(m, n)))
             out.push(`clipped-label svg#${i}: mask at ${Math.round(m.left)},${Math.round(m.top)} under a later box`);
         });
       }
     });
     return out.length ? out.join('\n') : 'OK';
   })()
   ```
   It flags clipped HTML text, replacement characters, a label whose glyphs
   leave its box, two labeled boxes that partially overlap (a box fully
   inside another — a mermaid subgraph around its nodes — is nesting, not a
   defect), and in hand-drawn SVG an arrow-label mask that a box painted
   later covers. Hand-drawn SVG is only checked where box and label share a
   `<g>`.
3. Take a full-page screenshot and look at it yourself — the script cannot see
   edge labels crossing nodes, arrows through text, or a diagram wider than the
   page. Then set `document.documentElement.dataset.theme = 'dark'` (and
   `'light'` if the browser is already dark), re-run the script, and screenshot
   again — the fonts do not change between themes, but contrast bugs do.
4. Any finding → fix the source file (shorten or wrap the label, widen the box,
   reroute the connector or split the diagram), republish to the same
   path, and run the check again. Repeat until it comes back `OK` in both
   themes. Report in one line what the check covered and which browser it ran in.

## Feedback through the page (Claude Code)

Besides chat, two more channels open once a page exists; treat both as design
input:
- **Artifact comments** — the user selects part of the page and comments.
  Threads sent to Claude wake this session (the publish arms auto-replies);
  plain comments don't, so also check `Artifact(action: "comments")` when the
  user says they left notes. Apply the feedback to the diagram, reply briefly
  with what changed, and resolve the threads you handled.
- **In-page edits** — the user's 저장 publishes a new version. A republish
  notification means the local file is behind: re-read the live version
  (`action: "read"`), merge its state into your file, and build every later
  update on top of it. A publish conflict is the same signal — merge onto the
  handed-back version, never force.

Each round that changes the design: republish the same route, run the render
check again, and keep the chat summary in step with the page. Before a later render, re-read the live version — a
page the user edited may be ahead of this conversation. Treat decision edits as
proposals until the user settles them through the design conversation; never
change a confirmed spec from page feedback alone.
