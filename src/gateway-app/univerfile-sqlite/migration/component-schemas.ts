import Database from 'libsql'
import { migrateUniverfileCoreSchema } from '../database-adapters/collaboration-database-adapter.js'
import { migrateUniverfileHistorySchema } from '../database-adapters/history-database-adapter.js'
import { migrateUniverfileWorktreeSchema } from '../database-adapters/worktree-database-adapter.js'

/**
 * Component schema versions this build owns.
 *
 * These are independent of the `.univer` file format: a format-v2 file written before the
 * Collaboration SDK 1.0 upgrade still carries the previous versions and must be advanced before
 * any adapter is constructed.
 */
export const CURRENT_COMPONENT_VERSIONS = {
  core: 2,
  worktree: 3,
  history: 2
} as const

export type UniverfileComponent = keyof typeof CURRENT_COMPONENT_VERSIONS

export interface ComponentSchemaMigration {
  readonly component: UniverfileComponent
  readonly from: number
  readonly to: number
}

interface VersionRow {
  readonly component: string
  readonly version: number
}

/** Read component schema versions without opening a writable connection. */
export function readUniverfileComponentVersions(
  filename: string
): ReadonlyMap<string, number> | null {
  let database: Database.Database | undefined
  try {
    database = new Database(filename, { readonly: true, fileMustExist: true })
    const hasVersionTable = database
      .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
      .get('collaboration_schema_versions')
    if (hasVersionTable === undefined) return null
    return new Map(
      (
        database
          .prepare('SELECT component, version FROM collaboration_schema_versions')
          .all() as unknown as VersionRow[]
      ).map(({ component, version }) => [component, version])
    )
  } finally {
    database?.close()
  }
}

/** Whether any owned component is behind the version this build requires. */
export function hasPendingComponentMigrations(filename: string): boolean {
  const versions = readUniverfileComponentVersions(filename)
  if (versions === null) return false
  return pendingComponentMigrations(versions, CURRENT_COMPONENT_VERSIONS).length > 0
}

/**
 * Advance the Collaboration SDK component schemas in place.
 *
 * Order is Core, Worktree, then History: the first two backfill Unit and changeset creation
 * information from the legacy History rows that the History migration removes. Each component
 * commits its own migration so a failure can be repaired and resumed from that step, which is why
 * the three steps are deliberately not wrapped in one transaction.
 */
export function migrateUniverfileComponentSchemas(
  database: Database.Database
): readonly ComponentSchemaMigration[] {
  const pending = pendingComponentMigrations(readComponentVersions(database))
  if (pending.length === 0) return []

  migrateUniverfileCoreSchema(database)
  migrateUniverfileWorktreeSchema(database)
  migrateUniverfileHistorySchema(database)
  return pending
}

function readComponentVersions(database: Database.Database): ReadonlyMap<string, number> {
  const hasVersionTable = database
    .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
    .get('collaboration_schema_versions')
  if (hasVersionTable === undefined) return new Map()
  return new Map(
    (
      database
        .prepare('SELECT component, version FROM collaboration_schema_versions')
        .all() as unknown as VersionRow[]
    ).map(({ component, version }) => [component, version])
  )
}

function pendingComponentMigrations(
  versions: ReadonlyMap<string, number>,
  current: Readonly<Record<UniverfileComponent, number>> = CURRENT_COMPONENT_VERSIONS
): readonly ComponentSchemaMigration[] {
  const pending: ComponentSchemaMigration[] = []
  for (const [component, to] of Object.entries(current) as [UniverfileComponent, number][]) {
    const from = versions.get(component)
    // A missing row means a fresh database, which the adapter initializes directly.
    if (from === undefined || from === to) continue
    pending.push({ component, from, to })
  }
  return pending
}
