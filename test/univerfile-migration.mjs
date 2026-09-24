import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import Database from 'libsql'

// Source-level migration regression tests; integration-smoke separately exercises built applications.
const cache = resolve('node_modules/.cache')
await mkdir(cache, { recursive: true })
const bundleDirectory = await mkdtemp(join(cache, 'univerfile-tests-'))
const workspace = await mkdtemp(join(tmpdir(), 'univerfile-migration-'))
const context = { userID: 'author', customData: {} }
const createdAt = 1_790_208_000_000
const schema = await readFile(new URL('./fixtures/univerfile-v2.sql', import.meta.url), 'utf8')

try {
  const outfile = join(bundleDirectory, 'entry.mjs')
  await build({
    stdin: {
      contents: `export * from './src/gateway-app/univerfile-sqlite/index.ts';
        export { CollabService } from './src/gateway-app/collab-service.ts';
        export { optimizeUniverfilePath } from './src/gateway-app/optimization/univerfile-optimizer.ts';`,
      resolveDir: resolve('.')
    },
    outfile,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm'
  })
  const api = await import(pathToFileURL(outfile).href)
  const seed = new api.CollabService()
  let snapshot
  try {
    await seed.createUnit(2, { unitId: 'unit', name: 'Document' })
    snapshot = await seed.runtime.trunkAdapter.getSnapshot(context, 'unit')
    assert.ok(snapshot)
  } finally {
    await seed.dispose()
  }

  // V2 preserves content, creation identities, draft work, assets, and segmented history.
  const legacy = join(workspace, 'v2.univer')
  createLegacy(legacy, snapshot, { active: true })
  const original = await readFile(legacy)
  assert.equal(api.detectUniverfileSQLiteFormat(legacy), 'v2')
  const opened = api.openUniverfileSQLite(legacy)
  const upgrade = opened.upgrade
  try {
    assert.equal(upgrade.status, 'upgraded')
    assert.equal(upgrade.sourceFormat, 'v2')
    assert.equal(upgrade.targetFormat, 'v3')
    assert.deepEqual(upgrade.omitted, [])
    assert.deepEqual(await readFile(upgrade.backupPath), original)
    assert.equal(api.detectUniverfileSQLiteFormat(legacy), 'v3')
    const unit = await opened.databaseAdapter.getUnit(context, 'unit')
    assert.equal(unit.creatorID, 'author')
    assert.equal(unit.createdAt, createdAt)
    assert.equal(unit.headRevision, 3)
    assert.deepEqual(await opened.databaseAdapter.getSnapshot(context, 'unit'), {
      ...snapshot,
      rev: 3
    })
    const db = opened.connection.database
    const draft = db
      .prepare('SELECT creator_id, created_at_ms FROM collaboration_worktree_units')
      .get()
    assert.equal(draft.creator_id, 'author')
    assert.equal(draft.created_at_ms, createdAt)
    for (const table of ['collaboration_changesets', 'collaboration_worktree_changesets']) {
      const rows = db.prepare(`SELECT payload_json, created_at_ms FROM ${table}`).all()
      assert.ok(rows.length > 0)
      for (const row of rows) {
        const payload = JSON.parse(row.payload_json)
        assert.equal(payload.createTime, Math.floor(row.created_at_ms / 1000))
        assert.deepEqual(payload.mutations, [])
        assert.equal(payload.userID, 'author')
      }
    }
    assert.deepEqual(opened.assetStore.open('asset').bytes, new Uint8Array([1, 2, 3]))
    const history = await opened.historyDatabaseAdapter.listRecords(context, 'unit', {
      throughRevision: 3,
      length: 20
    })
    assert.deepEqual(
      history.records.map(({ record, endRevision }) => [record.startRevision, endRevision]),
      [
        [2, 3],
        [1, 1]
      ]
    )
  } finally {
    await opened.dispose()
  }
  const afterUpgrade = await readFile(legacy)
  const reopened = api.openUniverfileSQLite(legacy)
  assert.deepEqual(reopened.upgrade, { status: 'unchanged', format: 'v3' })
  await reopened.dispose()
  assert.deepEqual(await readFile(legacy), afterUpgrade)

  const live = new api.CollabService({ dbPath: legacy })
  try {
    const history = await live.runtime.historyService.getHistoryList(
      { unitID: 'unit', length: 20 },
      context
    )
    for (const record of Object.values(history.entities.datas)) {
      assert.ok(record.startRevCreateTime >= createdAt)
      assert.ok(record.endRevCreateTime < createdAt + 100_000)
    }
    const draft = await live.submitWorktreeMutations('draft', 'unit', [])
    assert.equal(draft.revision, 5)
    assert.ok(draft.createTime < 1e11)
  } finally {
    await live.dispose()
  }

  // Inconsistent rc History is a rebuildable index: only that Unit loses its boundaries.
  const inconsistent = join(workspace, 'inconsistent-history.univer')
  createLegacy(inconsistent, snapshot)
  const inconsistentDb = new Database(inconsistent)
  // Revision 3 points at a segment start that revision 2 does not declare.
  inconsistentDb.exec(
    'UPDATE collaboration_history_revisions SET history_revision = 1 WHERE revision = 2;'
  )
  inconsistentDb.close()
  const fromInconsistent = api.openUniverfileSQLite(inconsistent)
  try {
    assert.equal(fromInconsistent.upgrade.status, 'upgraded')
    assert.equal(
      await fromInconsistent.historyDatabaseAdapter.getLatestRecord(context, 'unit'),
      null
    )
  } finally {
    await fromInconsistent.dispose()
  }

  // Both a component conversion failure and final verification failure leave the source byte-identical.
  for (const failure of ['foreign-key', 'asset']) {
    const file = join(workspace, `failed-${failure}.univer`)
    createLegacy(file, snapshot)
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
    assert.throws(
      () => api.openUniverfileSQLite(file),
      failure === 'foreign-key' ? /foreign-key violation/ : /digest verification/
    )
    assert.deepEqual(await readFile(file), before)
    assert.equal(api.detectUniverfileSQLiteFormat(file), 'v2')
    const files = await readdir(workspace)
    const backups = files.filter((name) => name.startsWith(`failed-${failure}.univer.backup-`))
    assert.equal(backups.length, 1)
    assert.deepEqual(await readFile(join(workspace, backups[0])), before)
    assert.throws(() => api.openUniverfileSQLite(file), {
      code: failure === 'foreign-key' ? 'UPGRADE_FAILED' : 'VERIFICATION_FAILED'
    })
    const afterRetry = await readdir(workspace)
    const retried = afterRetry.filter((name) => name.startsWith(`failed-${failure}.univer.backup-`))
    assert.deepEqual(retried, backups)
    assert.ok(
      !afterRetry.some((name) => name.includes('.upgrade-') || name.endsWith('.upgrade.lock'))
    )
  }

  // An occupied upgrade lock rejects without touching source or creating a candidate.
  const locked = join(workspace, 'locked.univer')
  createLegacy(locked, snapshot)
  const lockedBytes = await readFile(locked)
  await mkdir(`${locked}.upgrade.lock`)
  assert.throws(() => api.openUniverfileSQLite(locked, { lockTimeoutMs: 0 }), {
    code: 'UPGRADE_LOCK_TIMEOUT'
  })
  assert.deepEqual(await readFile(locked), lockedBytes)
  await rm(`${locked}.upgrade.lock`, { recursive: true })

  // V1 still travels through its legacy reader before the V2 → V3 conversion.
  const v1 = join(workspace, 'v1.univer')
  createLegacy(v1, snapshot)
  const v1db = new Database(v1)
  v1db.exec(`ALTER TABLE collaboration_worktrees ADD COLUMN head_commit INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE collaboration_worktree_commits (worktree_id TEXT, seq INTEGER);
    UPDATE collaboration_schema_versions SET version = 1 WHERE component = 'worktree';`)
  v1db.close()
  assert.equal(api.detectUniverfileSQLiteFormat(v1), 'v1')
  const fromV1 = api.openUniverfileSQLite(v1)
  assert.equal(fromV1.upgrade.targetFormat, 'v3')
  await fromV1.dispose()

  // History and assets were optional in V1; initialize them only on the upgrade candidate.
  const optional = join(workspace, 'optional-v1.univer')
  createLegacy(optional, snapshot)
  const optionalDb = new Database(optional)
  optionalDb.exec(`ALTER TABLE collaboration_worktrees ADD COLUMN head_commit INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE collaboration_worktree_commits (worktree_id TEXT, seq INTEGER);
    UPDATE collaboration_schema_versions SET version = 1 WHERE component = 'worktree';
    DROP TABLE collaboration_history_revisions;
    DROP TABLE collaboration_assets;
    DROP TABLE collaboration_asset_blobs;
    DELETE FROM collaboration_schema_versions WHERE component IN ('history', 'assets');`)
  optionalDb.close()
  const fromOptional = api.openUniverfileSQLite(optional)
  try {
    assert.equal(api.detectUniverfileSQLiteFormat(optional), 'v3')
    assert.equal(
      (await fromOptional.databaseAdapter.getUnit(context, 'unit')).creatorID,
      'anonymous'
    )
    assert.equal(await fromOptional.historyDatabaseAdapter.getLatestRecord(context, 'unit'), null)
  } finally {
    await fromOptional.dispose()
  }

  // V0 initializes current adapters directly; its encoded snapshot and timestamps still survive.
  const v0 = join(workspace, 'v0.univer')
  const v0schema = await readFile(new URL('./fixtures/univerfile-v0.sql', import.meta.url), 'utf8')
  const v0db = new Database(v0)
  v0db.exec(v0schema)
  const iso = new Date(createdAt).toISOString()
  v0db
    .prepare('INSERT INTO units VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('unit', 2, 'Sheet', 1, 2, iso, iso, null)
  const legacySnapshot = JSON.stringify({ ...snapshot, rev: 2 }, (_key, value) =>
    value instanceof Uint8Array ? { __u8__: Buffer.from(value).toString('base64') } : value
  )
  v0db.prepare('INSERT INTO snapshots VALUES (?, ?, ?)').run('unit', 2, legacySnapshot)
  v0db
    .prepare('INSERT INTO changesets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('unit', 2, 2, 1, 'author', '', 'session', 2, '[]', null, null, createdAt + 1000)
  v0db.close()
  assert.equal(api.detectUniverfileSQLiteFormat(v0), 'v0')
  const fromV0 = api.openUniverfileSQLite(v0)
  try {
    assert.equal(fromV0.upgrade.targetFormat, 'v3')
    assert.deepEqual(await fromV0.databaseAdapter.getSnapshot(context, 'unit'), {
      ...snapshot,
      rev: 2
    })
    assert.equal(fromV0.databaseAdapter.getChangeset('unit', 2).createTime, createdAt / 1000 + 1)
  } finally {
    await fromV0.dispose()
  }

  // Independent openers share the filesystem lock; only one publishes an upgrade and backup.
  const concurrent = join(workspace, 'concurrent.univer')
  createLegacy(concurrent, snapshot)
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
        pathToFileURL(outfile).href,
        concurrent
      ])
    )
  )
  assert.deepEqual(attempts.map(({ stdout }) => stdout.trim()).sort(), ['unchanged', 'upgraded'])
  assert.equal(
    (await readdir(workspace)).filter((name) => name.startsWith('concurrent.univer.backup-'))
      .length,
    1
  )
  assert.equal(api.detectUniverfileSQLiteFormat(concurrent), 'v3')

  // The helper process exits before the original is replaced, including on platforms where an
  // in-process rename would succeed. A second open must not leave another backup.
  const subprocessFile = join(workspace, 'subprocess.univer')
  createLegacy(subprocessFile, snapshot)
  const subprocessOpened = api.openUniverfileSQLite(subprocessFile, { execution: 'subprocess' })
  try {
    assert.equal(subprocessOpened.upgrade.status, 'upgraded')
    assert.equal(subprocessOpened.upgrade.sourceFormat, 'v2')
    assert.equal(api.detectUniverfileSQLiteFormat(subprocessFile), 'v3')
  } finally {
    await subprocessOpened.dispose()
  }
  const subprocessAgain = api.openUniverfileSQLite(subprocessFile, { execution: 'subprocess' })
  try {
    assert.equal(subprocessAgain.upgrade.status, 'unchanged')
  } finally {
    await subprocessAgain.dispose()
  }
  assert.equal(
    (await readdir(workspace)).filter((name) => name.startsWith('subprocess.univer.backup-'))
      .length,
    1
  )

  // Unknown combinations and future versions must never be treated as an upgradable V2.
  for (const [component, version] of [
    ['core', 2],
    ['history', 99]
  ]) {
    const file = join(workspace, `unsupported-${component}.univer`)
    createLegacy(file, snapshot)
    const db = new Database(file)
    db.prepare('UPDATE collaboration_schema_versions SET version = ? WHERE component = ?').run(
      version,
      component
    )
    db.close()
    const before = await readFile(file)
    assert.throws(() => api.openUniverfileSQLite(file), { code: 'UNSUPPORTED_SCHEMA' })
    assert.deepEqual(await readFile(file), before)
  }

  // Optimization must upgrade a copy even when the source is V2; reset cannot retain old boundaries.
  const activeBytes = await readFile(legacy)
  await assert.rejects(
    api.optimizeUniverfilePath({
      sourcePath: legacy,
      outputPath: join(workspace, 'rejected.univer'),
      history: 'reset',
      dryRun: false
    }),
    /requires no active worktrees/
  )
  assert.deepEqual(await readFile(legacy), activeBytes)
  assert.ok(!(await readdir(workspace)).includes('rejected.univer'))
  const source = join(workspace, 'optimize-source.univer')
  const output = join(workspace, 'optimized.univer')
  createLegacy(source, snapshot)
  const sourceBytes = await readFile(source)
  await api.optimizeUniverfilePath({ sourcePath: source, history: 'reset', dryRun: true })
  await api.optimizeUniverfilePath({
    sourcePath: source,
    outputPath: output,
    history: 'reset',
    dryRun: false
  })
  assert.deepEqual(await readFile(source), sourceBytes)
  assert.equal(api.detectUniverfileSQLiteFormat(output), 'v3')
  const optimized = api.openUniverfileSQLite(output)
  assert.equal((await optimized.databaseAdapter.getUnit(context, 'unit')).headRevision, 1)
  assert.equal(await optimized.historyDatabaseAdapter.getLatestRecord(context, 'unit'), null)
  assert.equal(optimized.worktreeDatabaseAdapter.listWorktrees().length, 0)
  await optimized.dispose()
  const resumed = new api.CollabService({ dbPath: output })
  try {
    const submitted = await resumed.submit('unit', 2, changeset(2, Date.now()))
    assert.equal(submitted.success, true)
    const saved = resumed.runtime.trunkAdapter.getChangeset('unit', 2)
    assert.ok(saved.createTime < 1e11)
    const retry = await resumed.submit('unit', 2, changeset(2, 0))
    assert.equal(retry.isCsDeduplicate, true)
    assert.equal(resumed.runtime.trunkAdapter.getChangeset('unit', 2).createTime, saved.createTime)
  } finally {
    await resumed.dispose()
  }
  const afterEdit = new api.CollabService({ dbPath: output })
  try {
    const history = await afterEdit.runtime.historyService.getHistoryList(
      { unitID: 'unit', length: 20 },
      context
    )
    assert.ok(Object.values(history.entities.datas).some((record) => record.endRevision === 2))
  } finally {
    await afterEdit.dispose()
  }
  assert.ok(!(await readdir(workspace)).some((name) => name.startsWith('univer-optimize-')))
  console.log('univerfile migration regression tests passed')
} finally {
  await rm(workspace, { recursive: true, force: true })
  await rm(bundleDirectory, { recursive: true, force: true })
}

function changeset(revision, createTime) {
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

function createLegacy(filename, snapshot, options = {}) {
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

function encodeSnapshot(snapshot) {
  return JSON.stringify(snapshot, (_key, value) =>
    value instanceof Uint8Array
      ? { __univerCollaborationBinary: Buffer.from(value).toString('base64') }
      : value
  )
}
