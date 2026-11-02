// File-level maintenance operations: consistent copies, Worktree deletion, snapshot deletion,
// verification, and vacuum. Each keeps the file valid on its own.
import { statSync } from 'node:fs'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { IChangeset, ISheetBlock, ISnapshot } from '@univerjs/protocol'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { copyUniverfile, openUniverfile, type Univerfile } from '../src/index.ts'
import {
  V2_VERSIONS,
  V3_VERSIONS,
  context,
  createV2,
  createdAt,
  thrown,
  versionsOf
} from './support/legacy.ts'

let workspace: string

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'univerfile-maintenance-'))
})

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

describe('copyUniverfile', () => {
  it('copies an older file as it is and leaves the source untouched', async () => {
    const source = join(workspace, 'copy-source.univer')
    createV2(source)
    const before = await readFile(source)
    const target = join(workspace, 'copy-target.univer')
    copyUniverfile(source, target)
    expect(await readFile(source)).toEqual(before)
    expect(versionsOf(target)).toEqual(V2_VERSIONS)

    const opened = openUniverfile(target)
    try {
      expect(opened.upgrade).toMatchObject({ status: 'upgraded', sourceFormat: 'v2' })
      expect(opened.trunk.listUnits()).toMatchObject([{ unitId: 'unit', headRev: 3 }])
    } finally {
      await opened.close()
    }
    expect(versionsOf(source)).toEqual(V2_VERSIONS)
  })

  it('copies a file another handle holds open', async () => {
    const source = join(workspace, 'copy-open.univer')
    const opened = openUniverfile(source, { create: true })
    try {
      await createSheet(opened, 'sheet', [])
      const target = join(workspace, 'copy-open-target.univer')
      copyUniverfile(source, target)
      expect(versionsOf(target)).toEqual(V3_VERSIONS)
    } finally {
      await opened.close()
    }
  })

  it('refuses a missing source or an existing target', async () => {
    const existing = join(workspace, 'copy-existing.univer')
    await writeFile(existing, 'keep')
    expect(thrown(() => copyUniverfile(join(workspace, 'missing.univer'), existing))).toMatchObject(
      { code: 'FILE_NOT_FOUND' }
    )
    const source = join(workspace, 'copy-refused.univer')
    createV2(source)
    expect(thrown(() => copyUniverfile(source, existing))).toMatchObject({ code: 'FILE_EXISTS' })
    expect(await readFile(existing, 'utf8')).toBe('keep')
  })
})

describe('worktree.deleteWorktree', () => {
  it('deletes a Worktree with its Units, changesets, and scoped assets', async () => {
    const path = join(workspace, 'delete-worktree.univer')
    createV2(path, { active: true })
    const opened = openUniverfile(path)
    try {
      const scoped = opened.assets.store({
        unitId: 'unit',
        worktreeId: 'draft',
        originalFilename: 'draft.png',
        mediaType: 'image/png',
        bytes: new Uint8Array([7, 7, 7])
      })
      // The same bytes in trunk keep their shared blob alive.
      opened.assets.store({
        unitId: 'unit',
        originalFilename: 'shared.png',
        mediaType: 'image/png',
        bytes: new Uint8Array([1, 2, 3])
      })
      opened.assets.store({
        unitId: 'unit',
        worktreeId: 'draft',
        originalFilename: 'shared-draft.png',
        mediaType: 'image/png',
        bytes: new Uint8Array([1, 2, 3])
      })

      expect(opened.worktree.deleteWorktree('draft')).toEqual({ status: 'deleted', assets: 2 })
      expect(opened.worktree.listWorktrees()).toEqual([])
      expect(opened.worktree.listWorktreeUnits('draft')).toEqual([])
      expect(opened.assets.open(scoped.assetId)).toBeNull()
      expect(opened.assets.open('asset')?.bytes).toEqual(new Uint8Array([1, 2, 3]))
      expect(opened.verify()).toMatchObject({ worktrees: 0, assets: 2 })
      expect(opened.worktree.deleteWorktree('draft')).toEqual({ status: 'not-found' })
    } finally {
      await opened.close()
    }
    const db = new DatabaseSync(path, { readOnly: true })
    try {
      expect(db.prepare('SELECT COUNT(*) AS n FROM collaboration_asset_blobs').get()).toEqual({
        n: 1
      })
    } finally {
      db.close()
    }
  })

  it('refuses a merging Worktree', async () => {
    const path = join(workspace, 'delete-merging.univer')
    createV2(path, { active: true })
    await openUniverfile(path).close()
    const db = new DatabaseSync(path)
    db.exec("UPDATE collaboration_worktrees SET status = 'merging';")
    db.close()
    const opened = openUniverfile(path)
    try {
      expect(opened.worktree.deleteWorktree('draft')).toEqual({ status: 'merging' })
      expect(opened.worktree.listWorktrees()).toHaveLength(1)
    } finally {
      await opened.close()
    }
  })
})

