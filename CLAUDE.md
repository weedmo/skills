# Behavioral Guidelines

Reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. Make routine judgment calls yourself; ask only when
  different readings would lead to materially different work.
- If multiple interpretations exist and they matter, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If you see a real problem with the task as specified, say so in a sentence, then keep
  building under stated assumptions.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

# weed-harness - Global Rules

## Parallel Execution

Always run **independent tasks in parallel**. Never serialize work that has no dependencies.

| Parallel OK | Must be Sequential |
|-------------|-------------------|
| Editing different files/modules | Edit A → test A |
| Code analysis + doc analysis | Analysis → implementation plan |
| Independent module refactors | DB schema change → ORM update |

## Branch Workflow (Mandatory)

When starting development work in a git repo connected to GitHub:
1. **MUST** check the current branch with `git branch` and `git remote -v`
2. **MUST** ask the user before writing any code:
   - Which branch to base the work on (e.g., `main`, `develop`, existing feature branch)
   - What to name the new branch (or whether to work on the current branch)
3. **Do NOT** proceed with any code changes until the user confirms the branch setup
4. Create and checkout the branch only after user confirmation

## Git Commits

Do NOT include `Co-Authored-By` lines in commit messages.

## Auto-Fix After Review (Mandatory)

When reviewing code and finding issues:
1. **Fix all issues immediately** without asking the user for permission.
2. After fixing, **run relevant tests**. If tests fail, fix them too.
3. Never say "수정할까요?" or "진행할까요?" — just fix it.
4. The Edit/Write PostToolUse hook will trigger auto-review on your fixes.

# graft (code context graph)

graft (`@nanonets/graft`, CLI `graft`) is the standard code-graph backbone for every
repo here: a prebuilt graph of every symbol, its file:line span, and who calls what,
served to agents over MCP. The goal is **token savings** for agent retrieval and
**fast orientation** in an unfamiliar codebase. Apply this policy.

- **Installed by default**: the SessionStart hook (`~/.claude/hooks/auto-update.sh`)
  installs the CLI (`npm i -g @nanonets/graft`), upgrades it once a day, registers
  the `graft mcp` server for Claude Code (user scope, all repos) and Codex, and runs
  `graft build` in the background for any repo that has no `graft/` index yet.
  `graft/` is a git-ignored local cache; never commit it.
- **Query before you read**: in an indexed repo, answer "where is X / how does Y
  work / who calls Z" with the MCP tools first — `graft_find_code` (ranked hits, code
  inlined), `graft_find_all` (every occurrence), `graft_trace_calls` (callers and
  callees, blast radius before a rename), `graft_file_api` (a file's API in ~200
  tokens), `graft_repo_map` (orientation). One call usually replaces several file
  reads. CLI equivalents: `graft ask`, `graft callers`, `graft skeleton`, `graft map`,
  `graft blast`.
- **Freshness is automatic**: the MCP server refreshes the graph before each query,
  so results reflect uncommitted edits. `graft check` fails in CI when the index is
  stale.
- **Honest limits**: the graph is for orientation and navigation. It indexes code
  only (no SQL, docs, or config), and actual edits / deep logic verification still
  require reading the real source — the graph narrows that reading, it does not
  replace it.
