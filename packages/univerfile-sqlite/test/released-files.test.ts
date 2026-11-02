// Files written by released CLIs upgrade to v3 with their Units and Worktrees intact. See
// fixtures/README.md for how each file was produced.
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { openUniverfile } from '../src/index.ts'
import { V3_VERSIONS, backupsOf, versionsOf } from './support/legacy.ts'

const fixtures = join(import.meta.dirname, 'fixtures')

const RELEASED = [
  { file: 'v0-univer-cli-0.3.8.univer', sourceFormat: 'v0', baseline: true },
  { file: 'v1-univer-cli-0.3.12.univer', sourceFormat: 'v1', baseline: true },
  { file: 'v1-univer-cli-0.4.4.univer', sourceFormat: 'v1', baseline: true },
  { file: 'v2-univer-cli-0.5.0.univer', sourceFormat: 'v2', baseline: false }
] as const

let workspace: string

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'univerfile-released-'))
})

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

it.each(RELEASED)('upgrades $file', async ({ file, sourceFormat, baseline }) => {
  const path = join(workspace, file)
  await copyFile(join(fixtures, file), path)
  const original = await readFile(path)
  const opened = openUniverfile(path)
  try {
    expect(opened.upgrade).toMatchObject({
      status: 'upgraded',
      sourceFormat,
      targetFormat: 'v3',
      omitted: sourceFormat === 'v2' ? [] : ['logical-commit-history'],
      verification: { units: 1, worktrees: baseline ? 3 : 2 }
    })
    if (opened.upgrade.status !== 'upgraded') throw new Error('expected an upgrade')
    expect(await readFile(opened.upgrade.backupPath)).toEqual(original)
    expect(versionsOf(path)).toEqual(V3_VERSIONS)

    expect(opened.trunk.listUnits()).toMatchObject([{ name: 'Scores', headRev: 2 }])
    const worktrees = opened.worktree.listWorktrees()
    expect(worktrees.map(({ name, status }) => `${name}:${status}`)).toEqual([
      ...(baseline ? ['import-baseline:merged'] : []),
      'merged:merged',
      'draft:draft'
    ])
    const draft = worktrees.find(({ name }) => name === 'draft')!
    expect(opened.worktree.listWorktreeUnits(draft.worktreeId).map(({ name }) => name)).toEqual([
      'Scores',
      'Stock'
    ])
  } finally {
    await opened.close()
  }

  const reopened = openUniverfile(path)
  expect(reopened.upgrade).toEqual({ status: 'unchanged', format: 'v3' })
  await reopened.close()
  expect(await backupsOf(workspace, file)).toHaveLength(1)
})
