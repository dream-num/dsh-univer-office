// Opening, creating, and closing `.univer` files, and stored payloads that must survive a reopen.
import { execFile } from 'node:child_process'
import { existsSync, renameSync, unlinkSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import type { ISheetBlock, ISnapshot } from '@univerjs/protocol'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openUniverfile, type Univerfile } from '../src/index.ts'
import {
  V3_VERSIONS,
  backupsOf,
  context,
  createV2,
  createdAt,
  snapshot,
  thrown,
  versionsOf
} from './support/legacy.ts'

let workspace: string

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'univerfile-open-'))
})

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

// Stores keep snapshots as opaque JSON, so the fixture only needs the identity fields.
const unitSnapshot = (unitID: string) => ({ ...snapshot, unitID }) as unknown as ISnapshot

async function createUnit(file: Univerfile, unitID: string): Promise<void> {
  const result = await file.trunk.createUnit(context, {
    record: { unitID, type: 2, headRevision: 1, creatorID: 'author', createdAt },
    snapshot: unitSnapshot(unitID)
  })
  expect(result.status).toBe('created')
}

describe('open and create', () => {
  it('creates a v3 file and reopens it unchanged', async () => {
    const path = join(workspace, 'new.univer')
    const created = openUniverfile(path, { create: true })
    try {
      expect(created.upgrade).toEqual({ status: 'unchanged', format: 'v3' })
      await createUnit(created, 'unit')
    } finally {
      await created.close()
    }
    expect(versionsOf(path)).toEqual(V3_VERSIONS)
    const reopened = openUniverfile(path)
    try {
      expect(reopened.upgrade).toEqual({ status: 'unchanged', format: 'v3' })
      expect(reopened.trunk.listUnits()).toMatchObject([{ unitId: 'unit', headRev: 1 }])
    } finally {
      await reopened.close()
    }
  })

  it('refuses to open a missing file or create over an existing one', async () => {
    const missing = join(workspace, 'missing.univer')
    expect(thrown(() => openUniverfile(missing))).toMatchObject({ code: 'FILE_NOT_FOUND' })
    expect(existsSync(missing)).toBe(false)
    const existing = join(workspace, 'existing.univer')
    await writeFile(existing, 'not a database')
    expect(thrown(() => openUniverfile(existing, { create: true }))).toMatchObject({
      code: 'FILE_EXISTS'
    })
    expect(await readFile(existing, 'utf8')).toBe('not a database')
  })

  it('always creates an in-memory file', async () => {
    const memory = openUniverfile(':memory:')
    try {
      await createUnit(memory, 'unit')
      expect(memory.trunk.listUnits()).toHaveLength(1)
    } finally {
      await memory.close()
    }
  })
})

// Windows refuses to rename or unlink a file while any handle to it stays open, so this proves
// the release there; elsewhere it guards the call sequence.
it('releases the file as soon as it is closed', async () => {
  const path = join(workspace, 'release.univer')
  const file = openUniverfile(path, { create: true })
  try {
    await createUnit(file, 'unit')
    expect(await file.trunk.getSnapshot(context, 'unit')).toBeTruthy()
    expect(file.trunk.listUnitRecords()).toHaveLength(1)
  } finally {
    await file.close()
  }
  const moved = join(workspace, 'released.univer')
  renameSync(path, moved)
  unlinkSync(moved)
  expect(existsSync(moved)).toBe(false)
})

// The Rust materializer hands Sheet blocks over as Node Buffers, and Buffer#toJSON runs before a
// JSON replacer sees the value.
it('reads Buffer Sheet blocks back as bytes after reopen', async () => {
  const path = join(workspace, 'buffer-blocks.univer')
  const bufferView = Buffer.from([9, 0, 128, 255, 9]).subarray(1, 4)
  const writer = openUniverfile(path, { create: true })
  try {
    await createUnit(writer, 'sheet')
    const blocks = [
      { id: 'view', startRow: 0, endRow: 0, data: bufferView },
      { id: 'empty', startRow: 1, endRow: 1, data: Buffer.alloc(0) }
    ] as ISheetBlock[]
    await writer.trunk.saveSnapshot(context, {
      snapshot: { ...unitSnapshot('sheet'), rev: 1 },
      sheetBlocks: blocks
    })
  } finally {
    await writer.close()
  }
  const reader = openUniverfile(path)
  try {
    const view = await reader.trunk.getSheetBlock(context, 'sheet', 'view')
    expect(view?.data).toEqual(new Uint8Array([0, 128, 255]))
    expect(Object.getPrototypeOf(view?.data)).toBe(Uint8Array.prototype)
    expect((await reader.trunk.getSheetBlock(context, 'sheet', 'empty'))?.data).toEqual(
      new Uint8Array(0)
    )
  } finally {
    await reader.close()
  }
})

// Independent processes share the filesystem lock; only one upgrades and writes a backup, and
// the other waits for SQLite instead of failing while the winner initializes the file.
it('upgrades once for concurrent openers in separate processes', async () => {
  // Child processes need plain JavaScript; inside the package, its dependencies still resolve.
  const cache = join(import.meta.dirname, '..', 'node_modules', '.cache')
  await mkdir(cache, { recursive: true })
  const bundle = join(await mkdtemp(join(cache, 'univerfile-')), 'index.mjs')
  await build({
    entryPoints: [join(import.meta.dirname, '..', 'src', 'index.ts')],
    outfile: bundle,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    logLevel: 'silent'
  })
  const path = join(workspace, 'concurrent.univer')
  createV2(path)
  const script = `const api = await import(process.argv[1]);
    const opened = api.openUniverfile(process.argv[2]);
    console.log(opened.upgrade.status);
    await opened.close();`
  const run = promisify(execFile)
  const attempts = await Promise.all(
    [0, 1].map(() =>
      run(process.execPath, [
        '--input-type=module',
        '-e',
        script,
        pathToFileURL(bundle).href,
        path
      ])
    )
  )
  expect(attempts.map(({ stdout }) => stdout.trim()).toSorted()).toEqual(['unchanged', 'upgraded'])
  expect(await backupsOf(workspace, 'concurrent.univer')).toHaveLength(1)
  expect(versionsOf(path)).toEqual(V3_VERSIONS)
  await rm(join(bundle, '..'), { recursive: true, force: true })
})
