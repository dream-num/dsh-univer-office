import type Database from 'libsql'
import { runUniverfileSQLiteTransaction } from '../connection.ts'
import { UniverfileSQLiteError } from '../errors.ts'
import { ANONYMOUS_CREATOR_ID, CREATE_TIME_SECONDS_LIMIT } from './legacy-creation.ts'

const SCHEMA_COMPONENT = 'worktree'
const SCHEMA_VERSION = 3
/** The predecessor accepted by the v2 file reader: v2 stored Units without creator information. */
const LEGACY_SCHEMA_VERSION = 2
/** Component version rows live in the table the Core migration creates and the adapter maintains. */
const SCHEMA_VERSIONS_TABLE = 'collaboration_schema_versions'
/**
 * The Worktree migration runs before the History migration, so it reads the legacy History table
 * with raw SQL instead of importing a History adapter, whose current shape no longer includes revision rows.
 */
const LEGACY_HISTORY_TABLE = 'collaboration_history_revisions'
const TABLE_NAMES = [
  'collaboration_worktrees',
  'collaboration_worktree_units',
  'collaboration_worktree_changesets',
  'collaboration_worktree_unit_seeds',
  'collaboration_worktree_unit_merge_artifacts',
  'collaboration_worktree_deleted_units'
] as const

interface SchemaVersionRow {
  readonly version: number
}

interface ColumnRow {
  readonly name: string
}

/**
 * Convert Worktree tables on an upgrade candidate before constructing current adapters.
 * A missing component row means a fresh database, which the adapter initializes directly.
 */
export function migrateUniverfileWorktreeSchema(database: Database.Database): void {
  if (!hasTable(database, SCHEMA_VERSIONS_TABLE)) {
    // No component has initialized this database yet, so the adapter creates the v3 schema itself.
    return
  }
  // Records that carry no time are backfilled with the instant the migration started, taken once so
  // that the whole upgrade shares one origin.
  const migrationStartedAtMs = Date.now()

  // Roll back DDL, backfills and the version row together; the outer upgrade discards a failed candidate.
  runUniverfileSQLiteTransaction(database, () => {
    const row = database
      .prepare(
        `SELECT version
         FROM collaboration_schema_versions
         WHERE component = ?`
      )
      .get(SCHEMA_COMPONENT) as SchemaVersionRow | undefined
    if (row === undefined || row.version === SCHEMA_VERSION) return
    if (row.version !== LEGACY_SCHEMA_VERSION) {
      throw new UniverfileSQLiteError(
        'UNSUPPORTED_SCHEMA',
        `SQLite Worktree schema version ${row.version} is not supported`
      )
    }
    const missingTables = TABLE_NAMES.filter((tableName) => !hasTable(database, tableName))
    if (missingTables.length > 0) {
      throw new UniverfileSQLiteError(
        'UNSUPPORTED_SCHEMA',
        `SQLite Worktree schema v${LEGACY_SCHEMA_VERSION} is incomplete: missing ${missingTables.join(', ')}`
      )
    }
    // `ALTER TABLE ADD COLUMN` cannot add a NOT NULL column without a constant default, so these
    // placeholders exist only until the backfill below replaces them. v2 already owns a Unit
    // `created_at_ms`, but it holds a Gateway-side timestamp: v3 redefines that column as the SDK
    // Unit createdAt, which is why every Unit row is rewritten rather than only the new column.
    addColumnIfMissing(
      database,
      'collaboration_worktree_units',
      'creator_id',
      `TEXT NOT NULL DEFAULT '${ANONYMOUS_CREATOR_ID}'`
    )
    addColumnIfMissing(
      database,
      'collaboration_worktree_units',
      'created_at_ms',
      'INTEGER NOT NULL DEFAULT 0'
    )
    addColumnIfMissing(
      database,
      'collaboration_worktree_changesets',
      'created_at_ms',
      'INTEGER NOT NULL DEFAULT 0'
    )
    migrateWorktreeUnitsToV3(database, migrationStartedAtMs)
    migrateWorktreeChangesetsToV3(database, migrationStartedAtMs)
    database
      .prepare(
        `UPDATE collaboration_schema_versions
         SET version = ?
         WHERE component = ?`
      )
      .run(SCHEMA_VERSION, SCHEMA_COMPONENT)
  })
}

