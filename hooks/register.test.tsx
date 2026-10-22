import { expect, mock, test } from 'claude-code/testing'

import { judge } from './register'

const DATA = {
  title: '테스트 루프',
  slug: 'test-loop',
  progress: {
    state: 'blocked',
    startedAt: '2026-10-22T09:00:00+09:00',
    updated: '2026-10-22T09:30:00+09:00',
    current: 'H003 측정 중',
    blockers: [{ title: 'H004', reason: '측정 실패', detail: 'bench.py exit 2' }],
  },
  gates: { met: 3, total: 5 },
}

const PANE = {
  plugin: 'weed-harness',
  component: 'Pane',
  requestId: 'board',
  props: {
    title: 'Loop board',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('the guard judges destructive commands', async () => {
  expect(judge('git push --force origin main')).not.toBe(null)
  expect(judge('git push -f')).not.toBe(null)
  expect(judge('git push --force-with-lease origin main')).toBe(null)
  expect(judge('git push origin v1.2.3')).toBe(null)
  expect(judge('git reset --hard HEAD~1')).not.toBe(null)
  expect(judge('git reset --soft HEAD~1')).toBe(null)
  expect(judge('git clean -fd')).not.toBe(null)
  expect(judge('git checkout -- .')).not.toBe(null)
  expect(judge('git checkout -- src/a.ts')).toBe(null)
  expect(judge('rm -rf /')).not.toBe(null)
  expect(judge('rm -rf ~/')).not.toBe(null)
  expect(judge('rm -rf *')).not.toBe(null)
  expect(judge('rm -rf node_modules')).toBe(null)
  expect(judge('rm -rf /tmp/claude-1000/x/scratch')).toBe(null)
  expect(judge('HARNESS_GUARD=off git push --force origin main')).toBe(null)
})

test('a denied Bash call never reaches the engine', async ($, on) => {
  let ran = 0
  on('tool.call', () => {
    ran += 1
    return { result: {} }
  })

  const denied = await $.tool.call({ tool: 'Bash', command: 'git reset --hard' })
  expect(typeof denied.deny).toBe('string')
  expect(ran).toBe(0)

  const allowed = await $.tool.call({ tool: 'Bash', command: 'git status' })
  expect(allowed.deny).toBe(undefined)
  expect(ran).toBe(1)
})

test('/board reads the data file and the pane draws it', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-22T10:00:00+09:00') })
  on('command.register', () => ({ value: { command: 'board' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.read', () => ({ value: JSON.stringify(DATA) }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const answer = await $.command.run({ command: 'board', args: '.autocode/report/autocode.data.json' })
  expect(answer.text).toBe('Board pane opened: .autocode/report/autocode.data.json')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /테스트 루프/ }))?.text).toBe('테스트 루프')
    expect((await ui.find({ type: 'Text', text: /H003/ }))?.text).toBe('▶ H003 측정 중')
    expect(await ui.find({ type: 'Text', text: /bench\.py exit 2/ })).not.toBe(undefined)
    expect(await ui.find({ type: 'Text', text: /gates 3\/5/ })).not.toBe(undefined)
    expect(await ui.find({ type: 'Text', text: /경과 1시간 0분/ })).not.toBe(undefined)
    expect(await ui.find({ type: 'Text', text: /갱신 30분 전/ })).not.toBe(undefined)
    await ui.unmount()
  }
})
