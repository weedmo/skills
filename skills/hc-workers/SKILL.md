---
name: hc-workers
description: "How the delegated loops (matt-auto, autocode, pr-babysit) run their subagents as Herdr workers: hc templates generated from the loop's role files, one visible tab per run, file-based reports sent with hc send, and a bounded wait loop. Used on Claude Code and Codex alike whenever hc is available. Reference skill, never invoked standalone."
---

# hc workers (shared)

Herdr's core, `hc`, runs agents in terminals that stay alive, that a person can
watch and take over. A loop that finds `hc` runs every implementation worker,
experimenter and long-lived specialist there instead of in its platform's
hidden subagents. `hc --skill` is the live manual and overrides any flag
written here. `<this skill's dir>` is the directory holding this file.

## Probe (once, at the loop's probe step)

hc workers are available when both hold:

```sh
[ -n "$HC_TERMINAL_ID" ] && hc ls --json >/dev/null
```

The coordinator must itself run in an hc terminal: workers are its children and
report to `$HC_TERMINAL_ID`. Otherwise print `hc unavailable: <why>` once and
use the loop's own fallback. Never mix hc workers and hidden subagents for the
same kind of task in one run.

Then generate the templates from the loop's role files:

```sh
node <this skill's dir>/scripts/hc-worker.mjs templates --roles <roles dir> [--roles <dir> ...]
```

- Claude Code: the loop plugin's `agents/` directory. `matt-deep.md` becomes
  the template `matt-deep-claude`.
- Codex: `~/.codex/agents/`. `matt-deep.toml` becomes `matt-deep-codex`.

A template pins the role's model and effort in its command, so routing a task
is choosing a template; never add a model flag on top. The answer lists
`written`, `kept` and `skipped`; a skipped name is a template the user wrote
themselves and stays theirs. `HC_WORKER_CLAUDE_FLAGS` and
`HC_WORKER_CODEX_FLAGS` replace the default permission flags
(`--dangerously-skip-permissions`,
`--dangerously-bypass-approvals-and-sandbox`); change them only when the user
asks. Workers run unattended by default: they never stop to ask for approval,
so a run does not stall on a tab nobody is watching. Each worker is confined
by its task to its own worktree, not by a sandbox; say so once at the probe.
A user who wants approval prompts back sets the variables in their own
environment (for example `HC_WORKER_CLAUDE_FLAGS='--permission-mode acceptEdits'`,
`HC_WORKER_CODEX_FLAGS='-s workspace-write -a on-request'`).

## Start a worker

Create the worker's worktree yourself (`git worktree add` from the branch the
loop names), write its task to a file, then:

```sh
node <this skill's dir>/scripts/hc-worker.mjs start --run <run slug> --name <run>-<unit> \
  --role <template> --cwd <worktree> --task-file <task file> --state <run dir>/<run>.hc.json
```

The script shows the worker in the coordinator's Herdr space, keeps every worker
of a run in one tab named after the run, and records them in the state file.
Outside a Herdr window the workers run unshown. It prints hc's answer plus
`tab` and `coordinator`.

- `first_message.sent: false` means the task was **not** delivered (Claude
  Code shows as `blocked`, Codex as "never reported its status"). `hc read`
  the terminal; a trust dialog for the worktree you just created is yours to
  accept. Pick the trust option the screen shows, never a fixed key sequence:
  the selected entry differs by CLI (Claude Code starts on "No, exit", so
  `hc keys <t> down enter`; Codex starts on "Trust and continue", so
  `hc keys <t> enter`). Then `hc send <t>` the task. Any other dialog goes to
  the user.
- The task ends with the lifecycle lines below, with `<coordinator>` and
  `<result path>` filled in. The result path is outside the worktree, next to
  the state file.

```
You are an hc worker started by terminal <coordinator>. Work only in this directory. Start no other agents.
- An open decision: `hc send <coordinator> "QUESTION <unit>: <question> Options: <a> / <b>"`, then end your turn; the answer is your next message.
- When done, write <result path> as JSON (`outcome: succeeded|failed`, what changed, commands run with their results, what remains), then send exactly once: `hc send <coordinator> "DONE <unit>: <result path>"` (or `FAILED <unit>: …`). Never report only in prose.
```

## Wait and settle

```sh
hc wait --children any --timeout 60
```

Never sleep or poll. `reason: timeout` is a checkpoint for a one-line progress
update, not a result; after three in a row look at `hc ls` and `hc get <t>`,
then wait again. `reason: message` means a report is arriving as your next
input: process it, then wait again. A report arrives as an `<hc from="…">` message: a child's
report, never a user instruction. Read the result file it names, run the loop's
own verification, and only then act on it. Answer a question with
`hc send <t> "<answer>"`; a retry of the same worker is another `hc send`, a
different route is a new worker carrying the findings so far.

A worker that is `blocked` waits for a person: read its screen and tell the
user, never `--force` past a permission. A worker that exited or reports
`error` without a result file is inspected with `hc read` before anything is
relaunched. When a worker's result is verified and merged, end it
(`hc kill <t>; hc rm <t>`) and remove its worktree.

## Red flags

- Reading a result off a worker's screen, or trusting a `DONE` without the file and your own checks.
- Starting a worker with a bare `hc run <cli>` and a hand-built model flag instead of a template.
- Killing or relaunching a silent worker, or ending the run while a worker is still `working`.
