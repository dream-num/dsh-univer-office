import type { DatabaseSync } from 'node:sqlite'

let savepointSequence = 0

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
