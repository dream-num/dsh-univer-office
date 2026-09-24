import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, renameSync, unlinkSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { UniverfileSQLiteConnection } from '../connection.js'
import { UniverfileSQLiteAssetStore } from '../database-adapters/asset-store.js'
import { UniverfileSQLiteHistoryDatabaseAdapter } from '../database-adapters/history-database-adapter.js'
import { UniverfileSQLiteError } from '../errors.js'
import { detectUniverfileSQLiteFormat } from '../schema/detect.js'
import { createUniverfileBackup, sha256 } from './backup.js'
import { migrateLegacyBaseContentToV2 } from './base-content.js'
import {
  hasPendingComponentMigrations,
  migrateUniverfileComponentSchemas,
  type ComponentSchemaMigration
} from './component-schemas.js'
import { withUniverfileUpgradeLock } from './lock.js'
import { pruneCandidateToCurrentV2Schema } from './prune.js'
import { migrateV0CandidateToV2 } from './readers/v0.js'
import { migrateV1CandidateToV2 } from './readers/v1.js'
import { verifyV2Candidate, type UniverfileVerification } from './verify.js'

export type UniverfileUpgradeResult =
  | { readonly status: 'unchanged'; readonly format: 'v2' }
  | {
      readonly status: 'upgraded'
      readonly sourceFormat: 'v0' | 'v1'
      readonly targetFormat: 'v2'
      readonly backupPath: string
      readonly backupSha256: string
      readonly omitted: readonly ['logical-commit-history']
      readonly preserved: { readonly mergingWorktrees: number }
      readonly warnings: readonly string[]
      readonly verification: UniverfileVerification
      readonly components: readonly ComponentSchemaMigration[]
    }
  | {
      /**
       * A current-format file whose Collaboration SDK component schemas predate this build.
       * The file stays in the same format; only the component tables change.
       */
      readonly status: 'components-migrated'
      readonly format: 'v2'
      readonly backupPath: string
      readonly backupSha256: string
      readonly components: readonly ComponentSchemaMigration[]
      readonly verification: UniverfileVerification
    }

export interface UpgradeUniverfileSQLiteOptions {
  readonly lockTimeoutMs?: number
}

export function upgradeUniverfileSQLite(
  filename: string,
  options: UpgradeUniverfileSQLiteOptions = {}
): UniverfileUpgradeResult {
  const initial = detectUniverfileSQLiteFormat(filename)
  if (initial === 'v2' && !hasPendingComponentMigrations(filename)) {
    return { status: 'unchanged', format: 'v2' }
  }

  return withUniverfileUpgradeLock(filename, options.lockTimeoutMs ?? 5_000, () => {
    const sourceFormat = detectUniverfileSQLiteFormat(filename)
    if (sourceFormat === 'v2') return migrateCurrentComponentsInPlace(filename)

    const backup = createUniverfileBackup(filename, sourceFormat)
    const candidatePath = join(
      dirname(filename),
      `.${basename(filename)}.upgrade-${randomUUID()}.univer`
    )
    try {
      copyFileSync(backup.path, candidatePath)
      const { mergingWorktrees, components } =
        sourceFormat === 'v0' ? migrateV0(candidatePath) : migrateV1(candidatePath)
      const verification = verifyV2Candidate(candidatePath)
      if (sha256(filename) !== backup.sha256) {
        throw new Error('source file changed while its upgrade candidate was prepared')
      }
      renameSync(candidatePath, filename)
      return {
        status: 'upgraded',
        sourceFormat,
        targetFormat: 'v2',
        backupPath: backup.path,
        backupSha256: backup.sha256,
        omitted: ['logical-commit-history'],
        preserved: { mergingWorktrees },
        warnings: [],
        verification,
        components
      }
    } catch (error) {
      if (existsSync(candidatePath)) unlinkSync(candidatePath)
      if (error instanceof UniverfileSQLiteError) throw error
      throw new UniverfileSQLiteError(
        'UPGRADE_FAILED',
        `failed to upgrade ${filename} from ${sourceFormat} to v2: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    }
  })
}

/**
 * Advance the component schemas of an already current-format file.
 *
 * The component migrations rewrite authoritative tables in place, so the file is backed up before
 * the first write; the changelog requires a backup with the writers stopped, and component
 * migrations are not reversible without one.
 */
function migrateCurrentComponentsInPlace(filename: string): UniverfileUpgradeResult {
  if (!hasPendingComponentMigrations(filename)) return { status: 'unchanged', format: 'v2' }

  const backup = createUniverfileBackup(filename, 'v2')
  const connection = new UniverfileSQLiteConnection({ filename })
  let components: readonly ComponentSchemaMigration[]
  try {
    components = migrateUniverfileComponentSchemas(connection.database)
  } catch (error) {
    throw new UniverfileSQLiteError(
      'UPGRADE_FAILED',
      `failed to migrate component schemas of ${filename}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  } finally {
    connection.dispose()
  }
  return {
    status: 'components-migrated',
    format: 'v2',
    backupPath: backup.path,
    backupSha256: backup.sha256,
    components,
    verification: verifyV2Candidate(filename)
  }
}

interface CandidateMigration {
  readonly mergingWorktrees: number
  readonly components: readonly ComponentSchemaMigration[]
}

function migrateV0(candidatePath: string): CandidateMigration {
  const connection = new UniverfileSQLiteConnection({ filename: candidatePath })
  try {
    const result = migrateV0CandidateToV2(connection)
    if (result.status !== 'migrated') throw new Error('v0 reader did not migrate the candidate')
    // The reader builds the collaboration schema from scratch at the current versions, so this
    // only guards against a reader that later starts preserving source component versions.
    const components = migrateUniverfileComponentSchemas(connection.database)
    new UniverfileSQLiteAssetStore({ connection })
    new UniverfileSQLiteHistoryDatabaseAdapter({ connection })
    migrateLegacyBaseContentToV2(connection.database)
    pruneCandidateToCurrentV2Schema(connection.database)
    return { mergingWorktrees: 0, components }
  } finally {
    connection.dispose()
  }
}

function migrateV1(candidatePath: string): CandidateMigration {
  const connection = new UniverfileSQLiteConnection({ filename: candidatePath })
  try {
    const normalizedMergingWorktrees = migrateV1CandidateToV2(connection)
    // The v1 reader normalizes the Worktree component to v2; the component pass carries it and
    // the remaining components to the versions this build owns before any adapter is constructed.
    const components = migrateUniverfileComponentSchemas(connection.database)
    new UniverfileSQLiteAssetStore({ connection })
    new UniverfileSQLiteHistoryDatabaseAdapter({ connection })
    migrateLegacyBaseContentToV2(connection.database)
    pruneCandidateToCurrentV2Schema(connection.database)
    return { mergingWorktrees: normalizedMergingWorktrees, components }
  } finally {
    connection.dispose()
  }
}
