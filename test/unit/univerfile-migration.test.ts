// Source-level `.univer` migration regressions: legacy files, atomic replacement, failure cleanup,
// concurrent opens, and History readback. The integration tier separately exercises the built
// Gateway. Source is bundled first because the upgrade helper re-executes its own module file in
// a child process, which needs plain JavaScript.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'esbuild'
import Database from 'libsql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { repoPath } from '../support/paths.ts'

const context = { userID: 'author', customData: {} }
const createdAt = 1_790_208_000_000

let api: any
let bundle: string
let bundleDirectory: string
let workspace: string
let schema: string
let snapshot: any

beforeAll(async () => {
  const cache = repoPath('node_modules', '.cache')
  await mkdir(cache, { recursive: true })
  bundleDirectory = await mkdtemp(join(cache, 'univerfile-tests-'))
  workspace = await mkdtemp(join(tmpdir(), 'univerfile-migration-'))
  schema = await readFile(repoPath('test', 'fixtures', 'univerfile-v2.sql'), 'utf8')
  bundle = join(bundleDirectory, 'entry.mjs')
  await build({
    stdin: {
      contents: `export * from './src/gateway-app/univerfile-sqlite/index.ts';
        export { CollabService } from './src/gateway-app/collab-service.ts';
        export * from './src/gateway-app/univerfile-sqlite/stored-json.ts';`,
      resolveDir: repoPath()
    },
    outfile: bundle,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm'
  })
  api = await import(pathToFileURL(bundle).href)
  const seed = new api.CollabService()
  try {
    await seed.createUnit(2, { unitId: 'unit', name: 'Document' })
    snapshot = await seed.runtime.trunkAdapter.getSnapshot(context, 'unit')
    expect(snapshot).toBeTruthy()
  } finally {
    await seed.dispose()
  }
})

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
  await rm(bundleDirectory, { recursive: true, force: true })
})

const backupsOf = async (name: string) =>
  (await readdir(workspace)).filter((entry) => entry.startsWith(`${name}.backup-`))

