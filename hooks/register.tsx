// weed-harness mod: the /board pane and the destructive-command guard.
//
// /board  — a pane beside the transcript that reads the running loop's
//           <slug>.data.json (loop-report's common contract) and redraws it
//           while the loop runs. The Artifact page stays the shareable report;
//           this is the in-terminal live view.
// guard   — a tool.call hook on Bash that refuses the few commands no loop
//           should run unasked (force push, reset --hard, clean -f, rm -rf on
//           a root-ish target). `HARNESS_GUARD=off <command>` lets one through
//           after the user has said yes in the transcript.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BoardState, LoopData } from '../types'

const PANE = 'board'
const POLL_MS = 3000
const DATA_FILE = /\.data\.json$/
const DATA_DIRS = ['.autocode/report', 'docs/agents/matt-auto-log']

const board = atom({ plugin: 'weed-harness', key: 'board' } as const, {
  path: null,
  data: null,
  error: null,
  readAt: null,
} as BoardState)

// --- guard -----------------------------------------------------------------

const OVERRIDE = /^\s*HARNESS_GUARD=off\s+/
// Each rule: a test on the whole command and the reason given to the model.
const RULES: Array<[RegExp, string]> = [
  [/\bgit\s+push\b(?![^|;&]*--force-with-lease)[^|;&]*(\s--force\b|\s-f\b|\s--force-if-includes\b)/, 'git push --force rewrites the remote branch'],
  [/\bgit\s+reset\s+[^|;&]*--hard\b/, 'git reset --hard discards uncommitted work'],
  [/\bgit\s+clean\s+[^|;&]*-[a-zA-Z]*[fX]/, 'git clean -f deletes untracked files'],
  [/\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/, 'discards every uncommitted change in the tree'],
  [/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|-r\s+-f|-f\s+-r)[a-zA-Z]*\s+(--\s+)?("|')?(\/|~|\$HOME|\*|\.\.?)(\s|\/?("|')?$|\/\*)/, 'rm -rf on a root-level target'],
]

export function judge(command: string): string | null {
  if (OVERRIDE.test(command)) return null
  for (const [re, why] of RULES) {
    if (re.test(command)) return why
  }
  return null
}

// --- board -----------------------------------------------------------------

function parse(text: string): LoopData {
  const d = JSON.parse(text)
  if (!d || typeof d !== 'object') throw new Error('not an object')
  return d as LoopData
}

async function refresh($: EngineInterface, path: string) {
  const now = await $.clock.now()
  try {
    const data = parse(await $.fs.read(path))
    await update($, board, s => ({ ...s, path, data, error: null, readAt: now }))
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await update($, board, s => ({ ...s, path, error, readAt: now }))
  }
}

async function discover($: EngineInterface): Promise<string | null> {
  let best: { path: string; mtimeMs: number } | null = null
  for (const dir of DATA_DIRS) {
    if (!(await $.fs.exists(dir))) continue
    for (const entry of await $.fs.list(dir)) {
      if (entry.kind !== 'file' || !DATA_FILE.test(entry.name)) continue
      const path = `${dir}/${entry.name}`
      const { mtimeMs } = await $.fs.stat(path)
      if (!best || mtimeMs > best.mtimeMs) best = { path, mtimeMs }
    }
  }
  return best?.path ?? null
}

function ago(iso: string | undefined, now: number): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const min = Math.max(0, Math.round((now - t) / 60000))
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const h = Math.floor(min / 60)
  return `${h}시간 ${min % 60}분 전`
}

function elapsed(iso: string | undefined, now: number): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const min = Math.max(0, Math.round((now - t) / 60000))
  return min < 60 ? `${min}분` : `${Math.floor(min / 60)}시간 ${min % 60}분`
}

// The poll timer: one at a time, dropped with the module on reload.
let timer: { cancel: () => void } | null = null

function stopPolling() {
  timer?.cancel()
  timer = null
}

