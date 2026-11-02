import type { DatabaseSync } from 'node:sqlite'
import { runUniverfileSQLiteTransaction } from '../connection.ts'
import { SCHEMA_VERSIONS_TABLE, SCHEMA_VERSIONS_TABLE_SQL, V3_COMPONENTS } from './v3.ts'

interface ComponentRow {
  readonly component: string
}

/**
 * Creates every current component that the file does not record yet, in one transaction.
 *
 * A new file receives the whole v3 schema. An upgrade candidate already carries the components its
 * reader converted and receives the ones its source format predates, such as History on a v1 file.
 * Tables of an unrecorded component must not exist yet; their content would have no known layout.
 */
export function installSchema(database: DatabaseSync): void {
  runUniverfileSQLiteTransaction(database, () => {
    if (!hasTable(database, SCHEMA_VERSIONS_TABLE)) database.exec(SCHEMA_VERSIONS_TABLE_SQL)
    const recorded = new Set(
      (
        database
          .prepare(`SELECT component FROM ${SCHEMA_VERSIONS_TABLE}`)
          .all() as unknown as ComponentRow[]
      ).map(({ component }) => component)
    )
    const insertVersion = database.prepare(
      `INSERT INTO ${SCHEMA_VERSIONS_TABLE} (component, version) VALUES (?, ?)`
    )
    for (const component of V3_COMPONENTS) {
      if (recorded.has(component.name)) continue
      const existing = component.tables.filter((table) => hasTable(database, table))
      if (existing.length > 0) {
        throw new Error(
          `${component.name} tables exist without a schema version: ${existing.join(', ')}`
        )
      }
      database.exec(component.sql)
      insertVersion.run(component.name, component.version)
    }
  })
}

function hasTable(database: DatabaseSync, table: string): boolean {
  return (
    database.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table) !==
    undefined
  )
}
