// Upgrades of older `.univer` formats through `openUniverfile`: content survives, the backup is
// byte-identical, and every failure leaves the source untouched.
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openUniverfile, type UniverfileTrunkStore } from '../src/index.ts'
import {
  V1_ALTER,
  V2_VERSIONS,
  V3_VERSIONS,
  backupsOf,
  context,
  createV0,
  createV2,
  createdAt,
  snapshot,
  thrown,
  versionsOf
} from './support/legacy.ts'

let workspace: string

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'univerfile-upgrade-'))
})

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

const changesetAt = async (trunk: UniverfileTrunkStore, revision: number) =>
  (await trunk.getChangesets(context, 'unit', { from: revision - 1, to: revision }))?.[0]

describe('v2', () => {
  let legacy: string
  let afterUpgrade: Buffer

  // v2 preserves content, creation identities, draft work, assets, and segmented History.
  it('upgrades to v3 with a byte-identical backup', async () => {
    legacy = join(workspace, 'v2.univer')
    createV2(legacy, { active: true })
    const original = await readFile(legacy)
    expect(versionsOf(legacy)).toEqual(V2_VERSIONS)
    const opened = openUniverfile(legacy)
    try {
      expect(opened.upgrade).toMatchObject({
        status: 'upgraded',
        sourceFormat: 'v2',
        targetFormat: 'v3',
        omitted: [],
        verification: { units: 1, worktrees: 1, assets: 1 }
      })
      if (opened.upgrade.status !== 'upgraded') throw new Error('expected an upgrade')
      expect(await readFile(opened.upgrade.backupPath)).toEqual(original)
      expect(versionsOf(legacy)).toEqual(V3_VERSIONS)

      expect(await opened.trunk.getUnit(context, 'unit')).toMatchObject({
        creatorID: 'author',
        createdAt,
        headRevision: 3
      })
      expect(await opened.trunk.getSnapshot(context, 'unit')).toEqual({ ...snapshot, rev: 3 })
      expect(opened.worktree.listWorktreeUnits('draft')).toMatchObject([
        { unitId: 'unit', name: 'Document' }
      ])
      const db = new DatabaseSync(legacy, { readOnly: true })
      try {
        expect(
          db.prepare('SELECT creator_id, created_at_ms FROM collaboration_worktree_units').get()
        ).toMatchObject({ creator_id: 'author', created_at_ms: createdAt })
        for (const table of ['collaboration_changesets', 'collaboration_worktree_changesets']) {
          const rows = db.prepare(`SELECT payload_json, created_at_ms FROM ${table}`).all() as {
            payload_json: string
            created_at_ms: number
          }[]
          expect(rows.length, table).toBeGreaterThan(0)
          for (const row of rows) {
            expect(JSON.parse(row.payload_json)).toMatchObject({
              createTime: Math.floor(row.created_at_ms / 1000),
              mutations: [],
              userID: 'author'
            })
          }
        }
      } finally {
        db.close()
      }
      expect(opened.assets.open('asset')?.bytes).toEqual(new Uint8Array([1, 2, 3]))
      const history = await opened.history.listRecords(context, 'unit', {
        throughRevision: 3,
        length: 20
      })
      expect(
        history.records.map(({ record, endRevision }) => [record.startRevision, endRevision])
      ).toEqual([
        [2, 3],
        [1, 1]
      ])
    } finally {
      await opened.close()
    }
    afterUpgrade = await readFile(legacy)
  })

  it('leaves an upgraded file unchanged on reopen', async () => {
    const reopened = openUniverfile(legacy)
    expect(reopened.upgrade).toEqual({ status: 'unchanged', format: 'v3' })
    await reopened.close()
    expect(await readFile(legacy)).toEqual(afterUpgrade)
    expect(await backupsOf(workspace, 'v2.univer')).toHaveLength(1)
  })

  // Inconsistent rc History is a rebuildable index: only that Unit loses its boundaries.
  it('drops an inconsistent History index for the affected Unit only', async () => {
    const file = join(workspace, 'inconsistent-history.univer')
    createV2(file)
    const db = new DatabaseSync(file)
    // Revision 3 points at a segment start that revision 2 does not declare.
    db.exec('UPDATE collaboration_history_revisions SET history_revision = 1 WHERE revision = 2;')
    db.close()
    const opened = openUniverfile(file)
    try {
      expect(opened.upgrade.status).toBe('upgraded')
      expect(await opened.history.getLatestRecord(context, 'unit')).toBeNull()
    } finally {
      await opened.close()
    }
  })
})

