import { DatabaseSync } from 'node:sqlite'

export const DEFAULT_UNIVERFILE_SQLITE_BUSY_TIMEOUT_MS = 5_000

let savepointSequence = 0

export interface UniverfileSQLiteConnectionOptions {
  /** SQLite filename or `:memory:`. The parent directory must already exist. */
  readonly filename: string
  /** How long SQLite waits for another writer before reporting SQLITE_BUSY. */
  readonly busyTimeoutMs?: number
}

/**
 * Owns one physical SQLite connection shared by the trunk and Worktree adapters.
 *
 * Adapters borrowed from this owner never close the database independently. This mirrors the
 * original CLI gateway, where the trunk and Worktree stores shared one connection.
 */
export class UniverfileSQLiteConnection {
  public readonly database: DatabaseSync
  public readonly filename: string

  private _disposed = false

  public constructor(options: UniverfileSQLiteConnectionOptions) {
    validateOptions(options)
    this.filename = options.filename
    this.database = new DatabaseSync(options.filename, {
      timeout: options.busyTimeoutMs ?? DEFAULT_UNIVERFILE_SQLITE_BUSY_TIMEOUT_MS,
      enableForeignKeyConstraints: true
    })
  }

  /**
   * Closes this connection.
   *
   * `node:sqlite` finalizes every statement prepared on this connection before it closes the
   * handle, so once this returns the file is no longer held by this process and can be renamed or
   * unlinked immediately, including on Windows.
   */
  public dispose(): void {
    if (this._disposed) {
      return
    }
    this._disposed = true
    this.database.close()
  }
}

/**
 * Runs a synchronous SQLite operation atomically. Adapter calls made inside a larger gateway
 * transaction use a savepoint so schema initialization and migration can share one outer commit.
 */
export function runUniverfileSQLiteTransaction<T>(database: DatabaseSync, operation: () => T): T {
  if (!database.isTransaction) {
    database.exec('BEGIN IMMEDIATE;')
    try {
      const result = operation()
      database.exec('COMMIT;')
      return result
    } catch (error) {
      if (database.isTransaction) {
        database.exec('ROLLBACK;')
      }
      throw error
    }
  }

  const savepoint = `univerfile_nested_${savepointSequence}`
  savepointSequence += 1
  database.exec(`SAVEPOINT ${savepoint};`)
  try {
    const result = operation()
    database.exec(`RELEASE ${savepoint};`)
    return result
  } catch (error) {
    if (database.isTransaction) {
      database.exec(`ROLLBACK TO ${savepoint};`)
      database.exec(`RELEASE ${savepoint};`)
    }
    throw error
  }
}

function validateOptions(options: UniverfileSQLiteConnectionOptions): void {
  if (typeof options.filename !== 'string' || options.filename.length === 0) {
    throw new TypeError('filename must be a non-empty string')
  }
  if (
    options.busyTimeoutMs !== undefined &&
    (!Number.isSafeInteger(options.busyTimeoutMs) || options.busyTimeoutMs < 0)
  ) {
    throw new TypeError('busyTimeoutMs must be a non-negative safe integer')
  }
}