describe('trunk snapshots', () => {
  it('lists stored snapshot revisions of every Unit', async () => {
    const path = join(workspace, 'list-snapshots.univer')
    createV2(path)
    const opened = openUniverfile(path)
    try {
      expect(opened.trunk.listSnapshotRevisions()).toEqual([{ unitId: 'unit', revisions: [1, 3] }])
    } finally {
      await opened.close()
    }
  })

  // Revisions stay readable through changesets; only the Sheet blocks no kept snapshot uses go.
  it('deletes intermediate snapshots and the Sheet blocks only they used', async () => {
    const path = join(workspace, 'delete-snapshots.univer')
    const opened = openUniverfile(path, { create: true })
    try {
      await createSheet(opened, 'sheet', ['shared', 'first'])
      await saveSheetSnapshot(opened, 'sheet', 2, ['shared', 'second'])
      await saveSheetSnapshot(opened, 'sheet', 3, ['shared', 'third'])
      await saveSheetSnapshot(opened, 'sheet', 4, ['shared', 'fourth'])
      expect(opened.trunk.listSnapshotRevisions()).toEqual([
        { unitId: 'sheet', revisions: [1, 2, 3, 4] }
      ])

      expect(opened.trunk.deleteSnapshots('sheet', [2, 3, 9])).toEqual({
        snapshots: 2,
        sheetBlocks: 2
      })
      expect(opened.trunk.listSnapshotRevisions()).toEqual([{ unitId: 'sheet', revisions: [1, 4] }])
      for (const [blockID, present] of [
        ['shared', true],
        ['first', true],
        ['second', false],
        ['third', false],
        ['fourth', true]
      ] as const) {
        expect(Boolean(await opened.trunk.getSheetBlock(context, 'sheet', blockID)), blockID).toBe(
          present
        )
      }
      // Revision 3 now resolves to the revision-1 snapshot plus its changesets.
      expect((await opened.trunk.getSnapshot(context, 'sheet', { revision: 3 }))?.rev).toBe(1)
      expect(await opened.trunk.getChangesets(context, 'sheet', { from: 1, to: 4 })).toHaveLength(3)
      expect(opened.verify()).toMatchObject({ units: 1 })
    } finally {
      await opened.close()
    }
  })

  it('refuses to delete the earliest snapshot', async () => {
    const path = join(workspace, 'delete-earliest.univer')
    createV2(path)
    const opened = openUniverfile(path)
    try {
      expect(thrown(() => opened.trunk.deleteSnapshots('unit', [1, 3]))).toMatchObject({
        code: 'INVALID_REQUEST'
      })
      expect(opened.trunk.listSnapshotRevisions()).toEqual([{ unitId: 'unit', revisions: [1, 3] }])
    } finally {
      await opened.close()
    }
  })
})

describe('verify and vacuum', () => {
  it('reports a corrupted asset and reclaims space after deletes', async () => {
    const path = join(workspace, 'vacuum.univer')
    await copyFile(join(import.meta.dirname, 'fixtures', 'v2-univer-cli-0.5.0.univer'), path)
    const opened = openUniverfile(path)
    try {
      const worktrees = opened.worktree.listWorktrees()
      for (const { worktreeId } of worktrees) opened.worktree.deleteWorktree(worktreeId)
      const before = statSync(path).size
      opened.vacuum()
      expect(statSync(path).size).toBeLessThan(before)
      expect(opened.verify()).toMatchObject({ units: 1, worktrees: 0 })

      opened.assets.store({
        unitId: (opened.trunk.listUnits()[0] as { unitId: string }).unitId,
        originalFilename: 'a.png',
        mediaType: 'image/png',
        bytes: new Uint8Array([1])
      })
    } finally {
      await opened.close()
    }
    const db = new DatabaseSync(path)
    db.exec("UPDATE collaboration_asset_blobs SET bytes = X'02';")
    db.close()
    const corrupted = openUniverfile(path)
    try {
      expect(thrown(() => corrupted.verify())).toMatchObject({ code: 'VERIFICATION_FAILED' })
    } finally {
      await corrupted.close()
    }
  })
})

async function createSheet(file: Univerfile, unitID: string, blocks: string[]): Promise<void> {
  const result = await file.trunk.createUnit(context, {
    record: { unitID, type: 2, headRevision: 1, creatorID: 'author', createdAt },
    snapshot: sheetSnapshot(unitID, 1, blocks),
    sheetBlocks: blocks.map(sheetBlock)
  })
  expect(result.status).toBe('created')
}

async function saveSheetSnapshot(
  file: Univerfile,
  unitID: string,
  revision: number,
  blocks: string[]
): Promise<void> {
  const changeset = {
    unitID,
    type: 2,
    baseRev: revision - 1,
    revision,
    userID: 'author',
    memberID: '',
    sid: 'session',
    reqId: revision,
    mutations: [],
    createTime: 0
  } as unknown as IChangeset
  const committed = await file.trunk.commitChangeset(
    { ...context, memberID: '', request: { changeset } },
    { changeset }
  )
  expect(committed.status).toBe('committed')
  await file.trunk.saveSnapshot(context, {
    snapshot: sheetSnapshot(unitID, revision, blocks),
    sheetBlocks: blocks.map(sheetBlock)
  })
}

// Stores read Sheet block references from `workbook.blockMeta`; the rest of the snapshot is opaque.
function sheetSnapshot(unitID: string, rev: number, blocks: string[]): ISnapshot {
  return {
    unitID,
    type: 2,
    rev,
    workbook: { unitID, rev, blockMeta: { sheet1: { sheetID: 'sheet1', blocks } } }
  } as unknown as ISnapshot
}

function sheetBlock(id: string): ISheetBlock {
  return { id, startRow: 0, endRow: 0, data: new Uint8Array([1]) }
}
