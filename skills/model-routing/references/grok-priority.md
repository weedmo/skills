# Grok priority

Grok is the first choice for **lookups**: read-only searches whose result the main
session needs but whose path through files and pages it does not (purpose-loops D8).
It also triages QA. It never reviews code and never takes first-choice implementation;
review is one cross-family reviewer, Codex (Claude for Codex-written code), routed by
`gate-route.mjs --role review`.

## Grok slots

Grok joins these slots while its weekly token use stays under 90%. At 90% or above,
paused after a usage limit, or when `grok` is missing, the slot uses its fallback.
Data lives in `gate-routes.json` (`families.grok`, `grok_priority`); the check is
`node <model-routing>/scripts/grok.mjs status`.

| Slot | Under the cap (default on) | At/over the cap, paused after a usage limit, or `grok` missing |
|---|---|---|
| Lookup (`gate-route.mjs --role lookup --host <claude\|codex>`) | `grok-4.7-build-fast`, code and web | The host's lookup route: Claude Code `Explore` agent; Codex `matt-fast` |
| QA triage (`qa-gate`) | `grok-4.7-build-fast` | Writer's other family |
| Gemini quota exhausted (design-page / large-context slots) | Grok worker, then Codex | Codex continuation |

Grok never authors QA scenarios.

## Lookups

A lookup is worth a subagent only when its answer is short and its search is long:
sweeping files for where something lives, reading external docs or release notes,
checking a fact on the web. Anything the main session will edit next it reads itself.
Send independent lookups in parallel, one prompt each, and ask for paths, lines and
source URLs so the answer can be checked.

Measured 2026-11-26: one code + web lookup took 17 s, 3 turns and $0.07 on
`grok-4.7-build-fast`.

## Weekly use

`grok.mjs status` sums `totalTokens` from `~/.grok/sessions/*/*/usage.json` updated in
the last 7 days (TUI and headless sessions on this machine) and compares it with the
weekly budget, cap 90% by default:

1. `GROK_WEEKLY_TOKEN_BUDGET`, else `grok_priority.weekly_token_budget`, else
2. the **learned** budget: when Grok reports its usage limit, `grok.mjs extract` records
   the tokens counted at that moment as the allowance
   (`~/.local/state/weed-harness/grok-budget.json`), and Grok pauses for
   `pause_hours_after_limit` (24 h).
3. No budget yet → Grok is **on**; the first usage-limit error teaches the budget, so
   the first week can run to 100% and every later week stops at 90%.

`grok usage` cannot report the plan's own limit outside Grok's background service,
which is why the budget is learned. Use on other machines or grok.com is not counted,
so a learned budget can come out low; set the variable to override it.
`gate-route.mjs` reads the same status on every call (`--no-grok` forces the
fallbacks) and puts it in `reasons`.

## Launch

Lookup, from the repository root. Plan mode keeps it read-only; web search stays on:

```
grok --prompt-file <prompt.txt> -m grok-4.7-build-fast --permission-mode plan \
  --deny 'MCPTool(*)' --no-subagents --no-memory --output-format json > <out>.json 2> <out>.err
```

Read the answer from `.text` in `<out>.json`. A lookup that comes back without the
paths or URLs it was asked for is re-asked once, then done in the main session. A
usage-limit error → `node <model-routing>/scripts/grok.mjs extract <out>.json <out>.x
--model grok-4.7-build-fast --stderr <out>.err` records it, and the lookup is routed
again with `gate-route.mjs`, which now leaves Grok out.

QA triage, read-only (`<schema>` is the role's JSON schema):

```
grok --prompt-file <prompt.txt> -m <model> [--reasoning-effort <effort>] --permission-mode plan \
  --tools read_file,list_dir,grep --deny 'MCPTool(*)' --disable-web-search --no-subagents \
  --output-format json --json-schema "$(cat <schema>)" > <out>.raw 2> <out>.err
node <model-routing>/scripts/grok.mjs extract <out>.raw <out> --model <model> [--effort <effort>] --stderr <out>.err
```

The launch has no shell, so `<prompt.txt>` is the filled prompt followed by the material
the prompt says to run. `extract` refuses an envelope with fewer than two turns: Grok
can return a schema-valid empty answer without opening a file. A refusal counts as a
schema failure (one re-run, then the gate's normal `ERROR`). A usage-limit failure is
recorded instead: route again with `gate-route.mjs`, which now leaves Grok out.

Gemini-exhaustion worker: `grok -p --prompt-file <brief> -m grok-4.7 --reasoning-effort high
-w <name> --permission-mode acceptEdits --deny 'MCPTool(*)' --output-format json`. It
edits in its own worktree; the coordinator runs verification and the usual
independent review (with `--writer grok`). Re-check `grok.mjs status` before each dispatch.