function startPolling($: EngineInterface, path: string) {
  stopPolling()
  timer = $.clock.every(POLL_MS, () => {
    void refresh($, path)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'board',
      description: 'Show the running loop (matt-auto, autocode) in a pane; /board <path> picks the data file',
    })
    return next(e)
  })

  on('command.run', { command: 'board' }, async ($, e) => {
    const path = e.args?.trim() || (await read($, board)).path || (await discover($))
    if (!path) {
      return { text: `/board: no loop data found under ${DATA_DIRS.join(', ')} — pass the path: /board <dir>/<slug>.data.json` }
    }
    await refresh($, path)
    startPolling($, path)
    const opened = await $.ui.open({ id: PANE, title: 'Loop board', focus: true })
    return { text: opened.isPlaced ? `Board pane opened: ${path}` : `Board pane is open but this surface does not draw panes (${path})` }
  })

  // A loop that writes its data file makes the pane follow it.
  on('tool.call', { tool: ['Write', 'Edit'] }, async ($, e, next) => {
    const ran = await next(e)
    const file = String((e as { file_path?: string }).file_path ?? '')
    if (DATA_FILE.test(file) && DATA_DIRS.some(dir => file.includes(`/${dir}/`))) {
      await refresh($, file)
      startPolling($, file)
      const isUp = (await $.ui.panes()).some(pane => pane.id === PANE)
      if (!isUp) void $.ui.open({ id: PANE, title: 'Loop board' })
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.close', { id: PANE }, ($, e, next) => {
    stopPolling()
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, board)
    const now = await $.clock.now()

    if (!s.path) return <Text dimColor>/board 로 데이터 파일을 고르세요.</Text>
    if (!s.data) return <Text color="red">{s.path}: {s.error ?? 'reading…'}</Text>

    const d = s.data
    const p = d.progress
    const stateColor = p?.state === 'done' ? 'green' : p?.state === 'blocked' ? 'red' : 'yellow'
    const blockers = p?.blockers ?? []
    const files = d.outcome?.files ?? []
    const added = files.reduce((n, f) => n + (f.added ?? 0), 0)
    const removed = files.reduce((n, f) => n + (f.removed ?? 0), 0)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>{d.title ?? d.slug ?? s.path}</Text>
          <Text>
            <Text color={stateColor} bold>{p?.state ?? '—'}</Text>
            {p?.startedAt && <Text dimColor>  경과 {elapsed(p.startedAt, now)}</Text>}
            {p?.updated && <Text dimColor>  갱신 {ago(p.updated, now)}</Text>}
            {d.gates && <Text dimColor>  gates {d.gates.met}/{d.gates.total}</Text>}
          </Text>
        </Box>
        {p?.current && <Text>▶ {p.current}</Text>}
        {p?.note && <Text dimColor>{p.note}</Text>}
        {blockers.length > 0 && (
          <Box flexDirection="column">
            <Text color="red" bold>막힘 {blockers.length}</Text>
            {blockers.map(b => (
              <Text key={b.title}>
                <Text color="red">{b.title}</Text> {b.reason}
                {b.detail && <Text dimColor> — {b.detail}</Text>}
              </Text>
            ))}
          </Box>
        )}
        {d.outcome && (
          <Box flexDirection="column">
            <Text bold>결과 {d.outcome.branch ?? ''}</Text>
            <Text dimColor>{files.length} files  +{added} −{removed}</Text>
            {d.outcome.note && <Text dimColor>{d.outcome.note}</Text>}
          </Box>
        )}
        {s.error && <Text color="red">read failed: {s.error}</Text>}
        <Text dimColor>{s.path}</Text>
      </Box>
    )
  })

  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    const why = judge(e.command)
    if (why === null) return next(e)
    $.ui.toast(`guard: ${why}`)
    return {
      deny: `${$.plugin.name} guard: ${why}. Ask the user first (AskUserQuestion); when they confirm, rerun it as \`HARNESS_GUARD=off ${e.command.trim()}\`.`,
    }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${$.plugin.name}: its guard failed.` }))
}
