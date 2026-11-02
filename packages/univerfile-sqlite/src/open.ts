import { existsSync, unlinkSync } from 'node:fs'
import { UniverfileSQLiteConnection } from './driver/connection.ts'
import { UniverfileSQLiteAssetStore } from './stores/assets.ts'
import { UniverfileSQLiteDatabaseAdapter } from './stores/trunk.ts'
import { UniverfileSQLiteHistoryDatabaseAdapter } from './stores/history.ts'
import { UniverfileSQLiteWorktreeDatabaseAdapter } from './stores/worktree.ts'
import { UniverfileSQLiteError } from './errors.ts'
import {
  upgradeUniverfileSQLite,
  type UniverfileUpgradeResult,
  type UpgradeUniverfileSQLiteOptions
} from './upgrade/upgrade.ts'
import { installSchema } from './schema/install.ts'

export interface OpenUniverfileSQLiteOptions extends UpgradeUniverfileSQLiteOptions {
  readonly busyTimeoutMs?: number
}

export interface UniverfileSQLite {
  readonly filename: string
  readonly connection: UniverfileSQLiteConnection
  readonly databaseAdapter: UniverfileSQLiteDatabaseAdapter
  readonly worktreeDatabaseAdapter: UniverfileSQLiteWorktreeDatabaseAdapter
  readonly historyDatabaseAdapter: UniverfileSQLiteHistoryDatabaseAdapter
  readonly assetStore: UniverfileSQLiteAssetStore
  readonly upgrade: UniverfileUpgradeResult
  dispose(): Promise<void>
}

export function openUniverfileSQLite(
  filename: string,
  options: OpenUniverfileSQLiteOptions = {}
): UniverfileSQLite {
  if (!existsSync(filename)) {
    throw new UniverfileSQLiteError('FILE_NOT_FOUND', `.univer file not found: ${filename}`)
  }
  const upgrade = upgradeUniverfileSQLite(filename, options)
  return openCurrent(filename, upgrade, options.busyTimeoutMs, false)
}

export function createUniverfileSQLite(
  filename: string,
  options: Pick<OpenUniverfileSQLiteOptions, 'busyTimeoutMs'> = {}
): UniverfileSQLite {
  if (filename !== ':memory:' && existsSync(filename)) {
    throw new UniverfileSQLiteError('FILE_EXISTS', `.univer file already exists: ${filename}`)
  }
  try {
    return openCurrent(filename, { status: 'unchanged', format: 'v3' }, options.busyTimeoutMs, true)
  } catch (error) {
    if (filename !== ':memory:' && existsSync(filename)) unlinkSync(filename)
    throw error
  }
}

function openCurrent(
  filename: string,
  upgrade: UniverfileUpgradeResult,
  busyTimeoutMs: number | undefined,
  install: boolean
): UniverfileSQLite {
  const connection = new UniverfileSQLiteConnection({
    filename,
    ...(busyTimeoutMs === undefined ? {} : { busyTimeoutMs })
  })
  let databaseAdapter: UniverfileSQLiteDatabaseAdapter | undefined
  let worktreeDatabaseAdapter: UniverfileSQLiteWorktreeDatabaseAdapter | undefined
  let historyDatabaseAdapter: UniverfileSQLiteHistoryDatabaseAdapter | undefined
  try {
    if (install) installSchema(connection.database)
    const trunk = new UniverfileSQLiteDatabaseAdapter({ filename, connection })
    databaseAdapter = trunk
    const worktree = new UniverfileSQLiteWorktreeDatabaseAdapter({ filename, connection })
    worktreeDatabaseAdapter = worktree
    const history = new UniverfileSQLiteHistoryDatabaseAdapter({ connection })
    historyDatabaseAdapter = history
    const assetStore = new UniverfileSQLiteAssetStore({ connection })
    return {
      filename,
      connection,
      databaseAdapter: trunk,
      worktreeDatabaseAdapter: worktree,
      historyDatabaseAdapter: history,
      assetStore,
      upgrade,
      async dispose(): Promise<void> {
        await history.dispose()
        await worktree.dispose()
        await trunk.dispose()
        connection.dispose()
      }
    }
  } catch (error) {
    if (historyDatabaseAdapter !== undefined) void historyDatabaseAdapter.dispose()
    if (worktreeDatabaseAdapter !== undefined) void worktreeDatabaseAdapter.dispose()
    if (databaseAdapter !== undefined) void databaseAdapter.dispose()
    connection.dispose()
    throw error
  }
}