/**
 * v2 Units carry no creator information. Trunk-backed Units copy what the Core migration restored
 * from the same legacy History table, and that History entry for revision 1 supplies whatever the
 * trunk record lacks: the changelog makes it the default creation information for Units joined from
 * trunk. History is read with raw SQL because it still owns its pre-migration shape, and a database
 * without a History component skips that step instead of failing.
 */
function migrateWorktreeUnitsToV3(database: Database.Database, migrationStartedAtMs: number): void {
  const hasLegacyHistory = hasTable(database, LEGACY_HISTORY_TABLE)
  const historyCreatedAt = hasLegacyHistory
    ? `(SELECT committed_at FROM ${LEGACY_HISTORY_TABLE}
         WHERE unit_id = collaboration_worktree_units.unit_id AND revision = 1)`
    : 'NULL'
  const historyCreatorID = hasLegacyHistory
    ? `(SELECT user_id FROM ${LEGACY_HISTORY_TABLE}
         WHERE unit_id = collaboration_worktree_units.unit_id AND revision = 1)`
    : 'NULL'
  database
    .prepare(
      `UPDATE collaboration_worktree_units
       SET created_at_ms = COALESCE(
             CASE
               WHEN source = 'trunk' THEN (
                 SELECT created_at_ms FROM collaboration_units
                 WHERE unit_id = collaboration_worktree_units.unit_id
               )
             END,
             ${historyCreatedAt},
             created_at_ms,
             ?
           ),
           creator_id = COALESCE(
             CASE
               WHEN source = 'trunk' THEN (
                 SELECT creator_id FROM collaboration_units
                 WHERE unit_id = collaboration_worktree_units.unit_id
               )
             END,
             ${historyCreatorID},
             ?
           )`
    )
    .run(migrationStartedAtMs, ANONYMOUS_CREATOR_ID)
}

/**
 * Legacy draft changesets record their creation time in the protocol `createTime`. This repository's
 * submit paths write `Date.now()` milliseconds there while the SDK submit entry fills Unix seconds,
 * so the unit is decided by magnitude instead of a fixed factor, exactly like the Core migration.
 * A value that carries no usable time falls back to the History entry of the same revision, and then
 * to the migration start time.
 */
function migrateWorktreeChangesetsToV3(
  database: Database.Database,
  migrationStartedAtMs: number
): void {
  const historyCommittedAt = hasTable(database, LEGACY_HISTORY_TABLE)
    ? `(SELECT committed_at FROM ${LEGACY_HISTORY_TABLE}
         WHERE unit_id = collaboration_worktree_changesets.unit_id
           AND revision = collaboration_worktree_changesets.revision)`
    : 'NULL'
  database
    .prepare(
      `UPDATE collaboration_worktree_changesets
       SET created_at_ms = COALESCE(
             CASE
               WHEN json_type(payload_json, '$.createTime') IN ('integer', 'real')
                 AND json_extract(payload_json, '$.createTime') >= 0
               THEN CASE
                 WHEN json_extract(payload_json, '$.createTime') >= ${CREATE_TIME_SECONDS_LIMIT}
                 THEN CAST(json_extract(payload_json, '$.createTime') AS INTEGER)
                 ELSE CAST(json_extract(payload_json, '$.createTime') AS INTEGER) * 1000
               END
             END,
             ${historyCommittedAt},
             ?
           )`
    )
    .run(migrationStartedAtMs)
}

function hasTable(database: Database.Database, tableName: string): boolean {
  return Boolean(
    database.prepare(`SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?`).get(tableName)
  )
}

function tableColumnNames(database: Database.Database, tableName: string): ReadonlySet<string> {
  return new Set(
    (database.prepare(`PRAGMA table_info(${tableName})`).all() as unknown as ColumnRow[]).map(
      ({ name }) => name
    )
  )
}

function addColumnIfMissing(
  database: Database.Database,
  tableName: string,
  columnName: string,
  definition: string
): void {
  if (tableColumnNames(database, tableName).has(columnName)) return
  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`)
}
