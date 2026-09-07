# weed-plugins

One repo, per-loop plugins. An AI-CLI harness by weedmo — installable skill packs
for **Claude Code, Codex, opencode, gemini-cli, and Orca**.

| Plugin | Where | What | Required |
|--------|-------|------|----------|
| `weed-harness` | repo root | The shared runtime every loop builds on — `loop-report` (live progress page; Artifact on Claude Code, Orca delivery elsewhere), `interview-report` and `autocode-board` (the loops' page views), `model-routing` (Codex-side model/effort tiers), `loop-gates` (unlazy-backed completion) — plus the Claude Code-only setup, hooks, and HUD | yes, every platform |
| `matt-loop` | `plugins/matt-loop-claude/` · `plugins/matt-loop-codex/` | matt-auto + vendored Matt Pocock skills (a conducted Matt flow with a decision graph); one edition per platform | optional, needs weed-harness 5.0+ |
| `auto-loop` | `plugins/auto-loop-claude/` · `plugins/auto-loop-codex/` | autocode hypothesis-driven parallel code improvement loop with a live experiment board; one edition per platform | optional, needs weed-harness 5.0+ |

The split: **weed-harness is the loop runtime** (what every long delegated run
needs — a page the user can watch, one routing table, gates that make "done"
measurable), and each loop plugin is only its own graph (matt-auto's decision
stages and ticket waves, autocode's hypothesis frontier). External loops
(superpowers, graphify, …) and the [unlazy](https://github.com/Leonxlnx/unlazy)
skill are referenced, not vendored: the installer ensures unlazy with
`npx skills add Leonxlnx/unlazy -g`, and the `auto-update.sh` SessionStart hook
keeps it, graphify, superpowers, and the three plugins up to date once present.

## Install (recommended): npx installer

One command installs skill packs to any combination of the supported
platforms. `weed-harness` is always installed (its Claude Code-only `setup`
and `design-map` skills are skipped elsewhere); the loop plugins are opt-in.
Unless `--no-unlazy` is given, the installer also ensures the unlazy skill.

```bash
# Interactive: pick platforms, then pick plugins
npx github:weedmo/skills

# Everything, everywhere
npx github:weedmo/skills --yes

# Choose platforms and plugins explicitly
npx github:weedmo/skills --platforms claude-code,codex --plugins matt-loop,auto-loop

# Install every skill in OpenCode
npx github:weedmo/skills --platforms opencode --plugins all

# Preview without writing
npx github:weedmo/skills --yes --dry-run
```

### Where skills are installed

| Platform | Skill directory | Notes |
|----------|-----------------|-------|
| `claude-code` | `~/.claude/skills/` | Installs weed-harness (shared runtime + Claude-only `setup` / `design-map`) plus selected loop plugins. If you already installed these via `/plugin install`, skip this platform to avoid duplicates. |
| `codex` | `~/.codex/skills/` | Native SKILL.md discovery. Installs weed-harness's shared skills plus selected loop plugins. Restart Codex after install. |
| `opencode` | `~/.config/opencode/skills/` | Native SKILL.md discovery. Invalid underscores in skill IDs are normalized to hyphens. matt-loop also installs routing agents under `~/.config/opencode/agents/` and slash commands for every Matt Loop skill under `~/.config/opencode/command/`. |
| `gemini-cli` | `~/.gemini/skills/` | No native skill discovery — reference the skill files from `~/.gemini/GEMINI.md` yourself. |
| `orca` | `~/.agents/skills/` | Universal agent-skills directory; Orca exposes these skills to every agent it drives. Skip this platform if you installed the plugins natively via Claude/Codex (see [Orca](#orca) below) to avoid duplicates. |

Re-running the installer overwrites installed skills with the latest versions,
so it doubles as an updater (`npx github:weedmo/skills --yes` pulls the current
main branch every time).

After installing on Claude Code, run `/setup` once to configure the statusLine
HUD and register the custom hooks (language-rule, auto-update).

## Install (alternative): native plugin systems

Every plugin is also installable through each CLI's own plugin system.

### Claude Code

```bash
/plugin marketplace add weedmo/skills

/plugin install weed-harness@weed-plugins   # shared loop runtime + Claude setup, hooks, HUD (required)
/plugin install matt-loop@weed-plugins      # optional
/plugin install auto-loop@weed-plugins      # optional
```

Or via CLI: `claude plugin marketplace add https://github.com/weedmo/skills.git`
then `claude plugin install <name>@weed-plugins`.

### Codex

```bash
codex plugin marketplace add weedmo/skills

codex plugin add weed-harness@weed-plugins   # shared loop runtime (required by the loops)
codex plugin add matt-loop@weed-plugins      # optional
codex plugin add auto-loop@weed-plugins      # optional
```

Start a new Codex session so the packaged skills are discovered. Each package
carries `.codex-plugin/plugin.json` metadata, and the repo-local Codex
marketplace (`.agents/plugins/marketplace.json`) lists all three plugins.

opencode and gemini-cli have no compatible plugin marketplace — use the npx
installer for those.

### Orca

Orca (the multi-agent IDE) has no skill plugin format of its own yet — its
current plugin manifest (`orca-plugin.json`) does not accept skill
contributions. Instead, Orca discovers and manages skills from the native
plugin systems and skill directories of the agents it drives:

| Orca skill source | How these plugins get there |
|-------------------|------------------------------|
| Claude plugin installs (`~/.claude/plugins/`) | `/plugin install <name>@weed-plugins` — Orca reads each install's `.claude-plugin/plugin.json` `skills` field |
| Codex plugin cache (`~/.codex/plugins/cache/`) | `codex plugin add <name>@weed-plugins` — Orca reads `.codex-plugin/plugin.json` |
| OpenCode home skills (`~/.config/opencode/skills/`) | npx installer with `--platforms opencode` |
| Agent-skills home (`~/.agents/skills/`) | npx installer with `--platforms orca` — exposed to **every** Orca agent |

So the recommended Orca setup is simply the native plugin installs above
(Claude + Codex), plus `--platforms opencode` or `--platforms orca` for the
rest. Orca then tracks these skills in its Skills UI, per agent, and flags
stale copies. Pick ONE channel per platform — native plugin install or npx
copy — to avoid duplicate skill entries.

Current limitation: Claude-specific hook automation and slash-command behavior
ship only with the Claude plugin; on other platforms the skills act as
workflow guidance.

## Skills

### weed-harness (the shared loop runtime)

| Skill | Platforms | Description |
|-------|-----------|-------------|
| `loop-report` | all | Builds the live progress page of a delegated run from `assets/shell.html` + the loop's view + a data JSON (`assets/render.py`), and delivers it with `assets/deliver.py` (`probe` / `publish` / `show`): Orca artifact link, or the Orca built-in browser tab when links are unavailable, or the path — route kept stable per run; `npm test` runs its tests against a fake Orca CLI |
| `model-routing` | Codex · OpenCode · Orca | The Default / Deep tier table with the exact model and reasoning-effort pair per platform (Codex `spawn_agent`, Claude Code agents, OpenCode, Orca `worker-start` flags), dispatch rules, and the escalation ladder |
| `interview-report` | all | matt-auto's decision-graph view (`assets/view.html` + `validate.py`) — stages, editable decision nodes with the `<slug>.edits.json` round-trip, ticket waves, the execution plan, review and PR lanes — rendered by `loop-report` |
| `autocode-board` | all | autocode's experiment board view, data checks, and the templates / schemas / prompts autocode reads (`assets/reference.md`) |
| `loop-gates` | all | How the loops use the upstream unlazy skill: ledger per unit of work, coordinator-side `--reverify`, two retries then handoff, boundaries with Orca |
| `/setup` | Claude Code | Terminal UI + basic settings only: statusLine HUD, custom hooks (language-rule, auto-update) |
| `/design-map` | Claude Code | Visual-first design flow on an Artifact diagram — the design is grilled against a fork delegate (design tree, frontier rounds, `ESCALATE` for the user) before the first publish, and the decisions plus the grill log sit on the page — ending in a spec file with a frontmatter the loops read — every 구현 순서 step tagged `[deep]` / `[default]` (matt-auto reads the tag as the ticket's tier) and a `loop` recommended from the spec's size (`direct` = one strong-model session on a meta prompt, `matt-auto` = many cheap-tier tickets, `autocode`, `implement`); the handoff commits the spec on a branch and hands it to the loop on Codex or OpenCode (Orca terminal when reachable, else a line to paste) |

### matt-loop

Two editions of the same flow, one per plugin root. `plugins/matt-loop-claude` (Claude Code) is built on the built-ins — a fork as the decision delegate, plugin agents for tickets, Workflow or `/batch` for parallel waves, `/code-review` · `/simplify` · `/security-review` for the review pass, `/loop` for PR shepherding, the Artifact tool for the page — and adds an execution plan gate (engine, model, agents, review level, cost) the user approves before anything runs. `plugins/matt-loop-codex` (Codex, OpenCode, Orca) routes through `model-routing`, runs parallel waves as Orca workers, and delivers with `deliver.py`. Both read the same `interview-report` view.

| Skill | Description |
|-------|-------------|
| `matt-auto` | Conductor for Matt Pocock's main flow (interview → spec → tickets → implementation) with a decision delegate, one interview gate, and automatic model/effort routing via `model-routing`; publishes its decision graph and live ticket board through `interview-report` → `loop-report`; `--spec <path>` takes a confirmed design-map spec (its decisions become a read-only design stage, the interview asks only what is left open, its `[deep]` / `[default]` step tags fix the ticket tiers); `--dev` / `--main` / `--pr <base>` also opens a PR and shepherds it to merge-ready via pr-babysit; independent tickets run in parallel as Orca-orchestrated workers when Orca is reachable |
| `pr-babysit` | Shepherd one open GitHub PR through CI and review with automatic model/effort routing on Codex, OpenCode, and Claude Code |
| `resolving-merge-conflicts` | Resolve an active merge/rebase conflict; direct OpenCode / Claude Code use routes to a deep model |
| vendored Matt Pocock skills | The remaining upstream skills matt-auto conducts: `grilling`, `grill-me`, `grill-with-docs`, `to-spec`, `to-tickets`, `handoff`, `tdd`, `implement`, `diagnosing-bugs`, `codebase-design`, `domain-modeling`, `research`, `prototype`, `code-review`, `setup-matt-pocock-skills` |

The vendored skills come from
[mattpocock/skills](https://github.com/mattpocock/skills) and are auto-synced:
a daily GitHub Actions workflow (`sync-mattpocock.yml`) re-vendors them, bumps
the matt-loop patch version, and commits when upstream changed. The pinned
upstream commit lives in `plugins/matt-loop-codex/mattpocock.lock.json`; to sync
manually (both roots), run `bash plugins/matt-loop-codex/scripts/sync-upstream.sh`. On this
machine the `auto-update.sh` SessionStart hook then propagates every matt-loop
skill to `~/.codex/skills/`.

### auto-loop

Two editions as well: `plugins/auto-loop-claude` (in-session experimenters, plugin agents, Artifact board) and `plugins/auto-loop-codex` (Orca placement, `model-routing`, `deliver.py`); both render `autocode-board`.

| Skill | Description |
|-------|-------------|
| `/autocode` | Hypothesis-driven parallel code improvement loop (`init --spec <path>` pre-fills the interview from a confirmed design-map spec): a strategist on the expensive tier proposes hypotheses, experimenters routed by difficulty (via `model-routing`) run them concurrently in worktrees, measurement stays serial; the run publishes a live experiment board (metric trend, frontier, experiment log) through `loop-report`, terminates on unlazy gates per `loop-gates`, and collects the kept changes — one squash commit each with its measurement, on `autocode/<slug>` in its own worktree so the user's checkout never moves — into a PR against the branch it started from (`run --pr <base>` / `--no-pr`; never merged) |

## Docs

- `docs/skills-hooks-reference.html` — Notion-style reference of every skill and hook
- `docs/SKILL_MAP.md` — decision guide for picking the right skill/engine per task

## License

MIT
