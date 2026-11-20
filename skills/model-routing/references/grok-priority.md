# Grok priority

## Families by what is installed

Review uses every installed family that did not write the code; `gate-route.mjs`
detects the CLIs (`claude`, `codex`, `grok`) on each call.

| Installed (writer Claude) | Reviewers | `cross_model` |
|---|---|---|
| `claude` only | Claude, fresh context | false |
| `codex` only | Codex | true |
| `claude` + `codex` | Codex | true |
| `claude` + `grok` | Grok (+ Claude base on a risk trigger) | true |
| `claude` + `codex` + `grok` | Grok + Codex, both one tier up on a risk trigger | true |

The same holds with the families swapped for a Codex writer. Mixed (Claude + Codex)
work goes to Grok when it is usable, otherwise to one Claude and one Codex reviewer.
Implementation stays on the host's own agents (Claude Code agents, Codex roles), so a
loop needs only its host CLI; the other CLIs only widen review.

## Grok slots

Grok joins three slots while its weekly token use stays under 90%. At 90% or above —
or when the use cannot be measured — Grok drops out and every slot runs exactly as the
table above without it. Data lives in `gate-routes.json` (`families.grok`, `grok_priority`);
the check is `node <model-routing>/scripts/grok.mjs status`.

| Slot | Under the cap (default on) | At/over the cap, paused after a usage limit, or `grok` missing |
|---|---|---|
| Review (`review-gate`) | `grok-4.7` / medium, first of the reviewers above; `grok-4.7` / high on a risk trigger | The reviewers above without Grok |
| QA triage (`qa-gate`) | `grok-4.7-build-fast` | Writer's other family, as before |
| Gemini quota exhausted (design-map / large-context slots) | Grok worker, then Codex | Codex continuation, as before |

Grok never reviews code Grok wrote (`--writer grok`), and never authors QA scenarios
or takes first-choice implementation.

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
`gate-route.mjs` reads the same status on every call (`--no-grok` forces the routes
without Grok) and puts it in `reasons`.

## Launch

Read-only reviewer or triage, from the repository root (`<schema>` is the role's JSON schema):

```
grok --prompt-file <prompt.txt> -m <model> [--reasoning-effort <effort>] --permission-mode plan \
  --tools read_file,list_dir,grep --deny 'MCPTool(*)' --disable-web-search --no-subagents \
  --output-format json --json-schema "$(cat <schema>)" > <out>.raw 2> <out>.err
node <model-routing>/scripts/grok.mjs extract <out>.raw <out> --model <model> [--effort <effort>] --stderr <out>.err
```

The launch has no shell, so `<prompt.txt>` is the filled prompt followed by the material
the prompt says to run: for review, a line "You have no shell; the diff follows" and the
output of `git diff <base>...HEAD`. Measured on a 44 KB prompt: 6 turns, 318k tokens,
$0.18, about 6 minutes; budget the wait accordingly.

`extract` refuses an envelope with fewer than two turns: Grok can return a
schema-valid empty answer without opening a file. A refusal counts as a schema failure
(one re-run, then the gate's normal `ERROR`). A usage-limit failure is recorded instead:
route the round again with `gate-route.mjs`, which now leaves Grok out.

Gemini-exhaustion worker: `grok -p --prompt-file <brief> -m grok-4.7 --reasoning-effort high
-w <name> --permission-mode acceptEdits --deny 'MCPTool(*)' --output-format json`. It
edits in its own worktree; the coordinator runs verification and the usual
independent review (with `--writer grok`). Re-check `grok.mjs status` before each dispatch.
