// weed-harness mod state: what the /board pane keeps in $.state.
// Mirrors the common keys of loop-report's data contract (SKILL.md);
// everything the view owns stays out of this type.

export type LoopBlocker = { title: string; reason: string; detail?: string }

export type LoopProgress = {
  state: 'running' | 'blocked' | 'done'
  updated?: string
  startedAt?: string
  current?: string
  note?: string
  blockers?: LoopBlocker[]
}

export type LoopOutcomeFile = {
  path: string
  status: string
  kind?: string
  added?: number
  removed?: number
  note?: string
}

export type LoopOutcome = {
  baseRef?: string
  headRef?: string
  branch?: string
  note?: string
  files?: LoopOutcomeFile[]
}

export type LoopData = {
  title?: string
  slug?: string
  summary?: string
  progress?: LoopProgress
  outcome?: LoopOutcome
  gates?: { met: number; total: number }
}

export type BoardState = {
  /** The data file the pane reads, as the loop wrote it (absolute or cwd-relative). */
  path: string | null
  /** The parsed data of the last successful read. */
  data: LoopData | null
  /** Why the last read failed, when it did. */
  error: string | null
  /** When the file was last read, ms since the epoch. */
  readAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'weed-harness': { board: BoardState }
  }
}
