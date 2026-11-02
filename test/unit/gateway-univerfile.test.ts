// The Gateway's collaboration service over `.univer` files: an upgraded file serves History and
// Worktree submits, and submits record protocol-second times. File format and upgrade behaviour
// are covered by the @univer/univerfile-sqlite package tests.
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { afterAll, beforeAll, expect, it } from 'vitest'
import {
  changeset,
  context,
  createV2,
  createdAt
} from '../../packages/univerfile-sqlite/test/support/legacy.ts'
import { openUniverfile } from '../../packages/univerfile-sqlite/src/index.ts'
import { repoPath } from '../support/paths.ts'

let api: any
let bundleDirectory: string
let workspace: string
// A Document snapshot created by the Univer runtime, which the SDK can load after the upgrade.
let snapshot: object

beforeAll(async () => {
  const cache = repoPath('node_modules', '.cache')
  await mkdir(cache, { recursive: true })
  bundleDirectory = await mkdtemp(join(cache, 'gateway-univerfile-'))
  workspace = await mkdtemp(join(tmpdir(), 'gateway-univerfile-'))
  const bundle = join(bundleDirectory, 'entry.mjs')
  await build({
    stdin: {
      contents: `export { CollabService } from './src/gateway-app/collab-service.ts';`,
      resolveDir: repoPath()
    },
    outfile: bundle,
    bundle: true,
    packages: 'external',
    alias: {
      '@univer/univerfile-sqlite': repoPath('packages', 'univerfile-sqlite', 'src', 'index.ts')
    },
    platform: 'node',
    format: 'esm'
  })
  api = await import(pathToFileURL(bundle).href)
  const seed = new api.CollabService()
  try {
    await seed.createUnit(2, { unitId: 'unit', name: 'Document' })
    snapshot = await seed.runtime.trunkAdapter.getSnapshot(context, 'unit')
  } finally {
    await seed.dispose()
  }
})

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
  await rm(bundleDirectory, { recursive: true, force: true })
})

const changesetAt = async (trunk: any, revision: number) =>
  (await trunk.getChangesets(context, 'unit', { from: revision - 1, to: revision }))[0]

it('serves upgraded History and Worktree submits with protocol-second timestamps', async () => {
  const file = join(workspace, 'v2.univer')
  createV2(file, { active: true, snapshot })
  const live = new api.CollabService({ dbPath: file })
  try {
    expect(live.runtime.upgrade).toMatchObject({ status: 'upgraded', sourceFormat: 'v2' })
    const history = await live.runtime.historyService.getHistoryList(
      { unitID: 'unit', length: 20 },
      context
    )
    for (const record of Object.values(history.entities.datas) as Array<{
      startRevCreateTime: number
      endRevCreateTime: number
    }>) {
      expect(record.startRevCreateTime).toBeGreaterThanOrEqual(createdAt)
      expect(record.endRevCreateTime).toBeLessThan(createdAt + 100_000)
    }
    const draft = await live.submitWorktreeMutations('draft', 'unit', [])
    expect(draft.revision).toBe(5)
    expect(draft.createTime).toBeLessThan(1e11)
  } finally {
    await live.dispose()
  }
})

// Files written by released CLIs (see the package's test/fixtures/README.md) stay usable after the
// upgrade: the current SDK materializes their Units, and their draft Worktree accepts submits.
it.each([
  'v0-univer-cli-0.3.8.univer',
  'v1-univer-cli-0.3.12.univer',
  'v1-univer-cli-0.4.4.univer',
  'v2-univer-cli-0.5.0.univer'
])('serves %s after upgrading it', async (fixture) => {
  const file = join(workspace, fixture)
  await copyFile(repoPath('packages', 'univerfile-sqlite', 'test', 'fixtures', fixture), file)
  const live = new api.CollabService({ dbPath: file })
  try {
    expect(live.runtime.upgrade.status).toBe('upgraded')
    const [unit] = live.listUnits()
    expect(await live.materializeUnit(unit.unitId, unit.type)).toBeTruthy()
    const draft = live.listWorktrees().find((worktree: any) => worktree.status === 'draft')
    const [draftUnit] = live.worktreeUnits(draft.worktreeId)
    const submitted = await live.submitWorktreeMutations(draft.worktreeId, draftUnit.unitId, [])
    expect(submitted.revision).toBe(4)
    expect(submitted.createTime).toBeLessThan(1e11)
  } finally {
    await live.dispose()
  }
})

