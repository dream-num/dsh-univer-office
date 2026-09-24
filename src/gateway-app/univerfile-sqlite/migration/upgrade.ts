import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, renameSync, unlinkSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { UniverfileSQLiteFormat } from '../schema/detect.ts'
import type { UniverfileVerification } from './verify.ts'
import { UniverfileSQLiteConnection } from '../connection.ts'
import { UniverfileSQLiteAssetStore } from '../database-adapters/asset-store.ts'
import { UniverfileSQLiteHistoryDatabaseAdapter } from '../database-adapters/history-database-adapter.ts'
import { UniverfileSQLiteError } from '../errors.ts'
import { detectUniverfileSQLiteFormat } from '../schema/detect.ts'
import { createUniverfileBackup, sha256 } from './backup.ts'
import { migrateLegacyBaseContentToV2 } from './base-content.ts'
import { withUniverfileUpgradeLock } from './lock.ts'
import { pruneCandidateToCurrentV3Schema } from './prune.ts'
import { migrateV0CandidateToV3 } from './readers/v0.ts'
import { migrateV1CandidateToV2 } from './readers/v1.ts'
import { migrateV2CandidateToV3, normalizeCandidateChangesetTimes } from './readers/v2.ts'
import { verifyV3Candidate } from './verify.ts'

export type UniverfileUpgradeResult =
  | { readonly status: 'unchanged'; readonly format: 'v3' }
  | {
      readonly status: 'upgraded'
      readonly sourceFormat: Exclude<UniverfileSQLiteFormat, 'v3'>
      readonly targetFormat: 'v3'
      readonly backupPath: string
      readonly backupSha256: string
      readonly omitted: readonly 'logical-commit-history'[]
      readonly preserved: { readonly mergingWorktrees: number }
      readonly warnings: readonly string[]
      readonly verification: UniverfileVerification
    }

export interface UpgradeUniverfileSQLiteOptions {
  readonly lockTimeoutMs?: number
}

/** Publish a current-format file only after every migration and verification succeeds on a copy. */
export function upgradeUniverfileSQLite(
  filename: string,
  options: UpgradeUniverfileSQLiteOptions = {}
): UniverfileUpgradeResult {
  if (detectUniverfileSQLiteFormat(filename) === 'v3') {
    return { status: 'unchanged', format: 'v3' }
  }
  return withUniverfileUpgradeLock(filename, options.lockTimeoutMs ?? 5_000, () => {
    const sourceFormat = detectUniverfileSQLiteFormat(filename)
    if (sourceFormat === 'v3') return { status: 'unchanged', format: 'v3' }
    const backup = createUniverfileBackup(filename, sourceFormat)
    const candidatePath = join(
      dirname(filename),
      `.${basename(filename)}.upgrade-${randomUUID()}.univer`
    )
    try {
      copyFileSync(backup.path, candidatePath)
      const mergingWorktrees = migrateCandidate(candidatePath, sourceFormat)
      const verification = verifyV3Candidate(candidatePath)
      if (sha256(filename) !== backup.sha256) {
        throw new Error('source file changed while its upgrade candidate was prepared')
      }
      renameSync(candidatePath, filename)
      return {
        status: 'upgraded',
        sourceFormat,
        targetFormat: 'v3',
        backupPath: backup.path,
        backupSha256: backup.sha256,
        omitted: sourceFormat === 'v2' ? [] : ['logical-commit-history'],
        preserved: { mergingWorktrees },
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
  })
}

function migrateCandidate(
  candidatePath: string,
  sourceFormat: Exclude<UniverfileSQLiteFormat, 'v3'>
): number {
  const connection = new UniverfileSQLiteConnection({ filename: candidatePath })
  try {
    let mergingWorktrees = 0
    switch (sourceFormat) {
      case 'v0': {
        // This reader initializes the current adapters and copies legacy data directly into v3.
        const result = migrateV0CandidateToV3(connection)
        if (result.status !== 'migrated') throw new Error('v0 reader did not migrate the candidate')
        break
      }
      case 'v1':
        mergingWorktrees = migrateV1CandidateToV2(connection)
        migrateV2CandidateToV3(connection.database)
        break
      case 'v2':
        migrateV2CandidateToV3(connection.database)
        break
    }
    new UniverfileSQLiteAssetStore({ connection })
    new UniverfileSQLiteHistoryDatabaseAdapter({ connection })
    normalizeCandidateChangesetTimes(connection.database)
    if (sourceFormat !== 'v2') migrateLegacyBaseContentToV2(connection.database)
    pruneCandidateToCurrentV3Schema(connection.database)
    return mergingWorktrees
  } finally {
    connection.dispose()
  }
}
