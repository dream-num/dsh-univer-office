import { createHash } from 'node:crypto'
import { UniverfileSQLiteConnection } from '../driver/connection.ts'
import { AssetStore } from '../stores/assets.ts'
import { TrunkStore } from '../stores/trunk.ts'
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

/** Verifies an upgrade candidate on disk: it must identify as v3 and pass `verifyUniverfile`. */
export function verifyV3Candidate(filename: string): UniverfileVerification {
  let connection: UniverfileSQLiteConnection | undefined
  try {
    if (detectUniverfileSQLiteFormat(filename) !== 'v3') {
      throw new Error('candidate did not identify as v3')
    }
    connection = new UniverfileSQLiteConnection({ filename })
    return checkContent(connection)
  } catch (error) {
    throw verificationFailed('v3 candidate', error)
  } finally {
    connection?.dispose()
  }
}

/**
 * Checks an open v3 file: SQLite integrity and foreign keys, a read-back of every Unit and
 * Worktree through the stores, and the size and digest of every asset.
 */
export function verifyUniverfile(connection: UniverfileSQLiteConnection): UniverfileVerification {
  try {
    return checkContent(connection)
  } catch (error) {
    throw verificationFailed('.univer', error)
  }
}

function checkContent(connection: UniverfileSQLiteConnection): UniverfileVerification {
  const { database, filename } = connection
  const integrityRow = database.prepare('PRAGMA integrity_check').get() as
    | Readonly<Record<string, unknown>>
    | undefined
  const integrity = integrityRow === undefined ? undefined : Object.values(integrityRow)[0]
  if (integrity !== 'ok') throw new Error(`SQLite integrity check returned ${String(integrity)}`)
  if (database.prepare('PRAGMA foreign_key_check').get() !== undefined) {
    throw new Error('SQLite foreign-key check failed')
  }
  const trunk = new TrunkStore({ filename, connection })
  const worktrees = new WorktreeStore({ filename, connection })
  const assetStore = new AssetStore({ connection })
  const units = trunk.listUnits()
  const worktreeRows = worktrees.listWorktrees()
  for (const worktree of worktreeRows) {
    worktrees.listWorktreeUnits(worktree.worktreeId)
    worktrees.listDeletedUnits(worktree.worktreeId)
  }
  const assets = database
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
    if (digest !== asset.digest || opened === null || opened.bytes.byteLength !== asset.byte_size) {
      throw new Error(`Asset ${asset.asset_id} failed digest verification`)
    }
  }
  return { units: units.length, worktrees: worktreeRows.length, assets: assets.length }
}

function verificationFailed(subject: string, error: unknown): UniverfileError {
  return new UniverfileError(
    'VERIFICATION_FAILED',
    `${subject} verification failed: ${error instanceof Error ? error.message : String(error)}`,
    { cause: error }
  )
}
