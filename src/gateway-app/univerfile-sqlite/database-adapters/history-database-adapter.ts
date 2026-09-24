import { isDeepStrictEqual } from 'node:util'
import type Database from 'libsql'
import type {
  AppendHistoryRecordResult,
  HistoryCreatorIndex,
  HistoryDatabaseContext,
  HistoryOrigin,
  HistoryRecord,
  HistoryRecordRange,
  IHistoryDatabaseAdapter,
  ListHistoryRecordsOptions,
  ListHistoryRecordsResult
} from '@univerjs-pro/collaboration-history-service'
import { UniverfileSQLiteConnection, runUniverfileSQLiteTransaction } from '../connection.js'

const HISTORY_SCHEMA_COMPONENT = 'history'
const HISTORY_SCHEMA_VERSION = 2
const SCHEMA_VERSIONS_TABLE = 'collaboration_schema_versions'
const HISTORY_RECORDS_TABLE = 'collaboration_history_records'
const HISTORY_REVISIONS_TABLE = 'collaboration_history_revisions'

interface HistoryRecordRow {
  readonly unit_id: string
  readonly start_revision: number
  readonly user_id: string
  readonly created_at_ms: number
  readonly origin: number
  readonly additional_fields: string | null
}

interface HistoryPageRow extends HistoryRecordRow {
  readonly next_start_revision: number | null
}

interface HistoryCreatorRow {
  readonly user_id: string
  readonly origin: number
}

interface HistoryUnitRow {
  readonly unit_id: string
}

interface LatestStartRevisionRow {
  readonly start_revision: number
}

interface SchemaVersionRow {
  readonly version: number
}

/**
 * v2 History storage: one row per segment start.
 *
 * `endRevision` is deliberately absent. History Service derives a segment's end from the next
 * segment's `start_revision`, so persisting it would only add a range end that a repair pass has to
 * keep in sync. The record index serves `getLatestRecord` and the newest-first page scan in
 * `listRecords`; the creator index serves the grouping in `listCreators`. Both index names are the
 * ones registered as current v2 objects, so database pruning keeps them.
 *
 * `origin` intentionally carries no CHECK constraint: v1 accepted any integer there and validated it
 * on read, so adding one here would turn a single unreadable Unit into a migration-wide failure.
 */
const HISTORY_SCHEMA_TABLE_DDL = `
  CREATE TABLE collaboration_history_records (
    unit_id TEXT NOT NULL,
    start_revision INTEGER NOT NULL CHECK (start_revision >= 1),
    user_id TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
    origin INTEGER NOT NULL,
    additional_fields TEXT,
    PRIMARY KEY (unit_id, start_revision)
  );
`

const HISTORY_SCHEMA_INDEX_DDL = `
  CREATE INDEX collaboration_history_record_lookup
    ON collaboration_history_records(unit_id, start_revision DESC);
  CREATE INDEX collaboration_history_creator_lookup
    ON collaboration_history_records(unit_id, user_id);
`

export interface UniverfileSQLiteHistoryDatabaseAdapterOptions {
  /** Borrow the `.univer` connection owned by the application. */
  readonly connection: UniverfileSQLiteConnection
}

/**
 * Persistent, rebuildable History segment index stored beside the authoritative collaboration data.
 *
 * History Service owns the grouping policy: it appends one record per segment start and reads them
 * back newest-first, so this class stores boundaries only. `resetUnit` is the Gateway repair seam
 * that lets reconciliation drop one Unit's segments and rebuild them from trunk.
 *
 * This adapter never owns or closes the shared `.univer` connection.
 */
export class UniverfileSQLiteHistoryDatabaseAdapter implements IHistoryDatabaseAdapter {
  private readonly _database: Database.Database
  private _disposed = false

  public constructor(options: UniverfileSQLiteHistoryDatabaseAdapterOptions) {
    if (!(options?.connection instanceof UniverfileSQLiteConnection)) {
      throw new TypeError('History Database Adapter requires a .univer connection')
    }
    this._database = options.connection.database
    this._initializeSchema()
  }

  public async getLatestRecord(
    _context: HistoryDatabaseContext,
    unitID: string
  ): Promise<HistoryRecord | null> {
    this._assertOpen()
    const row = this._database
      .prepare(
        `SELECT unit_id, start_revision, user_id, created_at_ms, origin, additional_fields
         FROM collaboration_history_records
         WHERE unit_id = ?
         ORDER BY start_revision DESC
         LIMIT 1`
      )
      .get(unitID) as HistoryRecordRow | undefined
    return row === undefined ? null : rowToRecord(row)
  }

