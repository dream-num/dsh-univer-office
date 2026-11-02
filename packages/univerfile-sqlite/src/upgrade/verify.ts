import { createHash } from 'node:crypto'
import { UniverfileSQLiteConnection } from '../driver/connection.ts'
import { AssetStore } from '../stores/assets.ts'
import { TrunkStore } from '../stores/trunk.ts'
import { HistoryStore } from '../stores/history.ts'
import { WorktreeStore } from '../stores/worktree.ts'
import { UniverfileError } from '../errors.ts'
import { detectUniverfileSQLiteFormat } from './detect.ts'

interface AssetRow {
  readonly asset_id: string
  readonly digest: string
  readonly bytes: Uint8Array | ArrayBuffer
  readonly byte_size: number
}

export interface UniverfileVerification {
  readonly units: number
  readonly worktrees: number
  readonly assets: number
}

export function verifyV3Candidate(filename: string): UniverfileVerification {
  let connection: UniverfileSQLiteConnection | undefined
  let trunk: TrunkStore | undefined
  let worktrees: WorktreeStore | undefined
  let history: HistoryStore | undefined
  try {
    if (detectUniverfileSQLiteFormat(filename) !== 'v3') {
      throw new Error('candidate did not identify as v3')
    }
    connection = new UniverfileSQLiteConnection({ filename })
    const integrityRow = connection.database.prepare('PRAGMA integrity_check').get() as
      | Readonly<Record<string, unknown>>
      | undefined
    const integrity = integrityRow === undefined ? undefined : Object.values(integrityRow)[0]
    if (integrity !== 'ok') throw new Error(`SQLite integrity check returned ${String(integrity)}`)
    if (connection.database.prepare('PRAGMA foreign_key_check').get() !== undefined) {
      throw new Error('SQLite foreign-key check failed')
    }
    trunk = new TrunkStore({ filename, connection })
    worktrees = new WorktreeStore({ filename, connection })
    history = new HistoryStore({ connection })
    const assetStore = new AssetStore({ connection })
    const units = trunk.listUnits()
    const worktreeRows = worktrees.listWorktrees()
    for (const worktree of worktreeRows) {
      worktrees.listWorktreeUnits(worktree.worktreeId)
      worktrees.listDeletedUnits(worktree.worktreeId)
    }
    const assets = connection.database
      .prepare(
        `SELECT a.asset_id, a.digest, b.bytes, b.byte_size
         FROM collaboration_assets a
         JOIN collaboration_asset_blobs b ON b.digest = a.digest`
      )
      .all() as unknown as AssetRow[]
    for (const asset of assets) {
      const bytes = asset.bytes instanceof ArrayBuffer ? new Uint8Array(asset.bytes) : asset.bytes
      if (bytes.byteLength !== asset.byte_size) {
        throw new Error(`Asset ${asset.asset_id} byte size does not match its blob`)
      }
      const opened = assetStore.open(asset.asset_id)
      const digest = createHash('sha256').update(bytes).digest('hex')
      if (
        digest !== asset.digest ||
        opened === null ||
        opened.bytes.byteLength !== asset.byte_size
      ) {
        throw new Error(`Asset ${asset.asset_id} failed digest verification`)
      }
    }
    return { units: units.length, worktrees: worktreeRows.length, assets: assets.length }
  } catch (error) {
    throw new UniverfileError(
      'VERIFICATION_FAILED',
      `v3 candidate verification failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  } finally {
    if (history !== undefined) void history.dispose()
    if (worktrees !== undefined) void worktrees.dispose()
    if (trunk !== undefined) void trunk.dispose()
    connection?.dispose()
  }
}
