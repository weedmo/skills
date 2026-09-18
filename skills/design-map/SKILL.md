---
name: design-map
description: Terminal-first design flow for Claude Code and Codex. Talk the scope through with the user, explore the codebase, grill the design against an independent delegate, present the structure in chat as an ASCII tree plus mermaid source with its decision table, iterate to explicit confirmation, then write and review a local implementation spec. A visual page (Artifact on Claude, delivered HTML on Codex) is built only when the user asks for one. A confirmed Codex spec uses Gemini-priority implementation with cost/time-aware Codex fallback and independent Astra extra-high review. No GitHub issues are filed. Trigger on /design-map, "구조 설계하자", "설계하자", or structure design before implementation.
---

# design-map

Design in the terminal. Every round ends with the structure shown in chat — an
ASCII tree, the mermaid source, and the decision table — and a few sentences of
prose. A visual page is not part of the flow; it is built only when the user
asks for one (see [references/artifact-page.md](references/artifact-page.md)).

Codex reads [references/codex-delivery.md](references/codex-delivery.md) for its
delegate; the delivery part of that file applies only when a page was
requested. When Codex receives an already confirmed spec for implementation,
skip design steps and follow
[references/codex-execution.md](references/codex-execution.md).

Hard rules:
- Never file GitHub issues or use any external tracker. The spec is a local file.
- The user's explicit confirmation ("확정", "이해됐어", "이걸로 가자") is the only
  thing that moves the flow from design to spec. Do not self-declare the design done.
- No page unless asked. Do not publish an Artifact, deliver HTML, or offer one
  more than once per session. Structure goes to chat as text; the spec file is
  the record.
- All deliverables are written in Korean: the chat view (tree labels, decision
  table) and the spec document. Identifiers that refer to real code —
  module/function/file names, diagram node names, commands — stay in English as
  they appear in the codebase.

## Flow

### 1. Scope
Pin down what is being designed — which module/feature/system, and what problem
the new structure must solve — by talking with the user until it is settled.
There is no question cap here: ask what is unclear, reflect back the scope in
a few lines, and move on only when the user agrees with it. Do not survey,
grill, or draw before that.

### 2. Survey
Understand the current shape before proposing a new one. **graft first** — it is
the standard way to read an existing codebase here; token-heavy file sweeps are the
last resort.
1. `graft/` index exists → use the MCP tools: `graft_repo_map` for orientation,
   `graft_find_code` for "where is X", `graft_trace_calls` to follow callers and
   callees. The server refreshes the graph before each query, so it is never stale.
2. No index yet → build it: `graft build <repo>` (local, no LLM key). If the CLI is
   missing, `npm i -g @nanonets/graft` first.
3. graft unavailable or the build fails → fall back: small scope, read the
   relevant files yourself; larger scope, send an Explore agent and keep the
   conclusions, not the file dumps.
The graph is for orientation (where is X, how is it connected). Verify precise
details (exact signatures, all callers) against the real source before drawing them.
Collect real names (modules, functions, tables) — diagrams built from real names,
never placeholders.

### 3. Self-grill
The first structure the user sees must already be a design that has been argued
with, not a first guess. Before presenting, interview the design the way
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
  comes first. Questions still open at the cap stay open in the decision table.
- **Keep the log**: question → options → decision → rationale → what it changed
  in the design. This log is the source of step 4's decision table and the
  spec's 검토 로그; its `ESCALATE` entries are the questions the user must
  answer.
One line in chat when it ends: how many questions, how many settled, how many
escalated. Then put the `ESCALATE` questions to the user in chat (AskUserQuestion
when they are a clean choice, prose otherwise) before presenting the structure —
their answers shape what gets drawn. The design that gets presented is the one
the log left standing — a tree that changed nothing means the questions were
not hard enough.

### 4. Present the structure (terminal)
Show the design in chat, in this order, and keep it short enough to read in
one screen per block:
- **Current structure** (only if something exists already) — an ASCII tree in a
  fenced code block: modules/files as the tree, one short Korean note per node
  where the role is not obvious from the name, real names from step 2.