describe('V2 upgrade', () => {
  let legacy: string
  let afterUpgrade: Buffer

  // V2 preserves content, creation identities, draft work, assets, and segmented history.
  it('upgrades V2 to V3 with a byte-identical backup', async () => {
    legacy = join(workspace, 'v2.univer')
    createLegacy(legacy, { active: true })
    const original = await readFile(legacy)
    expect(api.detectUniverfileSQLiteFormat(legacy)).toBe('v2')
    const opened = api.openUniverfileSQLite(legacy)
    try {
      expect(opened.upgrade).toMatchObject({
        status: 'upgraded',
        sourceFormat: 'v2',
        targetFormat: 'v3',
        omitted: []
      })
      expect(await readFile(opened.upgrade.backupPath)).toEqual(original)
      expect(api.detectUniverfileSQLiteFormat(legacy)).toBe('v3')

      expect(await opened.databaseAdapter.getUnit(context, 'unit')).toMatchObject({
        creatorID: 'author',
        createdAt,
        headRevision: 3
      })
      expect(await opened.databaseAdapter.getSnapshot(context, 'unit')).toEqual({
        ...snapshot,
        rev: 3
      })
      const db = opened.connection.database
      expect(
        db.prepare('SELECT creator_id, created_at_ms FROM collaboration_worktree_units').get()
      ).toMatchObject({ creator_id: 'author', created_at_ms: createdAt })
      for (const table of ['collaboration_changesets', 'collaboration_worktree_changesets']) {
        const rows = db.prepare(`SELECT payload_json, created_at_ms FROM ${table}`).all()
        expect(rows.length, table).toBeGreaterThan(0)
        for (const row of rows) {
          const payload = JSON.parse(row.payload_json)
          expect(payload).toMatchObject({
            createTime: Math.floor(row.created_at_ms / 1000),
            mutations: [],
            userID: 'author'
          })
        }
      }
      expect(opened.assetStore.open('asset').bytes).toEqual(new Uint8Array([1, 2, 3]))
      const history = await opened.historyDatabaseAdapter.listRecords(context, 'unit', {
        throughRevision: 3,
        length: 20
      })
      expect(
        history.records.map(({ record, endRevision }: any) => [record.startRevision, endRevision])
      ).toEqual([
        [2, 3],
        [1, 1]
      ])
    } finally {
      await opened.dispose()
    }
    afterUpgrade = await readFile(legacy)
  })

  it('leaves an already upgraded file unchanged on reopen', async () => {
    const reopened = api.openUniverfileSQLite(legacy)
    expect(reopened.upgrade).toEqual({ status: 'unchanged', format: 'v3' })
    await reopened.dispose()
    expect(await readFile(legacy)).toEqual(afterUpgrade)
  })

  it('serves upgraded History with protocol-second timestamps', async () => {
    const live = new api.CollabService({ dbPath: legacy })
    try {
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
})

// Inconsistent rc History is a rebuildable index: only that Unit loses its boundaries.
it('drops an inconsistent History index for the affected Unit only', async () => {
  const file = join(workspace, 'inconsistent-history.univer')
  createLegacy(file)
  const db = new Database(file)
  // Revision 3 points at a segment start that revision 2 does not declare.
  db.exec('UPDATE collaboration_history_revisions SET history_revision = 1 WHERE revision = 2;')
  db.close()
  const opened = api.openUniverfileSQLite(file)
  try {
    expect(opened.upgrade.status).toBe('upgraded')
    expect(await opened.historyDatabaseAdapter.getLatestRecord(context, 'unit')).toBeNull()
  } finally {
    await opened.dispose()
  }
})

// Both a component conversion failure and final verification failure leave the source
// byte-identical.
it.each([
  ['foreign-key', /foreign-key violation/, 'UPGRADE_FAILED'],
  ['asset', /digest verification/, 'VERIFICATION_FAILED']
] as const)('keeps the source intact after a %s failure', async (failure, message, code) => {
  const name = `failed-${failure}.univer`
  const file = join(workspace, name)
  createLegacy(file)
  const db = new Database(file)
  if (failure === 'foreign-key') {
    db.exec(`PRAGMA foreign_keys = OFF;
      INSERT INTO collaboration_worktree_units
      VALUES ('wt-missing', 'u-orphan', 0, 2, 'Orphan', 1, 'worktree', 1, 1, NULL, NULL);`)
  } else {
    db.exec("UPDATE collaboration_asset_blobs SET bytes = X'040506';")
  }
  db.close()
  const before = await readFile(file)
  expect(() => api.openUniverfileSQLite(file)).toThrow(message)
  expect(await readFile(file)).toEqual(before)
  expect(api.detectUniverfileSQLiteFormat(file)).toBe('v2')
  const backups = await backupsOf(name)
  expect(backups).toHaveLength(1)
  expect(await readFile(join(workspace, backups[0]!))).toEqual(before)

  expect(thrown(() => api.openUniverfileSQLite(file))).toMatchObject({ code })
  expect(await backupsOf(name)).toEqual(backups)
  expect(
    (await readdir(workspace)).filter(
      (entry) => entry.includes('.upgrade-') || entry.endsWith('.upgrade.lock')
    )
  ).toEqual([])
})

it('rejects an occupied upgrade lock without touching the source', async () => {
  const locked = join(workspace, 'locked.univer')
  createLegacy(locked)
  const bytes = await readFile(locked)
  await mkdir(`${locked}.upgrade.lock`)
  expect(thrown(() => api.openUniverfileSQLite(locked, { lockTimeoutMs: 0 }))).toMatchObject({
    code: 'UPGRADE_LOCK_TIMEOUT'
  })
  expect(await readFile(locked)).toEqual(bytes)
  await rm(`${locked}.upgrade.lock`, { recursive: true })
})

describe('older formats', () => {
  const V1_ALTER = `ALTER TABLE collaboration_worktrees ADD COLUMN head_commit INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE collaboration_worktree_commits (worktree_id TEXT, seq INTEGER);
    UPDATE collaboration_schema_versions SET version = 1 WHERE component = 'worktree';`

  it('routes V1 through its legacy reader before the V2 to V3 conversion', async () => {
    const file = join(workspace, 'v1.univer')
    createLegacy(file)
    const db = new Database(file)
    db.exec(V1_ALTER)
    db.close()
    expect(api.detectUniverfileSQLiteFormat(file)).toBe('v1')
    const opened = api.openUniverfileSQLite(file)
    expect(opened.upgrade.targetFormat).toBe('v3')
    await opened.dispose()
  })

  // History and assets were optional in V1; initialize them only on the upgrade candidate.
  it('initializes History and assets missing from V1', async () => {
    const file = join(workspace, 'optional-v1.univer')
    createLegacy(file)
    const db = new Database(file)
    db.exec(`${V1_ALTER}
      DROP TABLE collaboration_history_revisions;
      DROP TABLE collaboration_assets;
      DROP TABLE collaboration_asset_blobs;
      DELETE FROM collaboration_schema_versions WHERE component IN ('history', 'assets');`)
    db.close()
    const opened = api.openUniverfileSQLite(file)
    try {
      expect(api.detectUniverfileSQLiteFormat(file)).toBe('v3')
      expect((await opened.databaseAdapter.getUnit(context, 'unit')).creatorID).toBe('anonymous')
      expect(await opened.historyDatabaseAdapter.getLatestRecord(context, 'unit')).toBeNull()
    } finally {
      await opened.dispose()
    }
  })

  // V0 initializes current adapters directly; its encoded snapshot and timestamps still survive.
  it('converts V0 with its encoded snapshot and timestamps', async () => {
    const file = join(workspace, 'v0.univer')
    const db = new Database(file)
    db.exec(await readFile(repoPath('test', 'fixtures', 'univerfile-v0.sql'), 'utf8'))
    const iso = new Date(createdAt).toISOString()
    db.prepare('INSERT INTO units VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      'unit',
      2,
      'Sheet',
      1,
      2,
      iso,
      iso,
      null
    )
    const legacySnapshot = JSON.stringify({ ...snapshot, rev: 2 }, (_key, value) =>
      value instanceof Uint8Array ? { __u8__: Buffer.from(value).toString('base64') } : value
    )
    db.prepare('INSERT INTO snapshots VALUES (?, ?, ?)').run('unit', 2, legacySnapshot)
    db.prepare('INSERT INTO changesets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'unit',
      2,
      2,
      1,
      'author',
      '',
      'session',
      2,
      '[]',
      null,
      null,
      createdAt + 1000
    )
    db.close()
    expect(api.detectUniverfileSQLiteFormat(file)).toBe('v0')
    const opened = api.openUniverfileSQLite(file)
    try {
      expect(opened.upgrade.targetFormat).toBe('v3')
      expect(await opened.databaseAdapter.getSnapshot(context, 'unit')).toEqual({
        ...snapshot,
        rev: 2
      })
      expect(opened.databaseAdapter.getChangeset('unit', 2).createTime).toBe(createdAt / 1000 + 1)
    } finally {
      await opened.dispose()
    }
  })
})

describe('stored JSON', () => {
  const bufferView = Buffer.from([9, 0, 128, 255, 9]).subarray(1, 4)

  // Buffer#toJSON runs before the replacer sees the value.
  it('keeps Buffer views as bytes', () => {
    const bufferShaped = { type: 'Buffer', data: [0, 128, 255] }
    const stored = api.encodeStoredJson({ bufferView, empty: Buffer.alloc(0), bufferShaped })
    expect(JSON.parse(stored).bufferView).toEqual({ __univerCollaborationBinary: 'AID/' })
    const decoded = api.decodeStoredJson(stored)
    expect(decoded.bufferView).toEqual(new Uint8Array([0, 128, 255]))
    expect(Object.getPrototypeOf(decoded.bufferView)).toBe(Uint8Array.prototype)
    expect(decoded.empty).toEqual(new Uint8Array(0))
    expect(decoded.bufferShaped).toEqual(bufferShaped)
  })

  // The Rust materializer hands Sheet blocks over as Buffers.
  it('reads Buffer Sheet blocks back intact after reopen', async () => {
    const file = join(workspace, 'buffer-blocks.univer')
    const writer = new api.CollabService({ dbPath: file, create: true })
    try {
      await writer.createUnit(2, { unitId: 'sheet', name: 'Sheet' })
      const sheetSnapshot = await writer.runtime.trunkAdapter.getSnapshot(context, 'sheet')
      await writer.runtime.trunkAdapter.saveSnapshot(context, {
        snapshot: sheetSnapshot,
        sheetBlocks: [{ id: 'buffer-block', startRow: 0, endRow: 0, data: bufferView }]
      })
    } finally {
      await writer.dispose()
    }
    const reader = api.openUniverfileSQLite(file)
    try {
      const block = await reader.databaseAdapter.getSheetBlock(context, 'sheet', 'buffer-block')
      expect(block.data).toEqual(new Uint8Array([0, 128, 255]))
      expect(Object.getPrototypeOf(block.data)).toBe(Uint8Array.prototype)
    } finally {
      await reader.dispose()
    }
  })
})

describe('concurrent and out-of-process upgrades', () => {
  // Independent openers share the filesystem lock; only one publishes an upgrade and backup.
  it('publishes one upgrade and one backup for concurrent openers', async () => {
    const file = join(workspace, 'concurrent.univer')
    createLegacy(file)
    const script = `const api = await import(process.argv[1]);
      const opened = api.openUniverfileSQLite(process.argv[2]);
      console.log(opened.upgrade.status);
      await opened.dispose();`
    const run = promisify(execFile)
    const attempts = await Promise.all(
      [0, 1].map(() =>
        run(process.execPath, [
          '--input-type=module',
          '-e',
          script,
          pathToFileURL(bundle).href,
          file
        ])
      )
    )
    expect(attempts.map(({ stdout }) => stdout.trim()).toSorted()).toEqual([
      'unchanged',
      'upgraded'
    ])
    expect(await backupsOf('concurrent.univer')).toHaveLength(1)
    expect(api.detectUniverfileSQLiteFormat(file)).toBe('v3')
  })

  // The helper process exits before the original is replaced, including on platforms where an
  // in-process rename would succeed. A second open must not leave another backup.
  it('upgrades in a helper process once', async () => {
    const file = join(workspace, 'subprocess.univer')
    createLegacy(file)
    const opened = api.openUniverfileSQLite(file, { execution: 'subprocess' })
    try {
      expect(opened.upgrade).toMatchObject({ status: 'upgraded', sourceFormat: 'v2' })
      expect(api.detectUniverfileSQLiteFormat(file)).toBe('v3')
    } finally {
      await opened.dispose()
    }
    const again = api.openUniverfileSQLite(file, { execution: 'subprocess' })
    try {
      expect(again.upgrade.status).toBe('unchanged')
    } finally {
      await again.dispose()
    }
    expect(await backupsOf('subprocess.univer')).toHaveLength(1)
  })
})

// Unknown combinations and future versions must never be treated as an upgradable V2.
it.each([
  ['core', 2],
  ['history', 99]
] as const)('rejects schema component %s at version %i', async (component, version) => {
  const file = join(workspace, `unsupported-${component}.univer`)
  createLegacy(file)
  const db = new Database(file)
  db.prepare('UPDATE collaboration_schema_versions SET version = ? WHERE component = ?').run(
    version,
    component
  )
  db.close()
  const before = await readFile(file)
  expect(thrown(() => api.openUniverfileSQLite(file))).toMatchObject({
    code: 'UNSUPPORTED_SCHEMA'
  })
  expect(await readFile(file)).toEqual(before)
})

// Trunk submits store server time in Unix seconds, and retries keep the first commit time.
it('stores trunk submit time in seconds and keeps it across retries', async () => {
  const file = join(workspace, 'submit.univer')
  const service = new api.CollabService({ dbPath: file, create: true })
  try {
    await service.createUnit(2, { unitId: 'unit', name: 'Document' })
    expect((await service.submit('unit', 2, changeset(2, Date.now()))).success).toBe(true)
    const saved = service.runtime.trunkAdapter.getChangeset('unit', 2)
    expect(saved.createTime).toBeLessThan(1e11)
    expect((await service.submit('unit', 2, changeset(2, 0))).isCsDeduplicate).toBe(true)
    expect(service.runtime.trunkAdapter.getChangeset('unit', 2).createTime).toBe(saved.createTime)
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

function thrown(action: () => unknown): unknown {
  try {
    action()
  } catch (error) {
    return error
  }
  throw new Error('expected the action to throw')
}

function changeset(revision: number, createTime: number) {
  return {
    unitID: 'unit',
    type: 2,
    baseRev: revision - 1,
    revision,
    userID: 'author',
    memberID: '',
    sid: 'session',
    reqId: revision,
    mutations: [],
    createTime
  }
}

function createLegacy(filename: string, options: { active?: boolean } = {}): void {
  const db = new Database(filename)
  try {
    db.exec(schema)
    db.prepare('INSERT INTO collaboration_units VALUES (?, ?, ?, ?, ?, ?)').run(
      'unit',
      2,
      'Document',
      3,
      createdAt,
      null
    )
    for (const revision of [1, 3]) {
      db.prepare('INSERT INTO collaboration_snapshots VALUES (?, ?, ?, ?)').run(
        'unit',
        revision,
        2,
        encodeSnapshot({ ...snapshot, rev: revision })
      )
    }
    for (const revision of [2, 3]) {
      const time = createdAt + revision * 1000
      // Exercise both legacy milliseconds and protocol seconds.
      const payload = changeset(revision, revision === 2 ? time : time / 1000)
      db.prepare('INSERT INTO collaboration_changesets VALUES (?, ?, ?, ?, ?, ?)').run(
        'unit',
        revision,
        revision - 1,
        payload.sid,
        payload.reqId,
        JSON.stringify(payload)
      )
    }
    for (const revision of [1, 2, 3]) {
      db.prepare(
        'INSERT INTO collaboration_history_revisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        'unit',
        2,
        revision,
        'author',
        '[]',
        createdAt + (revision === 1 ? 0 : revision * 1000),
        null,
        0,
        revision === 1 ? 1 : 2,
        0,
        null
      )
    }
    db.prepare('INSERT INTO collaboration_worktrees VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'draft',
      'draft-session',
      options.active ? 'draft' : 'discarded',
      'author',
      'Draft',
      createdAt + 5000,
      null
    )
    db.prepare(
      'INSERT INTO collaboration_worktree_units VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('draft', 'unit', 0, 2, 'Document', createdAt + 5000, 'trunk', 3, 4, null, null)
    const draft = changeset(4, createdAt + 6000)
    db.prepare('INSERT INTO collaboration_worktree_changesets VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'draft',
      'unit',
      4,
      3,
      draft.sid,
      draft.reqId,
      JSON.stringify(draft)
    )
    const bytes = Buffer.from([1, 2, 3])
    const digest = createHash('sha256').update(bytes).digest('hex')
    db.prepare('INSERT INTO collaboration_asset_blobs VALUES (?, ?, ?)').run(
      digest,
      bytes.length,
      bytes
    )
    db.prepare('INSERT INTO collaboration_assets VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      'asset',
      'unit',
      null,
      digest,
      'image.png',
      'image/png',
      bytes.length,
      createdAt
    )
  } finally {
    db.close()
  }
}

function encodeSnapshot(value: any): string {
  return JSON.stringify(value, (_key, item) =>
    item instanceof Uint8Array
      ? { __univerCollaborationBinary: Buffer.from(item).toString('base64') }
      : item
  )
}