// Deleting intermediate trunk snapshots keeps every revision readable: the SDK replays the
// remaining changesets from an earlier snapshot and reaches the same head.
it('materializes the same head after intermediate snapshots are deleted', async () => {
  const file = join(workspace, 'snapshots.univer')
  await copyFile(
    repoPath('packages', 'univerfile-sqlite', 'test', 'fixtures', 'v2-univer-cli-0.5.0.univer'),
    file
  )
  const writer = new api.CollabService({ dbPath: file })
  let head: unknown
  let unit: { unitId: string; type: number }
  try {
    unit = writer.listUnits()[0]
    for (const revision of [3, 4, 5]) {
      const submitted = await writer.submit(unit.unitId, revision, {
        ...changeset(revision, Date.now()),
        unitID: unit.unitId,
        type: unit.type
      })
      expect(submitted.success).toBe(true)
      const materialized = await writer.materializeUnit(unit.unitId, unit.type)
      await writer.runtime.trunkAdapter.saveSnapshot(context, materialized)
    }
    head = withoutBlockIds(await writer.materializeUnit(unit.unitId, unit.type))
  } finally {
    await writer.dispose()
  }

  const opened = openUniverfile(file)
  try {
    expect(opened.trunk.listSnapshotRevisions()).toEqual([
      { unitId: unit.unitId, revisions: [1, 3, 4, 5] }
    ])
    expect(opened.trunk.deleteSnapshots(unit.unitId, [3, 4]).snapshots).toBe(2)
  } finally {
    await opened.close()
  }

  const reader = new api.CollabService({ dbPath: file })
  try {
    expect(withoutBlockIds(await reader.materializeUnit(unit.unitId, unit.type))).toEqual(head)
    const history = await reader.runtime.historyService.getHistoryList(
      { unitID: unit.unitId, length: 20 },
      context
    )
    expect(Object.keys(history.entities.datas).length).toBeGreaterThan(0)
  } finally {
    await reader.dispose()
  }
})

// Trunk submits store server time in Unix seconds, and retries keep the first commit time.
it('stores trunk submit time in seconds and keeps it across retries', async () => {
  const file = join(workspace, 'submit.univer')
  const service = new api.CollabService({ dbPath: file, create: true })
  try {
    await service.createUnit(2, { unitId: 'unit', name: 'Document' })
    expect((await service.submit('unit', 2, changeset(2, Date.now()))).success).toBe(true)
    const saved = await changesetAt(service.runtime.trunkAdapter, 2)
    expect(saved.createTime).toBeLessThan(1e11)
    expect((await service.submit('unit', 2, changeset(2, 0))).isCsDeduplicate).toBe(true)
    expect((await changesetAt(service.runtime.trunkAdapter, 2)).createTime).toBe(saved.createTime)
  } finally {
    await service.dispose()
  }
  const reopened = new api.CollabService({ dbPath: file })
  try {
    const history = await reopened.runtime.historyService.getHistoryList(
      { unitID: 'unit', length: 20 },
      context
    )
    expect(Object.values(history.entities.datas)).toEqual(
      expect.arrayContaining([expect.objectContaining({ endRevision: 2 })])
    )
  } finally {
    await reopened.dispose()
  }
})

/** Each materialization names its Sheet blocks afresh; compare the content, not the ids. */
function withoutBlockIds(materialized: any): unknown {
  const ids = new Map<string, string>()
  const rename = (id: string) => {
    if (!ids.has(id)) ids.set(id, `block-${ids.size}`)
    return ids.get(id)
  }
  const blockMeta = materialized.snapshot.workbook?.blockMeta ?? {}
  return {
    sheetBlocks: materialized.sheetBlocks.map((block: any) => ({ ...block, id: rename(block.id) })),
    snapshot: {
      ...materialized.snapshot,
      workbook: materialized.snapshot.workbook && {
        ...materialized.snapshot.workbook,
        blockMeta: Object.fromEntries(
          Object.entries(blockMeta).map(([sheetId, meta]: [string, any]) => [
            sheetId,
            { ...meta, blocks: meta.blocks.map(rename) }
          ])
        )
      }
    }
  }
}
