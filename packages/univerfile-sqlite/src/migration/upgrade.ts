import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, renameSync, unlinkSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { UniverfileSQLiteConnection } from '../connection.ts'
import { UniverfileSQLiteAssetStore } from '../database-adapters/asset-store.ts'
import { UniverfileSQLiteHistoryDatabaseAdapter } from '../database-adapters/history-database-adapter.ts'
import { UniverfileSQLiteError } from '../errors.ts'
import { detectUniverfileSQLiteFormat } from '../schema/detect.ts'
import { createUniverfileBackup, sha256 } from './backup.ts'
import { migrateLegacyBaseContentToV2 } from './base-content.ts'
import { withUniverfileUpgradeLock } from './lock.ts'
import { pruneCandidateToCurrentSchema } from './prune.ts'
import { migrateV0CandidateToV3 } from './readers/v0.ts'
import { migrateV1CandidateToV2 } from './readers/v1.ts'
import { migrateV2CandidateToV3, normalizeChangesetCreateTimes } from './readers/v2.ts'
import { verifyV3Candidate, type UniverfileVerification } from './verify.ts'

export type UniverfileUpgradeSourceFormat = 'v0' | 'v1' | 'v2'

export type UniverfileUpgradeResult =
  | { readonly status: 'unchanged'; readonly format: 'v3' }
  | {
      readonly status: 'upgraded'
      readonly sourceFormat: UniverfileUpgradeSourceFormat
      readonly targetFormat: 'v3'
      readonly backupPath: string
      readonly backupSha256: string
      /** v0 and v1 logical Worktree commits have no Collaboration SDK equivalent. */
      readonly omitted: readonly 'logical-commit-history'[]
      readonly preserved: { readonly mergingWorktrees: number }
      readonly warnings: readonly string[]
      readonly verification: UniverfileVerification
    }

export interface UpgradeUniverfileSQLiteOptions {
  readonly lockTimeoutMs?: number
}

const REPLACE_RETRY_MS = [0, 50, 100, 200, 400] as const
const WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4))

export function upgradeUniverfileSQLite(
  filename: string,
  options: UpgradeUniverfileSQLiteOptions = {}
): UniverfileUpgradeResult {
  if (detectUniverfileSQLiteFormat(filename) === 'v3') return { status: 'unchanged', format: 'v3' }
  return withUniverfileUpgradeLock(filename, options.lockTimeoutMs ?? 5_000, () =>
    upgradeLocked(filename)
  )
}

/**
 * Upgrades while holding the upgrade lock. Another opener may have finished the upgrade while
 * this one waited for the lock, so the format is identified again first.
 */
function upgradeLocked(filename: string): UniverfileUpgradeResult {
  const sourceFormat = detectUniverfileSQLiteFormat(filename)
  if (sourceFormat === 'v3') return { status: 'unchanged', format: 'v3' }
  const backup = createUniverfileBackup(filename, sourceFormat)
  const candidatePath = join(
    dirname(filename),
    `.${basename(filename)}.upgrade-${randomUUID()}.univer`
  )
  try {
    copyFileSync(backup.path, candidatePath)
    const preservedMergingWorktrees = migrateCandidate(candidatePath, sourceFormat)
    const verification = verifyV3Candidate(candidatePath)
    if (sha256(filename) !== backup.sha256) {
      throw new Error('source file changed while its upgrade candidate was prepared')
    }
    replaceCandidate(candidatePath, filename)
    return {
      status: 'upgraded',
      sourceFormat,
      targetFormat: 'v3',
      backupPath: backup.path,
      backupSha256: backup.sha256,
      omitted: sourceFormat === 'v2' ? [] : ['logical-commit-history'],
      preserved: { mergingWorktrees: preservedMergingWorktrees },
      warnings: [],
      verification
    }
  } catch (error) {
    if (existsSync(candidatePath)) unlinkSync(candidatePath)
    if (error instanceof UniverfileSQLiteError) throw error
    throw new UniverfileSQLiteError(
      'UPGRADE_FAILED',
      `failed to upgrade ${filename} from ${sourceFormat} to v3: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }
}

/**
 * Every connection to the source and the candidate is closed before this runs, and closing
 * releases the file. The retries cover a short-lived handle from another process, such as an
 * antivirus or indexing service on Windows.
 */
function replaceCandidate(candidatePath: string, filename: string): void {
  let last: unknown
  for (const delayMs of REPLACE_RETRY_MS) {
    if (delayMs > 0) Atomics.wait(WAIT_BUFFER, 0, 0, delayMs)
    try {
      renameSync(candidatePath, filename)
      return
    } catch (error) {
      last = error
      if (!isSharingViolation(error)) throw error
    }
  }
  throw last
}

function isSharingViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ((error as { readonly code?: unknown }).code === 'EPERM' ||
      (error as { readonly code?: unknown }).code === 'EBUSY' ||
      (error as { readonly code?: unknown }).code === 'EACCES')
  )
}

/** Returns the number of merging Worktrees normalized back to ready. */
function migrateCandidate(
  candidatePath: string,
  sourceFormat: UniverfileUpgradeSourceFormat
): number {
  const connection = new UniverfileSQLiteConnection({ filename: candidatePath })
  try {
    let normalizedMergingWorktrees = 0
    if (sourceFormat === 'v0') {
      const result = migrateV0CandidateToV3(connection)
      if (result.status !== 'migrated') throw new Error('v0 reader did not migrate the candidate')
      normalizeChangesetCreateTimes(connection.database)
    } else {
      if (sourceFormat === 'v1') normalizedMergingWorktrees = migrateV1CandidateToV2(connection)
      migrateV2CandidateToV3(connection)
    }
    new UniverfileSQLiteAssetStore({ connection })
    new UniverfileSQLiteHistoryDatabaseAdapter({ connection })
    if (sourceFormat !== 'v2') migrateLegacyBaseContentToV2(connection.database)
    pruneCandidateToCurrentSchema(connection.database)
    return normalizedMergingWorktrees
  } finally {
    connection.dispose()
  }
}
