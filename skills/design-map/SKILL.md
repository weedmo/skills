---
name: design-map
description: Visual-first design flow for Claude Code and Codex. Explore the codebase, grill the design against an independent delegate, present a diagram page with its decisions and grill log, iterate to explicit confirmation, then write and review a local implementation spec. A confirmed Codex spec can continue through Astra or Gemini implementation (Grok only when Gemini credentials are absent or token quota is exhausted) followed by independent Sol review. No GitHub issues are filed. Trigger on /design-map, "구조 설계하자", "다이어그램으로 설계", or visual structure design before implementation.
---

# design-map

Design through diagrams, not walls of text. The deliverable of every round is an
updated design page the user can look at; prose in chat stays to a few sentences.

Claude Code uses its Artifact route. Codex reads
[references/codex-delivery.md](references/codex-delivery.md) for its delegate,
HTML delivery, and feedback differences. When Codex receives an already
confirmed spec for implementation, skip design steps and follow
[references/codex-execution.md](references/codex-execution.md).

Hard rules:
- Never file GitHub issues or use any external tracker. The spec is a local file.
- The user's explicit confirmation ("확정", "이해됐어", "이걸로 가자") is the only
  thing that moves the flow from design to spec. Do not self-declare the design done.
- One page route for the whole session — republish the same file, never fork a new one.
- All deliverables are written in Korean: the design page (headings, labels,
  descriptions, decision tables) and the spec document. Identifiers that refer to
  real code — module/function/file names, diagram node names, commands — stay in
  English as they appear in the codebase.
- Never hand the user a page before the render check (step 4) has passed on the
  version that is live. A diagram with clipped, overflowing, or overlapping text is
  not a deliverable, even if the design behind it is right.

## Flow

### 1. Scope
Pin down what is being designed: which module/feature/system, and what problem the
new structure must solve. If ambiguous, ask once with AskUserQuestion (max one round),
then proceed.

### 2. Survey
Understand the current shape before proposing a new one. **graphify first** — it is
the standard way to read an existing codebase here; token-heavy file sweeps are the
last resort.
1. `graphify-out/graph.json` exists → use it: `graphify query "..." --budget N` for
   orientation, `--dfs` to trace paths. Refresh a stale graph with `graphify --update`.
2. No graph yet → build it: `graphify <repo> --directed --wiki`. If the CLI is
   missing, `pip install graphifyy` first.
3. graphify unavailable or the build fails → fall back: small scope, read the
   relevant files yourself; larger scope, send an Explore agent and keep the
   conclusions, not the file dumps.
The graph is for orientation (where is X, how is it connected). Verify precise
details (exact signatures, all callers) against the real source before drawing them.
Collect real names (modules, functions, tables) — diagrams built from real names,
never placeholders.

### 3. Self-grill
The first page the user sees must already be a design that has been argued
with, not a first guess. Before drawing, interview the design the way
matt-auto's interview does — but the answerer is a **decision delegate**, not
the user. This step is self-contained (the `grilling` skill is not installed
everywhere; do not invoke it):
- **Spawn the delegate** once. On Claude Code use `Agent` with
  `subagent_type: "fork"` and keep it alive with `SendMessage`; on Codex use
  the delegate route in `references/codex-delivery.md`. Its brief: answer with senior-engineer judgment,
  prefer the recommended answer unless it sees a concrete flaw, reply with the
  decision plus a one-line rationale, and never decide — replying
  `ESCALATE: <why>` — on security, data meaning or migration, destructive
  operations, externally visible interface changes, or anything that
  contradicts the scope the user gave.
- **Work a design tree in rounds.** Every decision branches into the decisions
  that hang off it. The frontier is every question whose prerequisites are
  settled; send the whole frontier in one round, each question numbered with
  the options and your recommended answer. A question that depends on one still
  open in this round belongs to the next round. Settled answers push the
  frontier outward; recompute and send the next round.
