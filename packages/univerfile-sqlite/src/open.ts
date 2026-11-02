import { existsSync, unlinkSync } from 'node:fs'
import { UniverfileSQLiteConnection } from './driver/connection.ts'
import { UniverfileError } from './errors.ts'
import { installSchema } from './schema/install.ts'
import { AssetStore, type UniverfileAssetStore } from './stores/assets.ts'
import { HistoryStore, type UniverfileHistoryStore } from './stores/history.ts'
import { TrunkStore, type UniverfileTrunkStore } from './stores/trunk.ts'
import { WorktreeStore, type UniverfileWorktreeStore } from './stores/worktree.ts'
import { upgradeUniverfileSQLite, type UniverfileUpgradeOutcome } from './upgrade/upgrade.ts'
import { verifyUniverfile, type UniverfileVerification } from './upgrade/verify.ts'

const MEMORY = ':memory:'

export interface OpenUniverfileOptions {
  /** Create a new file; fails with `FILE_EXISTS` when the path exists. `:memory:` always creates. */
  readonly create?: boolean
}

/**
 * One open `.univer` file. Its stores share a single SQLite connection and follow the same
 * functional split as the Collaboration SDK, each extended with what the application needs.
 */
export interface Univerfile {
  readonly path: string
  /** What opening did to the file: nothing for a current file, or a completed upgrade. */
  readonly upgrade: UniverfileUpgradeOutcome
  readonly trunk: UniverfileTrunkStore
  readonly worktree: UniverfileWorktreeStore
  readonly history: UniverfileHistoryStore
  readonly assets: UniverfileAssetStore
  /**
   * Checks SQLite integrity and foreign keys, reads every Unit and Worktree back through the
   * stores, and checks every asset's size and digest. Throws `VERIFICATION_FAILED`.
   */
  verify(): UniverfileVerification
  /** Rebuilds the file to reclaim the space of deleted rows. Must not run inside a store call. */
  vacuum(): void
  /**
   * Closes the connection. Once this resolves the process holds no handle to the file, so it can
   * be renamed or deleted right away, including on Windows. Store calls after closing throw.
   */
  close(): Promise<void>
}

/**
 * Opens an existing `.univer` file, upgrading an older format to v3 first, or creates a new one.
 *
 * The returned file is always v3. Opening fails with a `UniverfileError`: `FILE_NOT_FOUND`,
 * `FILE_EXISTS`, `UNSUPPORTED_SCHEMA`, or an upgrade failure that leaves the source unchanged.
 * Processes that open the same file at once share SQLite's file locks, and only one of them
 * upgrades it.
 */
export function openUniverfile(path: string, options: OpenUniverfileOptions = {}): Univerfile {
  if (path === MEMORY || options.create === true) return create(path)
  if (!existsSync(path)) {
    throw new UniverfileError('FILE_NOT_FOUND', `.univer file not found: ${path}`)
  }
  return assemble(path, upgradeUniverfileSQLite(path), false)
}

function create(path: string): Univerfile {
  if (path !== MEMORY && existsSync(path)) {
    throw new UniverfileError('FILE_EXISTS', `.univer file already exists: ${path}`)
  }
  try {
    return assemble(path, { status: 'unchanged', format: 'v3' }, true)
  } catch (error) {
    if (path !== MEMORY && existsSync(path)) unlinkSync(path)
    throw error
  }
}

function assemble(path: string, upgrade: UniverfileUpgradeOutcome, install: boolean): Univerfile {
  const connection = new UniverfileSQLiteConnection({ filename: path })
  try {
    if (install) installSchema(connection.database)
    const trunk = new TrunkStore({ filename: path, connection })
    const worktree = new WorktreeStore({ filename: path, connection })
    const history = new HistoryStore({ connection })
    const assets = new AssetStore({ connection })
    return {
      path,
      upgrade,
      trunk,
      worktree,
      history,
      assets,
      verify: () => verifyUniverfile(connection),
      vacuum: () => connection.database.exec('VACUUM'),
      async close(): Promise<void> {
        await history.dispose()
        await worktree.dispose()
        await trunk.dispose()
        connection.dispose()
      }
    }
  } catch (error) {
    connection.dispose()
    throw error
  }
}