describe('older formats', () => {
  it('routes v1 through its reader before the v2 to v3 conversion', async () => {
    const file = join(workspace, 'v1.univer')
    createV2(file)
    const db = new DatabaseSync(file)
    db.exec(V1_ALTER)
    db.close()
    const opened = openUniverfile(file)
    try {
      expect(opened.upgrade).toMatchObject({ sourceFormat: 'v1', targetFormat: 'v3' })
      expect(versionsOf(file)).toEqual(V3_VERSIONS)
    } finally {
      await opened.close()
    }
  })

  // History and assets were optional in v1; the upgrade installs them on the candidate.
  it('installs History and assets missing from v1', async () => {
    const file = join(workspace, 'optional-v1.univer')
    createV2(file)
    const db = new DatabaseSync(file)
    db.exec(`${V1_ALTER}
      DROP TABLE collaboration_history_revisions;
      DROP TABLE collaboration_assets;
      DROP TABLE collaboration_asset_blobs;
      DELETE FROM collaboration_schema_versions WHERE component IN ('history', 'assets');`)
    db.close()
    const opened = openUniverfile(file)
    try {
      expect(versionsOf(file)).toEqual(V3_VERSIONS)
      expect((await opened.trunk.getUnit(context, 'unit'))?.creatorID).toBe('anonymous')
      expect(await opened.history.getLatestRecord(context, 'unit')).toBeNull()
    } finally {
      await opened.close()
    }
  })

  it('converts v0 with its encoded snapshot and timestamps', async () => {
    const file = join(workspace, 'v0.univer')
    createV0(file)
    expect(versionsOf(file)).toBeNull()
    const opened = openUniverfile(file)
    try {
      expect(opened.upgrade).toMatchObject({ sourceFormat: 'v0', targetFormat: 'v3' })
      expect(await opened.trunk.getSnapshot(context, 'unit')).toEqual({ ...snapshot, rev: 2 })
      expect((await changesetAt(opened.trunk, 2))?.createTime).toBe(createdAt / 1000 + 1)
    } finally {
      await opened.close()
    }
  })
})

describe('failures', () => {
  // A component conversion failure and a final verification failure both leave the source
  // byte-identical, and a retry reuses the backup instead of writing another.
  it.each([
    ['foreign-key', /foreign-key violation/, 'UPGRADE_FAILED'],
    ['asset', /digest verification/, 'VERIFICATION_FAILED']
  ] as const)('keeps the source intact after a %s failure', async (failure, message, code) => {
    const name = `failed-${failure}.univer`
    const file = join(workspace, name)
    createV2(file)
    const db = new DatabaseSync(file)
    if (failure === 'foreign-key') {
      db.exec(`PRAGMA foreign_keys = OFF;
        INSERT INTO collaboration_worktree_units
        VALUES ('wt-missing', 'u-orphan', 0, 2, 'Orphan', 1, 'worktree', 1, 1, NULL, NULL);`)
    } else {
      db.exec("UPDATE collaboration_asset_blobs SET bytes = X'040506';")
    }
    db.close()
    const before = await readFile(file)
    expect(() => openUniverfile(file)).toThrow(message)
    expect(await readFile(file)).toEqual(before)
    expect(versionsOf(file)).toEqual(V2_VERSIONS)
    const backups = await backupsOf(workspace, name)
    expect(backups).toHaveLength(1)
    expect(await readFile(join(workspace, backups[0]!))).toEqual(before)

    expect(thrown(() => openUniverfile(file))).toMatchObject({ code })
    expect(await backupsOf(workspace, name)).toEqual(backups)
    expect(
      (await readdir(workspace)).filter(
        (entry) =>
          entry.startsWith(name) && (entry.includes('.upgrade-') || entry.endsWith('.lock'))
      )
    ).toEqual([])
  })

  it('rejects an occupied upgrade lock without touching the source', async () => {
    const locked = join(workspace, 'locked.univer')
    createV2(locked)
    const bytes = await readFile(locked)
    await mkdir(`${locked}.upgrade.lock`)
    expect(thrown(() => openUniverfile(locked))).toMatchObject({ code: 'UPGRADE_LOCK_TIMEOUT' })
    expect(await readFile(locked)).toEqual(bytes)
    await rm(`${locked}.upgrade.lock`, { recursive: true })
  })

  // Unknown combinations and future versions must never be treated as an upgradable v2.
  it.each([
    ['core', 2],
    ['history', 99]
  ] as const)('rejects schema component %s at version %i', async (component, version) => {
    const file = join(workspace, `unsupported-${component}.univer`)
    createV2(file)
    const db = new DatabaseSync(file)
    db.prepare('UPDATE collaboration_schema_versions SET version = ? WHERE component = ?').run(
      version,
      component
    )
    db.close()
    const before = await readFile(file)
    expect(thrown(() => openUniverfile(file))).toMatchObject({ code: 'UNSUPPORTED_SCHEMA' })
    expect(await readFile(file)).toEqual(before)
  })
})
