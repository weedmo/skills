---
name: pr-visual
description: "As-Is / To-Be visuals for every PR a loop opens: a web change is filmed on the base commit and on HEAD and shown side by side before the PR (Codex first, Claude Artifact second); a pipeline change gets As-Is / To-Be mermaid diagrams in the PR body. Called by matt-auto and autocode right before `gh pr create`; also standalone as `pr-visual <base>` for any branch."
---

# pr-visual

A reviewer should understand the change from pictures before reading the diff. Every
PR gets an **As-Is / To-Be** section; which kind depends on what changed. A change can
be both: then do both.

| Change | Evidence | Where it goes |
|---|---|---|
| **web** — a UI a person opens in a browser changed (qa-gate surface `web`) | Video of each web scenario on the base commit and on HEAD | Shown before the PR (order below); the PR body gets a text table |
| **pipeline** — any flow: loop/skill steps, CI, data or job pipelines, request paths, module wiring | As-Is and To-Be mermaid diagrams | PR body (GitHub renders mermaid) and printed before the PR |

Nothing goes to GitHub: no assets branch, no committed media. Keep `.pr-visual/` out of
git with `.git/info/exclude`.

## Inputs

- `base` — the PR base commit (matt-auto `<baseline>`, autocode `base_commit`, or `git merge-base origin/<base> HEAD`).
- `unit` — the same slug as qa-gate / review-gate.
- `spec` — optional; its `## 확정 구조` and the current-structure notes seed the diagrams.

## Web: film As-Is and To-Be

1. Use qa-gate's `.qa/<unit>/plan.json` and scripted Playwright scenarios; they honour
   `QA_VIDEO_DIR` ([drivers](../qa-gate/references/drivers.md)). No QA plan yet → write one
   through qa-gate first (its QA author route), web scenarios only.
2. From the repository root:
   `node <pr-visual>/scripts/record.mjs .qa/<unit> .pr-visual/<unit> --base <base>`.
   It starts the app from a temporary worktree at `base` (As-Is), then from the working
   tree (To-Be), runs every scripted scenario with recording on, writes
   `.pr-visual/<unit>/compare.html` (videos side by side, one "play both" button),
   `share.html` (the same page with the videos inlined, for a Claude Artifact; shrunk with
   Playwright's ffmpeg when over 15 MB) and `summary.json`, and removes the worktree.
   Pass `--host codex` or `--host claude` for the session you run in. As-Is is expected to
   fail the new criteria; its exit code is shown, not enforced.
3. **Show it before the PR, in this order.**
   1. **Codex** — in a Codex session, `python3 <loop-report>/assets/deliver.py publish
      --page .pr-visual/<unit>/compare.html` (opened once with the system opener; under
      Herdr it lands in Herdr's Artifact panel), exactly as loops deliver their report page.
   2. **Claude** — in Claude Code, publish `share.html` with the Artifact tool (the same
      path each run keeps the URL; it is private until the user shares it).
   3. **Local** — neither app: the script opens `compare.html` in the local browser, or
      prints its path when there is no display.
   Then print one line per scenario (`<id>: As-Is <what the video shows> → To-Be <what
   changes>`), written from watching the result, not from the spec.
4. PR body: a table `시나리오 · As-Is · To-Be` from step 3, and the note that the
   recordings were reviewed locally (`compare.html`, not attached).

Recording fails (no Playwright, no ffmpeg, the base app does not start) → one retry
after `npx playwright install chromium ffmpeg` when that is the cause; then print the
reason, put `영상: 생략 — <reason>` in the body, and continue. Never block the PR on media.

## Pipeline: draw As-Is and To-Be

For each changed flow, two mermaid `flowchart` blocks under `### As-Is` and `### To-Be`:

- Same node ids and the same direction in both, so the eye compares like with like.
- Mark what changed in To-Be with `classDef added` (new), `classDef changed` (altered),
  and in As-Is `classDef removed` (gone); add a one-line legend.
- At most 12 nodes per diagram; split a larger flow into an overview plus one detail
  pair rather than shrinking labels. Quote labels (`A["…"]`), Korean prose, real identifiers.
- Draw from the code at `base` and at HEAD (`git show <base>:<path>`), the spec, and the
  repository's docs; a node you cannot ground in one of them is left out.
- Below the pair, a table `무엇이 · As-Is · To-Be` with one row per changed node.

autocode adds one `xychart-beta` of the metric per kept experiment (baseline first).

Print the section in the terminal before the PR, then put it in the body.

## Report

One line on the progress board: `pr-visual: web <n> scenarios (compare.html) · pipeline <n> diagrams`,
or the reason a part was skipped.

## Red flags

- Opening the PR before the visuals were shown.
- Diagrams that restate the file list, or a To-Be with no As-Is to compare against.
- Committing `.pr-visual/`, putting media on GitHub, or pushing an extra branch for assets.
- Opening the page yourself on Codex instead of `deliver.py publish`.
- Describing a video you did not watch the result of, or claiming a recording that failed.