- **Facts are found, never asked.** A question that needs something from the
  codebase (does X call Y, what does this table hold, where is the boundary) is
  answered from step 2's graph or the source, not put to the delegate. Only
  decisions go to the delegate.
- **Stop** when the frontier is empty or after the third round, whichever
  comes first. Questions still open at the cap stay open on the page.
- **Keep the log**: question → options → decision → rationale → what it changed
  in the design. This log is the source of step 4's decision list; its
  `ESCALATE` entries are the questions the user must answer.
One line in chat when it ends: how many questions, how many settled, how many
escalated. The design that gets drawn is the one the log left standing — a
tree that changed nothing means the questions were not hard enough.

### 4. Diagram the design
On Claude Code load `artifact-diagramming`; on Codex load the delivery reference
above. Build one design page containing:
- **Current structure** — how it is wired today (only if something exists already).
- **Proposed structure** — the design. When a real fork in the road exists, show
  two alternatives side by side (design-it-twice) with a short tradeoff table and
  a recommendation; otherwise one proposal is fine.
- **Decision list** — one row per step-3 log entry: question / options / pick /
  why. `ESCALATE` rows come first, marked 사용자 결정 필요, with the
  recommended answer as the pick; the user's answer settles them.
- **Self-grill log** (collapsed by default, `<details>`) — the step-3 log as a
  table: 질문 · 결정 · 이유 · 설계에 미친 변화. It is data in the page state
  like the decision list, so the user can open it and see what was tried,
  without prose in chat.
Every diagram on the page is hand-drawn inline SVG under the drawing rules
below — from the first round, not only after confirmation. Mermaid appears
only in the spec's 확정 구조 (the source the implementing loops read), never
on the Artifact.

Drawing rules (every diagram, every round — adapted from
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
  full geometry and a11y rules, real names, the recommendation already
  picked. Each later round edits that SVG; nothing is deferred to a
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

### 5. Understanding loop
Feedback arrives three ways; treat all of them as design input:
- **Chat** — as before.
- **Artifact comments (Claude Code)** — the user selects part of the page and comments.
  Threads sent to Claude wake this session (the publish arms auto-replies);
  plain comments don't, so also check `Artifact(action: "comments")` when the
  user says they left notes. Apply the feedback to the diagram, reply briefly
  with what changed, and resolve the threads you handled.
- **In-page edits (Claude Code)** — the user's 저장 publishes a new version. A republish
  notification means the local file is behind: re-read the live version
  (`action: "read"`), merge its state into your file, and build every later
  update on top of it. A publish conflict is the same signal — merge onto the
  handed-back version, never force.
A user answer to a 사용자 결정 필요 row settles it: drop the mark, record
the answer as the pick. A change that reopens a settled decision goes back
through the delegate for the decisions that hung off it before the diagram
changes.
Each round: apply feedback to the same page route,
run the render check from step 4 on the republished page, answer questions by
pointing at the diagram, keep decision-list rows updated.
Repeat until the user confirms the design is understood and settled. If they go
quiet mid-loop, the design is NOT confirmed — wait or ask, don't advance.

### 6. Spec
Before writing, re-read the live Artifact on Claude Code or the embedded page
state on Codex; that version is the source of truth. Then write the spec as a local markdown file (Korean prose,
English code identifiers), default
`docs/design/<topic>.md` in the repo (create the directory if needed; if the repo
has an existing spec/docs convention, follow it instead). The file is the bridge
to the implementing loop — `matt-auto --spec` and `autocode init --spec` read the
frontmatter keys and these headings by name, in another CLI with no access to
this conversation — so keep the shape exactly:

```markdown
---
design-map: 1
slug: <topic>
kind: feature            # feature | optimize
loop: matt-auto          # matt-auto | autocode | direct | implement — recommended by the rule below
followup: autocode       # optional: a second loop to run after `loop` finishes
status: confirmed        # draft while iterating; confirmed only after the user's confirmation
artifact: <this session's artifact URL>
branch: <filled at handoff>
execution:                # direct/implement on Codex; omit for matt-auto/autocode
  implementer: gemini     # astra | gemini; grok only as token fallback
  reviewer: sol           # fixed: independent implementation review
  support: antigravity    # optional discovery/docs/mechanical supporting work
handoff:                 # filled at handoff — one line per receiving platform
  codex: "use $design-map to execute the confirmed spec docs/design/<topic>.md"
  opencode: "/matt-auto --spec docs/design/<topic>.md"
  claude: "/matt-loop:matt-auto --spec docs/design/<topic>.md"
metric:                  # required when loop or followup is autocode; allowed otherwise
  name: <metric name>
  command: <prints one number on its last line>
  direction: lower       # lower | higher
  target: null
  target_files: [<paths>]
  guard: <test command>
  forbidden: [<paths>]
---
# <title>
## 큰 틀        — 5–10 sentences a delegate can act on without this conversation
## 목표 / ## 비목표
## 확정 구조   — mermaid source transcribed from the confirmed SVG (same nodes, same arrows)
## 결정        — table: id · 질문 · 선택 · 이유 (from the decision list)
## 구현 순서   — numbered steps, each tagged `[deep]` or `[default]`, each with a verify check
```

`kind` is `optimize` when the design exists to move a measured number, `feature`
otherwise. Do NOT publish the spec anywhere — no issues, no PRs.

**Tag every step** of 구현 순서 with `[deep]` — core logic, invariants,
concurrency, an interface other steps depend on — or `[default]` — tests,
fixtures, docs, mechanical edits, copies of an existing pattern. `matt-auto
--spec` reads the tag as the ticket's tier (model-routing's Deep / Default,
on Codex astra / terra), so the tags are what put each part of the work on the
model it needs; their count is also the evidence for the `loop` recommendation.