  public async appendRecord(
    _context: HistoryDatabaseContext,
    record: HistoryRecord,
    options: { readonly expectedLatestStartRevision: number | null }
  ): Promise<AppendHistoryRecordResult> {
    this._assertOpen()
    validateRecord(record)
    return runUniverfileSQLiteTransaction<AppendHistoryRecordResult>(this._database, () => {
      const existing = this._getRecord(record.unitID, record.startRevision)
      if (existing !== null) {
        // A retried identical append is idempotent; the same boundary with different facts is a
        // real clash, exactly as the reference adapter classifies it.
        return isDeepStrictEqual(existing, record)
          ? { status: 'already-exists' }
          : { status: 'conflict' }
      }
      const latest = this._latestStartRevision(record.unitID)
      if (latest !== options.expectedLatestStartRevision || record.startRevision <= (latest ?? 0)) {
        return { status: 'conflict' }
      }
      this._database
        .prepare(
          `INSERT INTO collaboration_history_records
             (unit_id, start_revision, user_id, created_at_ms, origin, additional_fields)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          record.unitID,
          record.startRevision,
          record.userID,
          record.createdAt,
          record.origin,
          record.additionalFields ?? null
        )
      return { status: 'appended' }
    })
  }

  public async listRecords(
    _context: HistoryDatabaseContext,
    unitID: string,
    options: ListHistoryRecordsOptions
  ): Promise<ListHistoryRecordsResult> {
    this._assertOpen()
    // `beforeRevision` is exclusive: pagination walks backwards from one revision below the previous
    // page's oldest segment start.
    const before = options.beforeRevision
    const upperBound =
      before === undefined ? options.throughRevision : Math.min(options.throughRevision, before - 1)
    const conditions = ['records.unit_id = ?', 'records.start_revision <= ?']
    const parameters: (string | number)[] = [unitID, upperBound]
    // The reference adapter only applies the origin filter when the origin is truthy, so `origin: 0`
    // lists every segment. Reproduced here so both adapters answer a request with the same page.
    if (options.origin !== undefined && options.origin !== 0) {
      conditions.push('records.origin = ?')
      parameters.push(options.origin)
    }
    const userIDs = [...new Set(options.userIDs ?? [])]
    if (userIDs.length > 0) {
      conditions.push(`records.user_id IN (${userIDs.map(() => '?').join(', ')})`)
      parameters.push(...userIDs)
    }
    const rows = this._database
      .prepare(
        `SELECT records.unit_id, records.start_revision, records.user_id,
                records.created_at_ms, records.origin, records.additional_fields,
                (SELECT MIN(next.start_revision)
                 FROM collaboration_history_records next
                 WHERE next.unit_id = records.unit_id
                   AND next.start_revision > records.start_revision) AS next_start_revision
         FROM collaboration_history_records records
         WHERE ${conditions.join(' AND ')}
         ORDER BY records.start_revision DESC
         LIMIT ?`
      )
      .all(...parameters, options.length + 1) as unknown as HistoryPageRow[]
    // Requesting one row beyond the page is how `hasMore` is decided: it is true only when another
    // *matching* segment exists below the page, matching the reference adapter's scan.
    const hasMore = rows.length > options.length
    const page = hasMore ? rows.slice(0, options.length) : rows
    return {
      records: page.map((row) => rowToRange(row, options.throughRevision)),
      hasMore
    }
  }

  public async listCreators(
    _context: HistoryDatabaseContext,
    unitID: string,
    options: { readonly throughRevision: number }
  ): Promise<readonly HistoryCreatorIndex[]> {
    this._assertOpen()
    const rows = this._database
      .prepare(
        `SELECT user_id, origin
         FROM collaboration_history_records
         WHERE unit_id = ? AND start_revision <= ?
         ORDER BY start_revision ASC`
      )
      .all(unitID, options.throughRevision) as unknown as HistoryCreatorRow[]
    // A creator is a segment's first author, so grouping follows the record's own `user_id` rather
    // than every user who edited inside the segment.
    const creators = new Map<string, Set<HistoryOrigin>>()
    for (const row of rows) {
      const origins = creators.get(row.user_id) ?? new Set<HistoryOrigin>()
      origins.add(toHistoryOrigin(row.origin))
      creators.set(row.user_id, origins)
    }
    return [...creators]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([userID, origins]) => ({
        userID,
        origins: [...origins].sort((left, right) => left - right)
      }))
  }

  /** Remove one Unit's segment index so Gateway reconciliation can rebuild it from trunk. */
  public resetUnit(unitID: string): void {
    this._assertOpen()
    runUniverfileSQLiteTransaction(this._database, () => {
      this._database
        .prepare('DELETE FROM collaboration_history_records WHERE unit_id = ?')
        .run(unitID)
    })
  }

  public async dispose(): Promise<void> {
    this._disposed = true
  }

  private _initializeSchema(): void {
    runUniverfileSQLiteTransaction(this._database, () => {
      const row = this._database
        .prepare(
          `SELECT version
           FROM collaboration_schema_versions
           WHERE component = ?`
        )
        .get(HISTORY_SCHEMA_COMPONENT) as SchemaVersionRow | undefined
      if (row !== undefined) {
        if (row.version !== HISTORY_SCHEMA_VERSION) {
          // v1 storage is only reachable through migrateUniverfileHistorySchema.
          throw new Error(`Unsupported .univer History schema version ${row.version}`)
        }
        if (!hasTable(this._database, HISTORY_RECORDS_TABLE)) {
          throw new Error('.univer History schema v2 is missing its records table')
        }
        return
      }
      if (
        hasTable(this._database, HISTORY_RECORDS_TABLE) ||
        hasTable(this._database, HISTORY_REVISIONS_TABLE)
      ) {
        throw new Error('.univer History table exists without a schema version')
      }
      this._database.exec(`
        ${HISTORY_SCHEMA_TABLE_DDL}
        ${HISTORY_SCHEMA_INDEX_DDL}
        INSERT INTO ${SCHEMA_VERSIONS_TABLE} (component, version)
        VALUES ('${HISTORY_SCHEMA_COMPONENT}', ${HISTORY_SCHEMA_VERSION});
      `)
    })
  }

  private _getRecord(unitID: string, startRevision: number): HistoryRecord | null {
    const row = this._database
      .prepare(
        `SELECT unit_id, start_revision, user_id, created_at_ms, origin, additional_fields
         FROM collaboration_history_records
         WHERE unit_id = ? AND start_revision = ?`
      )
      .get(unitID, startRevision) as HistoryRecordRow | undefined
    return row === undefined ? null : rowToRecord(row)
  }

  private _latestStartRevision(unitID: string): number | null {
    const row = this._database
      .prepare(
        `SELECT start_revision
         FROM collaboration_history_records
         WHERE unit_id = ?
         ORDER BY start_revision DESC
         LIMIT 1`
      )
      .get(unitID) as LatestStartRevisionRow | undefined
    return row?.start_revision ?? null
  }

  private _assertOpen(): void {
    if (this._disposed) throw new Error('History Database Adapter is disposed')
  }
}

/**
 * Upgrade the History component schema in place. Call before constructing the adapter.
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
 * A Unit whose rows contain no such boundary cannot be indexed, and the changelog requires the whole
 * migration to fail rather than silently lose that Unit's history; the surrounding transaction then
 * rolls everything back. Both legacy indexes share their names with the v2 indexes, so they must be
 * dropped before the replacement indexes are created.
 */
function convertHistoryRevisionsToRecords(database: Database.Database): void {
  const unindexableUnits = database
    .prepare(
      `SELECT DISTINCT unit_id
       FROM collaboration_history_revisions
       WHERE unit_id NOT IN (
         SELECT unit_id
         FROM collaboration_history_revisions
         WHERE history_revision = revision
       )`
    )
    .all() as unknown as HistoryUnitRow[]
  if (unindexableUnits.length > 0) {
    const unitIDs = unindexableUnits.map((row) => row.unit_id).join(', ')
    throw new Error(`.univer History revisions of ${unitIDs} have no segment start record`)
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

function rowToRecord(row: HistoryRecordRow): HistoryRecord {
  return {
    unitID: row.unit_id,
    startRevision: row.start_revision,
    userID: row.user_id,
    createdAt: row.created_at_ms,
    origin: toHistoryOrigin(row.origin),
    ...(row.additional_fields === null ? {} : { additionalFields: row.additional_fields })
  }
}

/**
 * A segment ends one revision before the next segment starts. The newest segment has no successor,
 * so its end is the queried `throughRevision`, which is what the reference adapter clamps to.
 */
function rowToRange(row: HistoryPageRow, throughRevision: number): HistoryRecordRange {
  const endRevision =
    row.next_start_revision === null
      ? throughRevision
      : Math.min(throughRevision, row.next_start_revision - 1)
  return { record: rowToRecord(row), endRevision }
}

function validateRecord(record: HistoryRecord): void {
  if (
    record.unitID.length === 0 ||
    record.userID.length === 0 ||
    !Number.isSafeInteger(record.startRevision) ||
    record.startRevision < 1 ||
    !Number.isSafeInteger(record.createdAt) ||
    record.createdAt < 0 ||
    !isHistoryOrigin(record.origin)
  ) {
    // Kept identical to the reference adapter's validator so both reject the same records.
    throw new TypeError('History record is invalid')
  }
}

function isHistoryOrigin(value: number): value is HistoryOrigin {
  return value === 0 || value === 1 || value === 2
}

function toHistoryOrigin(value: number): HistoryOrigin {
  if (!isHistoryOrigin(value)) {
    throw new Error('.univer History contains an invalid origin')
  }
  return value
}

function hasTable(database: Database.Database, tableName: string): boolean {
  return (
    database
      .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
      .get(tableName) !== undefined
  )
}
