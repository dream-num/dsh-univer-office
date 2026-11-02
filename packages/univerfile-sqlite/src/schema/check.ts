import type { DatabaseSync } from 'node:sqlite'
import { UniverfileError } from '../errors.ts'
import { V3_COMPONENTS } from './v3.ts'

interface ColumnRow {
  readonly name: string
}

/**
 * Throws `UNSUPPORTED_SCHEMA` unless the file is a complete v3 schema.
 *
 * `versions` and `tables` come from the caller's read of the same connection. Every component must
 * record its current version with all of its tables and required columns; any component the
 * caller did not recognize is reported before this runs.
 */
export function assertCurrentSchema(
  database: DatabaseSync,
  tables: ReadonlySet<string>,
  versions: ReadonlyMap<string, number>
): void {
  for (const component of V3_COMPONENTS) {
    const version = versions.get(component.name)
    if (version !== component.version) {
      throw unsupported(
        `${component.name} schema version ${String(version)} is not v${component.version}`
      )
    }
  }
  const missing = V3_COMPONENTS.flatMap(({ tables: owned }) => owned).filter(
    (table) => !tables.has(table)
  )
  if (missing.length > 0) {
    throw unsupported(`schema is incomplete: missing ${missing.join(', ')}`)
  }
  for (const [table, requiredColumns] of V3_COMPONENTS.flatMap(
    ({ requiredColumns: required }) => required
  )) {
    const present = columns(database, table)
    const absent = requiredColumns.filter((column) => !present.has(column))
    if (absent.length > 0) {
      throw unsupported(`${table} is missing ${absent.join(', ')}`)
    }
  }
}

function columns(database: DatabaseSync, table: string): ReadonlySet<string> {
  return new Set(
    (database.prepare(`PRAGMA table_info(${table})`).all() as unknown as ColumnRow[]).map(
      ({ name }) => name
    )
  )
}

function unsupported(message: string): UniverfileError {
  return new UniverfileError('UNSUPPORTED_SCHEMA', message)
}