- **Proposed structure** — the same tree form with the change visible (new
  nodes marked `+`, removed `-`, moved `~`), followed by the **mermaid source**
  of the flow in a fenced ```mermaid block. This mermaid is the one the spec's
  확정 구조 will carry, so write it to that standard now: quote every label
  (`A["라벨"]`), keep labels to roughly 12 Hangul characters, break longer ones
  with `<br/>`. When a real fork in the road exists, show two alternatives
  (design-it-twice) with a short tradeoff table and a recommendation; otherwise
  one proposal is fine. At most 9 nodes and 12 arrows per diagram — over budget,
  split into an overview and a detail diagram, never compress.
- **Decision table** — one markdown row per step-3 log entry: 질문 · 선택 ·
  이유. Rows the user settled in step 3 carry their answer; anything still
  open is marked 사용자 결정 필요 with the recommended pick.
- **Where the code lives** — `file:line` pointers for the nodes that change,
  so the user can jump there from the terminal.
Explain in a few sentences what the structure does and why the delegate's log
landed here; the tree and the table carry the detail, not the prose.

A page is not built here. If the user asks for one ("그림으로 보여줘",
"artifact로"), or if the structure needs more than two diagrams to explain and
you judge that text will not carry it, follow
[references/artifact-page.md](references/artifact-page.md) — offer at most
once, and only build after the user says yes.

### 5. Understanding loop
Feedback arrives in chat (when a page exists, its comments and in-page edits
count too — see the reference). A user answer to a 사용자 결정 필요 row settles
it: drop the mark, record the answer as the pick. A change that reopens a
settled decision goes back through the delegate for the decisions that hung
off it before the structure changes.
Each round: apply the feedback, re-show only the blocks that changed (the
proposed tree, the mermaid, or the affected table rows — not the whole set),
answer questions by pointing at a node or a `file:line`, and keep the
decision table current.
Repeat until the user confirms the design is understood and settled. If they go
quiet mid-loop, the design is NOT confirmed — wait or ask, don't advance.

### 6. Spec
Write the spec from the last structure the user confirmed in chat (when a page
exists, re-read its live version first — the user may have edited it). Write it
as a local markdown file (Korean prose,
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
artifact: none            # the page route only if the user asked for one
branch: <filled at handoff>
execution:                # direct/implement on Codex; omit for matt-auto/autocode
  implementer: gemini    # bounded Default work; astra for Deep
  support: antigravity   # strongest available Gemini, maximum supported thinking
  fallback: codex       # quota exhaustion
  reviewer: astra         # fixed: independent extra-high review
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
## 확정 구조   — the confirmed step-4 mermaid source, as shown in chat
## 결정        — table: id · 질문 · 선택 · 이유 (the step-4 decision table)
## 검토 로그   — the step-3 self-grill log: 질문 · 결정 · 이유 · 설계에 미친 변화
## 구현 순서   — numbered steps, each tagged `[deep]` or `[default]`, each with a verify check
```

`kind` is `optimize` when the design exists to move a measured number, `feature`
otherwise. Do NOT publish the spec anywhere — no issues, no PRs.

**Tag every step** of 구현 순서 with `[deep]` — core logic, invariants,
concurrency, an interface other steps depend on — or `[default]` — tests,
fixtures, docs, mechanical edits, copies of an existing pattern. `matt-auto
--spec` reads the tag as the ticket's tier (model-routing's Deep / Default,
on Codex Astra low / Luna medium), so the tags are what put each part of the work on the
model it needs; their count is also the evidence for the `loop` recommendation.

**Recommend `loop`** from the spec — scaffolding shrinks as the model gets
stronger, so the question is whether matt-auto's fixed cost (interview, board,
ledger) buys more than it costs here:

| Signal | `loop` |
|---|---|
| 1–2 steps, one file | `implement` — on Codex use the allowed-pair execution protocol with independent Astra xhigh review; elsewhere use the platform's one-file implementation skill |
| 3–6 steps, few tests | `direct` — any `[deep]` step → Deep, otherwise Gemini first, Codex on quota exhaustion; independent Astra xhigh review |
| 7+ steps, or steps that can run in parallel, mostly `[default]` | `matt-auto` — many tickets on the cheap tier, each verified by the coordinator; the coordinator and delegate stay Deep |
| `kind: optimize` | `autocode`; structure first and then a number → `loop: matt-auto` with `followup: autocode` and the metric block filled |

For a Codex `direct` or `implement` spec, fill `execution` using the rule above and read
`references/codex-execution.md`; `reviewer` stays `astra`. The thresholds are starting points — move them after a few runs. A spec that
mixes `[deep]` and `[default]` steps is `matt-auto` with the tags doing the
model split, never direct plus matt-auto. Write the recommendation's reason in
one line under the frontmatter (`추천: matt-auto — 9단계, deep 2 · default 7`)
and repeat it in the step-8 question.

### 7. Review gate
On Claude Code, run `code-review` with the spec path as before. On Codex, spawn `matt-reviewer` with
`fork_turns: "none"` to read the spec file directly and adversarially check
contradictions, missing edge cases, unverifiable steps, and drift from the
confirmed structure; role missing → direct `gpt-6-astra`/`xhigh`, reported once. This
is a file review, not `$code-review`'s Git-diff interface. Apply valid findings
to the spec and show the changed blocks in chat.

Any spec change from here on edits the mermaid in the spec and the chat view
together (and the page's SVG, when one exists — then republish and run its
render check).

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
   state the route (Deep for `[deep]`, otherwise Gemini first with Codex quota fallback;
   independent Astra xhigh review is fixed);
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
   execution protocol (implementer from frontmatter, independent Astra xhigh review)
   ```
   A Codex session receiving that line reads `references/codex-execution.md` and
   owns the Gemini-priority/Codex-fallback implementation and independent review loop through completion. In a Codex design session,
   이 세션에서 계속 runs that protocol here. On other platforms, retain the
   self-contained meta prompt with the spec's goal, checks, and definition of done.
5. **Report and stop** (Codex / OpenCode / 명령만 받기 / `/fork`): spec path,
   page route (only if one exists), `base → branch`, where it went (terminal handle or
   "붙여넣기") and the handoff line. Do not watch the run — from here its own
   loop-report page is the window. 이 세션에서 계속: report the same facts in one
   line and go on as the loop.