**Recommend `loop`** from the spec — scaffolding shrinks as the model gets
stronger, so the question is whether matt-auto's fixed cost (interview, board,
ledger) buys more than it costs here:

| Signal | `loop` |
|---|---|
| 1–2 steps, one file | `implement` — on Codex use the same Astra/Gemini → Sol execution protocol, with Grok only when Gemini credentials are absent or token quota is exhausted; elsewhere use the platform's one-file implementation skill |
| 3–6 steps, few tests | `direct` — any `[deep]` step → Astra, otherwise Gemini via Antigravity; Grok only when Gemini credentials are absent or token quota is exhausted; Sol reviews every route |
| 7+ steps, or steps that can run in parallel, mostly `[default]` | `matt-auto` — many tickets on the cheap tier, each verified by the coordinator; the coordinator and delegate stay Deep |
| `kind: optimize` | `autocode`; structure first and then a number → `loop: matt-auto` with `followup: autocode` and the metric block filled |

For a Codex `direct` or `implement` spec, fill `execution` using the rule above and read
`references/codex-execution.md`; `reviewer` stays `sol`. The thresholds are starting points — move them after a few runs. A spec that
mixes `[deep]` and `[default]` steps is `matt-auto` with the tags doing the
model split, never direct plus matt-auto. Write the recommendation's reason in
one line under the frontmatter (`추천: matt-auto — 9단계, deep 2 · default 7`)
and repeat it in the step-8 question.

### 7. Review gate
On Claude Code, run `code-review` with the spec path as before. On Codex, spawn `matt-reviewer` with
`fork_turns: "none"` to read the spec file directly and adversarially check
contradictions, missing edge cases, unverifiable steps, and drift from the
confirmed page; role missing → direct `gpt-5.6-sol`/`high`, reported once. This
is a file review, not `$code-review`'s Git-diff interface. Apply valid findings
to the spec and design page.

Any spec change from here on edits the mermaid and the page's SVG
together, then republishes and runs the step-4 render check.

### 8. Handoff
The spec crosses to the implementing CLI as a committed file — nothing else
does; a receiving Codex or OpenCode session never sees this conversation. On
Claude Code with the matt-loop Claude edition installed, this session itself
continues into the loop (the delegate fork inherits the design conversation).
In order:

1. **Facts.** `git branch --show-current`, `git remote -v`, `git status --porcelain`.
   Note which loop skills this session can see — the Claude edition
   (`/matt-loop:matt-auto`, `/auto-loop:autocode`) is deliberately absent on some
   machines, so continuing here is an option only where it is installed
   (`direct` needs no loop skill and can always continue here).
2. **One question** (AskUserQuestion, one round): the loop (recommend the
   frontmatter's `loop` with its one-line reason); where it runs — 이 세션에서 계속
   / `/fork` 배경 세션 / Codex / OpenCode / 명령만 받기; for Codex `direct`
   or `implement`,
   the primary implementer (recommend Astra when any step is `[deep]`, otherwise
   Gemini via Antigravity; Grok only when Gemini credentials are absent or token
   quota is exhausted, per the execution reference; Sol review is fixed);
   the base branch (recommend current when `main` or `dev`, else `main`); and the
   branch name (recommend `feat/<slug>`, or stay on the base).
3. **Commit the spec alone.** If `git status --porcelain` shows tracked changes
   other than the spec, do not switch branches — ask once (commit on the current
   branch / stop). Otherwise `git checkout -b <name> <base>` (skip when staying),
   fill `branch` and the three `handoff` lines in the frontmatter, then
   `git add <spec> && git commit -o <spec> -m "docs(design): add <slug> spec"` —
   `-o` commits that one path whatever else is staged. Leave the checkout on that
   branch: the terminal below opens in this checkout.
4. **Hand over.** Codex / OpenCode: pick the Orca binary by loop-report's rule —
   inside an Orca terminal (`ORCA_*` env) or off Linux try `orca` then `orca-ide`;
   otherwise only `orca-ide` (bare `orca` on Linux is the GNOME screen reader,
   never run it). `<bin> status --json` failing → no Orca → print the line. Else
   `<bin> terminal create --worktree path:<repo> --command <codex|opencode> --json`;
   on `selector_not_found` run `<bin> repo add --path <repo> --json` and retry
   once; any other failure → print the line. Poll
   `<bin> terminal read --terminal <handle> --screen --json` until the CLI's
   input prompt is on screen (Codex: `› Ask Codex`; up to 60 s, else print the
   line), then `<bin> terminal send --terminal <handle> --text "<handoff line>" --enter --json`,
   poll again until `Working (` appears, and stop there. 이 세션에서 계속: invoke
   the Claude edition right here — `matt-loop:matt-auto` with `--spec <path>`
   (or `auto-loop:autocode init --spec <path>`); it has no
   `disable-model-invocation`, its delegate is a fork of this conversation, and
   its interview is skipped — the spec was it. `/fork` 배경 세션: a session
   cannot fork itself — print `/fork /matt-loop:matt-auto --spec <path>` for the
   user to type, then stop. 명령만 받기: print the line. The loop lines: Codex
   `use $matt-auto --spec <path>`, OpenCode `/matt-auto --spec <path>`, Claude
   Code `/matt-loop:matt-auto --spec <path>` (autocode: `… init --spec <path>`;
   implement: `use $implement on <path>` outside Codex). Codex `direct` and
   `implement` both use:
   ```
   use $design-map to execute the confirmed spec <path>; follow its Codex
   execution protocol (implementer from frontmatter, independent Sol review)
   ```
   A Codex session receiving that line reads `references/codex-execution.md` and
   owns the Astra/Gemini → Sol loop (Grok only as token fallback) through completion. In a Codex design session,
   이 세션에서 계속 runs that protocol here. On other platforms, retain the
   self-contained meta prompt with the spec's goal, checks, and definition of done.
5. **Report and stop** (Codex / OpenCode / 명령만 받기 / `/fork`): spec path,
   design-page route, `base → branch`, where it went (terminal handle or
   "붙여넣기") and the handoff line. Do not watch the run — from here its own
   loop-report page is the window. 이 세션에서 계속: report the same facts in one
   line and go on as the loop.
