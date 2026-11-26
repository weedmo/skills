---
name: pr-visual
description: "As-Is / To-Be change-point page for every PR a loop opens, made by one headless Codex run: each change point side by side (code at the base commit and at HEAD, what and why), the As-Is / To-Be flow diagrams, and for web changes the base and HEAD recordings, all in one self-contained page shown as an Artifact before the PR. The PR body gets text only — no videos. Called by matt-auto and autocode right before `gh pr create`; also standalone as `pr-visual <base>` for any branch."
---

# pr-visual

A reviewer should understand the change from one page before reading the diff. Codex
builds a **change-point page** (`.pr-visual/<unit>/changes.html`) and the main session
shows it as an Artifact before the PR:

| Part | Content | When |
|---|---|---|
| Change points | Each changed spot: As-Is code at `base`, To-Be code at HEAD, side by side, with what changed and why | Always |
| Flow | As-Is and To-Be mermaid diagrams | A flow changed: loop/skill steps, CI, data or job pipelines, request paths, module wiring |
| Screen | Each web scenario recorded on `base` and on HEAD, inlined | A UI a person opens in a browser changed (qa-gate surface `web`) |

The PR gets **text only**: no videos, no images, no assets branch, no committed media.
Keep `.pr-visual/` out of git with `.git/info/exclude`.

## Who makes it

One headless Codex run builds the page, on either host; the loop's main session only
shows it and puts the text section in the PR body (purpose-loops D10). Recording logs,
code excerpts and diagram drafts stay out of the main session's context. From the
repository root (the Standard pair from model routing; `<host>` is the main session's,
`claude` or `codex`):

```
codex exec -m gpt-6.2-sol -c model_reasoning_effort=low -s workspace-write \
  -c sandbox_workspace_write.network_access=true -o .pr-visual/<unit>/codex.md \
  "Follow <pr-visual>/SKILL.md for base <base>, unit <unit>, spec <spec or none>,
   host <host>. Build .pr-visual/<unit>/changes.html and write the PR text to
   .pr-visual/<unit>/section.md. Do not commit, push, or open a PR." < /dev/null
```

`< /dev/null` matters: with an open stdin `codex exec` waits for more input and never
starts. Measured 2026-11-26 on a two-commit web fixture: about 70 s and 36k tokens for
two recordings, two diagrams and the section.

Then the main session shows `changes.html` (the last line `changes.mjs` printed names
where): Claude host → the Artifact tool, same path each run so the URL stays; Codex
host → `python3 <loop-report>/assets/deliver.py publish --page .pr-visual/<unit>/changes.html`;
over the Artifact cap or neither app → open it locally, or print its path without a
display. Put `section.md` in the PR body with one line `변경 지점 페이지: <Artifact URL or
local path>`. No `changes.html` → one re-run with the error appended; still none →
write `시각 보고: 생략 — <reason>` in the body and continue. The PR never waits on it.

## Inputs

- `base` — the PR base commit (matt-auto `<baseline>`, autocode `base_commit`, or `git merge-base origin/<base> HEAD`).
- `unit` — the same slug as qa-gate / review-gate.
- `spec` — optional; its `## 확정 구조` and the current-structure notes seed the diagrams.

## Steps (the Codex run)

1. **Screen (web only).** Use qa-gate's `.qa/<unit>/plan.json` and scripted Playwright
   scenarios; they honour `QA_VIDEO_DIR` ([drivers](../qa-gate/references/drivers.md)).
   No QA plan yet → write one through qa-gate first (its QA author route), web
   scenarios only. Then `node <pr-visual>/scripts/record.mjs .qa/<unit> .pr-visual/<unit>
   --base <base> --host <host> --no-open`. It starts the app from an export of `base`
   (`git archive`, so a read-only `.git` is fine) as As-Is, then from the working tree
   as To-Be, records every scripted scenario, and writes `summary.json` beside the
   videos. As-Is is expected to fail the new criteria; its exit code is shown, not
   enforced. Recording fails (no Playwright, no ffmpeg, the base app does not start) →
   one retry after `npx playwright install chromium ffmpeg` when that is the cause; then
   continue without the screen part and say why in `section.md`.
2. **Change points.** Read `git diff <base>...HEAD` and pick the spots a reviewer must
   understand — behaviour, interfaces, data, flow — not every hunk. Write
   `.pr-visual/<unit>/changes.json`:
   `{"title", "summary", "points": [{"title", "file", "as_is": {"start", "end"} | null,
   "to_be": {"start", "end"} | null, "what", "why"}], "diagrams": {"as_is", "to_be"}}`.
   Line ranges are 1-based and inclusive: `as_is` in the file at `base`, `to_be` in the
   working tree; `null` for a file that was added or deleted. Keep each excerpt short
   (under about 30 lines). `what` and `why` are Korean prose grounded in the diff and the
   spec.
3. **Flow (when a flow changed).** Put one mermaid `flowchart` per side in
   `diagrams.as_is` / `diagrams.to_be`:
   - Same node ids and direction in both, so the eye compares like with like.
   - Mark To-Be with `classDef added` (new) and `classDef changed` (altered), As-Is with
     `classDef removed` (gone).
   - At most 12 nodes; quote labels (`A["…"]`), Korean prose, real identifiers.
   - Draw from the code at `base` and HEAD (`git show <base>:<path>`), the spec and the
     repository's docs; a node you cannot ground in one of them is left out.
4. **Build.** `node <pr-visual>/scripts/changes.mjs .pr-visual/<unit> --base <base>
   --host <host>`. It validates `changes.json`, cuts the excerpts, inlines the
   recordings from `summary.json` (shrunk with Playwright's ffmpeg when over 15 MB, left
   out with a note when still over), and writes `changes.html`. The diagrams render with
   mermaid from a CDN; where the viewer blocks it, their source text shows instead. A validation error is
   fixed in `changes.json` and the build re-run.
5. **PR text.** Write `section.md`:
   - `## As-Is / To-Be` with a table `변경 지점 · As-Is · To-Be`, one row per point.
   - For web, a table `시나리오 · As-Is · To-Be`, written from watching the recordings,
     not from the spec, and the note that the recordings are in the change-point page.
   - The same two mermaid diagrams under `### As-Is` and `### To-Be` (GitHub renders
     them; they are text, not media).
   - autocode adds one `xychart-beta` of the metric per kept experiment (baseline first).
   - No page link: the main session adds it after showing the page.

## Report

One line on the progress board: `pr-visual: <n> change points · web <n> scenarios · flow <yes|no> (changes.html)`,
or the reason a part was skipped.

## Red flags

- Opening the PR before the page was shown.
- Videos, images or any media in the PR body, on GitHub, or on an extra branch; committing `.pr-visual/`.
- Change points that restate the file list, or a To-Be with no As-Is to compare against.
- Opening the page yourself on Codex instead of `deliver.py publish`.
- Recording, cutting excerpts or drawing in the main session instead of handing it to the Codex run.
- Describing a video you did not watch the result of, or claiming a recording that failed.
