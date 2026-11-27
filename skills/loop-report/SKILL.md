---
name: loop-report
description: "Builds and delivers the live progress page of a long-running delegated loop (autocode, and any loop that runs for minutes to hours on the user's behalf) — one self-contained HTML the user can read while the loop runs and keep afterwards. The build is `assets/render.py` over `assets/shell.html` plus the calling loop's view; the delivery is `assets/deliver.py` (the page opened once with the system opener, or the path), which keeps the route stable for the whole run. The loops' own views ship here too: `views/autocode` (the experiment board, with autocode's templates). Callers run those two scripts and relay the answer; they never open the page themselves. Called by autocode; `deliver.py` also delivers other pages (pr-visual, matt-design's design page). Do not trigger standalone."
---

# Loop report (the shared progress page)

A delegated loop runs unattended for a long time. Two things make that bearable for the person who delegated it: they can see where it is without opening a terminal, and the page they are looking at keeps updating. This skill owns both — the page and how it reaches the user — for every loop in this harness, so no loop grows its own copy.

The loop owns its *graph* (autocode's hypothesis frontier and metric trend). This skill owns everything around it: the design system, the 진행 상황 header with percent, elapsed time and ETA, blockers, the 결과 panel measured from git, the auto-refresh poll, the theme toggle, the modal — and the delivery.

## Two scripts, two verbs

Both live in `assets/` next to this file. `<this skill's dir>` is the directory holding this SKILL.md: `~/.codex/skills/loop-report` under the npx installer on Codex, the installed weed-harness plugin's `skills/loop-report` on Claude Code or a native Codex plugin install, `~/.agents/skills/loop-report` for the `agents` platform.

**Build** — the caller writes its data JSON next to the page and names its view:

```
python3 <this skill's dir>/assets/render.py \
  --data <dir>/<slug>.data.json --out <dir>/<slug>.html \
  --view <this skill's dir>/views/<loop>/view.html
```

The script validates the common contract below, then the view's own `validate.py`, and refuses to write a page that would render wrong — so a regeneration is "edit the JSON, rerun the script". Never splice the shell or a view by hand (no `cp` + `sed`/`perl`): a hand-rolled substitution silently ate 30 KB of the shell in testing. Never edit the shell's or a view's CSS/JS. If `python3` is missing, say so and stop.

**Deliver** — after every build. Which way depends on the platform:

- **Claude Code** — publish the page with the **Artifact tool** on the same file path every time (same path, same URL; favicon on the first publish only) and relay the URL. No probe, no `deliver.py`; without the Artifact tool the page is a path, said once. The weed-harness mod's `/board` pane reads the same `<slug>.data.json` in the terminal (it opens by itself when the file is written under `.autocode/report/`); nothing to run for it, and it never replaces the Artifact publish.
- **Codex, OpenCode** — `deliver.py`, below.


```
python3 <this skill's dir>/assets/deliver.py probe   --page <dir>/<slug>.html
python3 <this skill's dir>/assets/deliver.py publish --page <dir>/<slug>.html
python3 <this skill's dir>/assets/deliver.py show    --page <dir>/<slug>.html
```

- `probe` runs once, early in the loop, before its first gate (the page need not exist yet), so the user learns *before* the gate whether the page will open by itself. `publish` runs after every regeneration. `show` reports the current route without doing anything — for a status command or a fresh context that has no publish answer in memory.
- The answer is one JSON line on stdout: `{"route": "open|path", "url", "bin", "reason"}`. Relay it as-is to the user or the calling loop — "opened + path", or the path plus `reason`. Exit code 0 means answered (a page nobody could open is an answer, not an error); 1 means the page file is missing.
- The script opens the page once with the system opener (`xdg-open`, `open` on macOS; `--bin` or `LOOP_REPORT_OPEN_BIN` names another), falls back to the path when there is no opener, no display, or the opener fails, and keeps that in `<dir>/<slug>.delivery.json`. Nothing else reads or writes that file. Under Herdr the opener can show the page in its Artifact panel; that is the machine's handler, not this script's concern.
- Later publishes never reopen the page: it reloads itself on its auto-refresh poll. A failed open is retried on the next publish.

Loops that call these scripts require weed-harness ≥ 3.1 (the version that ships `deliver.py`); when the script is missing, say `weed-harness 3.1 required: deliver.py missing` once and hand over the rendered path.

## Common data contract

```json
{
  "title": "실행 제목, in Korean",
  "slug": "run-slug",
  "generated": "2026-09-04",
  "summary": "2-4 plain-language sentences for someone with zero context, in Korean.",
  "progress": {
    "state": "running",
    "updated": "2026-09-04T10:12:00+09:00",
    "startedAt": "2026-09-04T09:30:00+09:00",
    "current": "지금 무엇을 하고 있는지 한 줄",
    "note": "선택 — 읽는 사람이 알아야 할 한 줄",
    "blockers": [ { "title": "H004", "reason": "측정 실패", "detail": "bench.py exit 2 — 머지 후 metric이 실행되지 않음" } ]
  },
  "outcome": {
    "baseRef": "2dacebe", "headRef": "3b0523e", "branch": "feature/x",
    "note": "이 diff가 무엇인지 한 줄 — 생략 가능",
    "files": [ { "path": "src/foo.ts", "status": "added", "kind": "code", "added": 120, "removed": 0, "note": "이 파일이 하는 일, 한 줄" } ]
  }
}
```

- Everything else in the file belongs to the view (see the loop's own skill for its keys).
- `progress` is present from the moment the loop is under way until it ends. `state` is `running` / `blocked` / `done`; `updated` is read from the clock (`date -Iseconds`) when you write the file — a stamp typed from memory makes the page's "N분 전 갱신" lie. `startedAt` drives 경과; percent and ETA come from the view.
- `progress.blockers` is for anything that stops the run and has no node in the view: `title`, a short `reason`, and a `detail` with the specific, checkable fact. "막혔습니다" with no detail is the failure the box exists to prevent.
- The page polls while `state` is not `done` (and on a gate page with no `progress` yet), skipping the reload while the reader has unsaved edits. `state: "done"` on the final regeneration is what stops it.
- `outcome` is the final regeneration only, together with `progress.state: "done"` (`render.py` refuses it otherwise). `status` ∈ added / modified / deleted / renamed; `kind` ∈ code / docs (`.md`/`.mdx`/`.txt`/`.rst` and docs directories) / other (lockfiles, generated output, binaries). `added` / `removed` come from `git diff --numstat <baseRef>..<headRef>` — never estimated; a binary gets `0`/`0` and a note. Leave the loop's own bookkeeping (its log folder, `.unlazy/**`, `.autocode/**`) out. `note` is one Korean line per file. Totals are computed in the page.
- Every human-facing string is Korean; ids and JSON structure stay English.

## The loops' views

| View | Loop | Beside the view |
|---|---|---|
| `views/autocode/` | autocode | `reference.md` — interview fields, `program.md` / `state.json` templates, hypothesis schema, verbatim prompts, commit and summary templates, board data |

The loop reads only the section its step names. The folder also holds `view.html` and the `validate.py` that `render.py` loads from the view's directory.

## The view interface (for loop authors)

A view is one file, `views/<loop>/view.html` in this skill, with one `<style>` block and one `<script>` block, each tag at column 0. The script assigns `window.LoopView` with any of: `kind`, `meta(data, ctx)`, `progress(data, ctx) → { percent, remainingMin, count } | null`, `blockers(data, ctx)`, `renderProgress(host, ctx)` (inside the 진행 상황 card), `renderOutcome(host, ctx)` (inside 결과, above the file table), `render(host, ctx)` (the main area), `hasUnsavedEdits()`. `ctx` carries the data and the shell's helpers (`el`, `bar`, `stat`, `section`, `kvRow`, `modal`, `clickable`, `shortRef`, time formatters, `prefs`/`setPref`). A `validate.py` next to the view exposes `validate(data) → [errors]`. The shell's CSS classes (`.flow`, `.wcol`, `.tnode`, `.badge`, `.stat`, `.panel`, `.kv`) are the component set; a view adds only what the shell lacks. Read `assets/shell.html`'s header comment and the existing views before writing a new one. `tests/test_deliver.py` runs `deliver.py` against a fake opener — run it after touching the script.

## Red flags

- Building the page with `cp` + `sed`/`perl`, or editing the shell's or a view's CSS/JS → the scripts exist because those shortcuts shipped broken pages.
- Opening the page yourself from a loop instead of `deliver.py publish` → a new window on every regeneration; the script owns the route and `delivery.json`.
- Skipping `publish` after a regeneration, or skipping the page because opening failed → the local HTML is still the report when nothing could open it.
- `progress.updated` from memory, `state` left at `running` on the final page, `outcome` line counts not from `git diff --numstat`, a blocker with a vague `detail` → each one makes the page lie in a way the reader cannot see.
