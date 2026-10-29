import { describe, expect, it } from 'vitest'
import {
  basename,
  opensFloatingWindow,
  outcomeOfTurnFile,
  resolveTurnFiles,
  type UniverTurnFile,
  type UniverTurnOperation
} from '../../../src/client/conversation/univer-turn-definition.ts'

let sequence = 0
const op = (
  name: UniverTurnOperation['name'],
  fields: Partial<Omit<UniverTurnOperation, 'name'>> = {}
): UniverTurnOperation => ({
  callId: `call-${++sequence}`,
  name,
  action: null,
  file: '/work/demo.univer',
  worktreeId: null,
  unitId: null,
  phase: 'succeeded',
  ...fields
})
const fileOf = (file: string, operations: UniverTurnOperation[]): UniverTurnFile => ({
  file,
  operations
})

describe('resolveTurnFiles', () => {
  it('resolves a relative call path against the session cwd and merges its absolute result', () => {
    const resolved = resolveTurnFiles(
      [
        fileOf('notes/demo.univer', [op('status')]),
        fileOf('/work/notes/demo.univer', [op('execute', { worktreeId: 'wt-1' })])
      ],
      '/work/'
    )
    expect(resolved).toHaveLength(1)
    expect(resolved[0]!.file).toBe('/work/notes/demo.univer')
    expect(resolved[0]!.operations.map((operation) => operation.name)).toEqual([
      'status',
      'execute'
    ])
    expect(
      resolved[0]!.operations.every((operation) => operation.file === '/work/notes/demo.univer')
    ).toBe(true)
  })

  it('strips a leading ./ from a relative path', () => {
    expect(resolveTurnFiles([fileOf('./a.univer', [])], '/work')[0]!.file).toBe('/work/a.univer')
  })

  it('treats a Windows cwd as Windows paths with native separators', () => {
    const resolved = resolveTurnFiles(
      [fileOf('学生成绩表.univer', []), fileOf('C:/Users/me/DSH/学生成绩表.univer', [])],
      'C:\\Users\\me\\DSH'
    )
    expect(resolved.map((entry) => entry.file)).toEqual(['C:\\Users\\me\\DSH\\学生成绩表.univer'])
  })

  it('keeps distinct files in first-seen order', () => {
    const resolved = resolveTurnFiles([fileOf('/b.univer', []), fileOf('/a.univer', [])])
    expect(resolved.map((entry) => entry.file)).toEqual(['/b.univer', '/a.univer'])
  })
})

describe('outcomeOfTurnFile', () => {
  it('reports an untouched file as unchanged', () => {
    expect(outcomeOfTurnFile(fileOf('/a.univer', [op('status')]))).toEqual({
      primaryWorktreeId: null,
      lifecycle: 'unchanged',
      preferredUnitId: null,
      changedContent: false
    })
  })

  it('treats new as a trunk change', () => {
    expect(outcomeOfTurnFile(fileOf('/a.univer', [op('new')]))).toMatchObject({
      lifecycle: 'trunk',
      changedContent: true
    })
  })

  it('moves a write into draft on its worktree', () => {
    expect(
      outcomeOfTurnFile(fileOf('/a.univer', [op('execute', { worktreeId: 'wt-1', unitId: 'u-1' })]))
    ).toEqual({
      primaryWorktreeId: 'wt-1',
      lifecycle: 'draft',
      preferredUnitId: 'u-1',
      changedContent: true
    })
  })

  it.each([
    ['create', 'draft'],
    ['reopen', 'draft'],
    ['ready', 'ready'],
    ['merge', 'merged'],
    ['discard', 'discarded']
  ] as const)('maps worktree %s to %s', (action, lifecycle) => {
    expect(
      outcomeOfTurnFile(fileOf('/a.univer', [op('worktree', { action, worktreeId: 'wt-1' })]))
    ).toMatchObject({ primaryWorktreeId: 'wt-1', lifecycle })
  })

  it('does not let later reads or writes erase a ready transition', () => {
    const outcome = outcomeOfTurnFile(
      fileOf('/a.univer', [
        op('worktree', { action: 'ready', worktreeId: 'wt-1' }),
        op('inspect', { worktreeId: 'wt-1', unitId: 'u-2' }),
        op('status'),
        op('execute', { worktreeId: 'wt-2' })
      ])
    )
    expect(outcome).toMatchObject({
      primaryWorktreeId: 'wt-1',
      lifecycle: 'ready',
      preferredUnitId: 'u-2'
    })
  })

  it('ignores operations that did not succeed', () => {
    expect(
      outcomeOfTurnFile(
        fileOf('/a.univer', [
          op('execute', { worktreeId: 'wt-1', phase: 'failed' }),
          op('worktree', { action: 'merge', worktreeId: 'wt-1', phase: 'pending' })
        ])
      )
    ).toMatchObject({ lifecycle: 'unchanged', changedContent: false })
  })

  it('adopts the first worktree a read names when nothing changed', () => {
    expect(
      outcomeOfTurnFile(fileOf('/a.univer', [op('inspect', { worktreeId: 'wt-1' })]))
    ).toMatchObject({ primaryWorktreeId: 'wt-1', lifecycle: 'unchanged' })
  })
})

describe('opensFloatingWindow', () => {
  it.each([
    [op('new'), true],
    [op('worktree', { action: 'create' }), true],
    [op('worktree', { action: 'reopen' }), true],
    [op('worktree', { action: 'ready' }), true],
    [op('worktree', { action: 'merge' }), false],
    [op('execute'), true],
    [op('import'), true],
    [op('unit'), true],
    [op('compile-svg'), true],
    [op('status'), false],
    [op('inspect'), false],
    [op('screenshot'), false]
  ])('%o opens a window: %s', (operation, opens) => {
    expect(opensFloatingWindow(operation)).toBe(opens)
  })
})

describe('basename', () => {
  it.each([
    ['/work/notes/demo.univer', 'demo.univer'],
    ['C:\\Users\\me\\学生成绩表.univer', '学生成绩表.univer'],
    ['demo.univer', 'demo.univer']
  ])('%s → %s', (file, name) => {
    expect(basename(file)).toBe(name)
  })
})
