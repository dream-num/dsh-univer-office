import Database from "libsql";

export const DEFAULT_UNIVERFILE_SQLITE_BUSY_TIMEOUT_MS = 5_000;

let savepointSequence = 0;

export interface UniverfileSQLiteConnectionOptions {
  /** SQLite filename or `:memory:`. The parent directory must already exist. */
  readonly filename: string;
  /** How long SQLite waits for another writer before reporting SQLITE_BUSY. */
  readonly busyTimeoutMs?: number;
}

/**
 * Owns one physical SQLite connection shared by the trunk and Worktree adapters.
 *
 * Adapters borrowed from this owner never close the database independently. This mirrors the
 * original CLI gateway, where the trunk and Worktree stores shared one libsql connection.
 */
export class UniverfileSQLiteConnection {
  public readonly database: Database.Database;
  public readonly filename: string;

  private _disposed = false;

  public constructor(options: UniverfileSQLiteConnectionOptions) {
    validateOptions(options);
    this.filename = options.filename;
    this.database = new Database(options.filename, {
      timeout: options.busyTimeoutMs ?? DEFAULT_UNIVERFILE_SQLITE_BUSY_TIMEOUT_MS,
    });

    try {
      this.database.exec("PRAGMA foreign_keys = ON;");
      this.database.exec(
        `PRAGMA busy_timeout = ${
          options.busyTimeoutMs ?? DEFAULT_UNIVERFILE_SQLITE_BUSY_TIMEOUT_MS
        };`,
      );
    } catch (error) {
      this.database.close();
      this._disposed = true;
      throw error;
    }
  }

  /**
   * Closes this connection.
   *
   * libsql 0.5.29 does not finalize prepared statements when `Database.close()` runs. On Windows,
   * those statements may keep the database file locked until V8 collects them or the process
   * exits (https://github.com/tursodatabase/libsql-js/issues/228). Callers must therefore not
   * assume that a disposed database can be unlinked immediately in the same process. The CLI's
   * supported way to delete a recently used `.univer` file on Windows is to stop the daemon first.
   */
  public dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this.database.close();
  }
}

/**
 * Runs a synchronous SQLite operation atomically. Adapter calls made inside a larger gateway
 * transaction use a savepoint so schema initialization and migration can share one outer commit.
 */
export function runUniverfileSQLiteTransaction<T>(
  database: Database.Database,
  operation: () => T,
): T {
  if (!database.inTransaction) {
    database.exec("BEGIN IMMEDIATE;");
    try {
      const result = operation();
      database.exec("COMMIT;");
      return result;
    } catch (error) {
      if (database.inTransaction) {
        database.exec("ROLLBACK;");
      }
      throw error;
    }
  }

  const savepoint = `univerfile_nested_${savepointSequence}`;
  savepointSequence += 1;
  database.exec(`SAVEPOINT ${savepoint};`);
  try {
    const result = operation();
    database.exec(`RELEASE ${savepoint};`);
    return result;
  } catch (error) {
    if (database.inTransaction) {
      database.exec(`ROLLBACK TO ${savepoint};`);
      database.exec(`RELEASE ${savepoint};`);
    }
    throw error;
  }
}

function validateOptions(options: UniverfileSQLiteConnectionOptions): void {
  if (typeof options.filename !== "string" || options.filename.length === 0) {
    throw new TypeError("filename must be a non-empty string");
  }
  if (
    options.busyTimeoutMs !== undefined &&
    (!Number.isSafeInteger(options.busyTimeoutMs) || options.busyTimeoutMs < 0)
  ) {
    throw new TypeError("busyTimeoutMs must be a non-negative safe integer");
  }
}
