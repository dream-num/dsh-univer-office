import type Database from 'libsql'
import { runUniverfileSQLiteTransaction } from '../connection.ts'
import { HISTORY_SCHEMA_TABLE_DDL, HISTORY_SCHEMA_INDEX_DDL } from '../schema/history.ts'

const HISTORY_SCHEMA_COMPONENT = 'history'
const HISTORY_SCHEMA_VERSION = 2
const SCHEMA_VERSIONS_TABLE = 'collaboration_schema_versions'
const HISTORY_REVISIONS_TABLE = 'collaboration_history_revisions'

interface SchemaVersionRow {
  readonly version: number
}

interface HistoryUnitRow {
  readonly unit_id: string
}

/**
 * Convert History tables on an upgrade candidate before constructing current adapters.
 * A missing component row means a fresh database, which the adapter initializes directly.
 */
export function migrateUniverfileHistorySchema(database: Database.Database): void {
  runUniverfileSQLiteTransaction(database, () => {
    // A brand-new database has no schema version table yet; the Core migration creates it.
    if (!hasTable(database, SCHEMA_VERSIONS_TABLE)) return
    const row = database
      .prepare(
        `SELECT version
         FROM collaboration_schema_versions
         WHERE component = ?`
      )
      .get(HISTORY_SCHEMA_COMPONENT) as SchemaVersionRow | undefined
    if (row === undefined || row.version === HISTORY_SCHEMA_VERSION) return
    if (row.version !== 1) {
      throw new Error(`Unsupported .univer History schema version ${row.version}`)
    }
    if (!hasTable(database, HISTORY_REVISIONS_TABLE)) {
      throw new Error('.univer History schema v1 is missing its revisions table')
    }
    convertHistoryRevisionsToRecords(database)
    database
      .prepare(
        `UPDATE collaboration_schema_versions
         SET version = ?
         WHERE component = ?`
      )
      .run(HISTORY_SCHEMA_VERSION, HISTORY_SCHEMA_COMPONENT)
  })
}

/**
 * Rebuild v1 per-revision rows as v2 segment records, then drop the v1 table.
 *
 * A v1 row's `history_revision` was the start revision of the segment it belonged to, and the old
 * adapter only ever accepted rows with `history_revision <= revision`, so a segment start is exactly
 * a row where those two columns are equal. Every other row merely repeated that boundary, and its
 * commands are dropped with the per-revision storage because History now reads changesets from Core.
 *
 * A Unit whose rows reference a missing boundary cannot be indexed, and the changelog requires the whole
 * migration to fail rather than silently lose that Unit's history; the surrounding transaction then
 * rolls everything back. Both legacy indexes share their names with the v2 indexes, so they must be
 * dropped before the replacement indexes are created.
 */
function convertHistoryRevisionsToRecords(database: Database.Database): void {
  const unindexableUnits = database
    .prepare(
      `SELECT DISTINCT revisions.unit_id
       FROM collaboration_history_revisions AS revisions
       LEFT JOIN collaboration_history_revisions AS starts
         ON starts.unit_id = revisions.unit_id
        AND starts.revision = revisions.history_revision
        AND starts.history_revision = starts.revision
       WHERE starts.unit_id IS NULL`
    )
    .all() as unknown as HistoryUnitRow[]
  if (unindexableUnits.length > 0) {
    const unitIDs = unindexableUnits.map((row) => row.unit_id).join(', ')
    throw new Error(`.univer History revisions of ${unitIDs} have a missing segment start record`)
  }
  database.exec(`
    DROP INDEX IF EXISTS collaboration_history_record_lookup;
    DROP INDEX IF EXISTS collaboration_history_creator_lookup;

    ${HISTORY_SCHEMA_TABLE_DDL}

    INSERT INTO collaboration_history_records
      (unit_id, start_revision, user_id, created_at_ms, origin, additional_fields)
    SELECT unit_id, revision, user_id, committed_at, origin, additional_fields
    FROM collaboration_history_revisions
    WHERE history_revision = revision;

    ${HISTORY_SCHEMA_INDEX_DDL}

    DROP TABLE collaboration_history_revisions;
  `)
}

function hasTable(database: Database.Database, tableName: string): boolean {
  return (
    database
      .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
      .get(tableName) !== undefined
  )
}
