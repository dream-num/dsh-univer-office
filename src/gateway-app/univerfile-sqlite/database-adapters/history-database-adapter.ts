import type Database from 'libsql'
import type {
  AppendHistoryRecordResult,
  HistoryCreatorIndex,
  HistoryDatabaseContext,
  HistoryOrigin,
  HistoryRecord,
  IHistoryDatabaseAdapter,
  ListHistoryRecordsOptions,
  ListHistoryRecordsResult
} from '@univerjs-pro/collaboration-history-service'
import { UniverfileSQLiteConnection, runUniverfileSQLiteTransaction } from '../connection.ts'

const HISTORY_SCHEMA_COMPONENT = 'history'
export const HISTORY_SCHEMA_VERSION = 2
export const HISTORY_RECORDS_TABLE = 'collaboration_history_records'

/** DDL shared by schema creation and the v2-to-v3 `.univer` upgrade. */
export const HISTORY_RECORDS_SCHEMA_SQL = `
  CREATE TABLE collaboration_history_records (
    unit_id TEXT NOT NULL,
    start_revision INTEGER NOT NULL CHECK (start_revision >= 1),
    user_id TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
    origin INTEGER NOT NULL,
    additional_fields TEXT,
    PRIMARY KEY (unit_id, start_revision)
  );

  CREATE INDEX collaboration_history_origin_lookup
    ON collaboration_history_records(unit_id, origin, start_revision);
  CREATE INDEX collaboration_history_creator_lookup
    ON collaboration_history_records(unit_id, user_id, start_revision);
`

interface HistoryRow {
  readonly unit_id: string
  readonly start_revision: number
  readonly user_id: string
  readonly created_at_ms: number
  readonly origin: number
  readonly additional_fields: string | null
}

interface SchemaVersionRow {
  readonly version: number
}

export interface UniverfileSQLiteHistoryDatabaseAdapterOptions {
  /** Borrow the `.univer` connection owned by the application. */
  readonly connection: UniverfileSQLiteConnection
}

/**
 * Persistent, rebuildable History boundaries stored beside the authoritative collaboration data.
 *
 * This adapter never owns or closes the shared `.univer` connection. History Service owns the
 * grouping policy; this class only provides its CAS persistence contract and Gateway repair seam.
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
    const row = this._latest(unitID)
    return row === undefined ? null : rowToRecord(row)
  }

  public async appendRecord(
    _context: HistoryDatabaseContext,
    record: HistoryRecord,
    options: { readonly expectedLatestStartRevision: number | null }
  ): Promise<AppendHistoryRecordResult> {
    this._assertOpen()
    validateRecord(record)
    return runUniverfileSQLiteTransaction(this._database, () => {
      const existing = this._database
        .prepare(
          `SELECT unit_id, start_revision, user_id, created_at_ms, origin, additional_fields
           FROM collaboration_history_records
           WHERE unit_id = ? AND start_revision = ?`
        )
        .get(record.unitID, record.startRevision) as HistoryRow | undefined
      if (existing !== undefined) {
        const same =
          existing.user_id === record.userID &&
          existing.created_at_ms === record.createdAt &&
          existing.origin === record.origin &&
          existing.additional_fields === (record.additionalFields ?? null)
        return { status: same ? 'already-exists' : 'conflict' }
      }
      const latest = this._latest(record.unitID)?.start_revision ?? null
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
    const parameters: Array<string | number> = [
      options.throughRevision,
      options.throughRevision,
      unitID,
      options.throughRevision
    ]
    const filters: string[] = []
    if (options.beforeRevision !== undefined) {
      filters.push('r.start_revision < ?')
      parameters.push(options.beforeRevision)
    }
    // The SDK adapters treat origin 0 as "any origin".
    if (options.origin) {
      filters.push('r.origin = ?')
      parameters.push(options.origin)
    }
    if (options.userIDs !== undefined && options.userIDs.length > 0) {
      filters.push(`r.user_id IN (${options.userIDs.map(() => '?').join(', ')})`)
      parameters.push(...options.userIDs)
    }
    parameters.push(options.length + 1)
    // End revisions come from the unfiltered successor, not the next row of this page.
    const rows = this._database
      .prepare(
        `SELECT r.unit_id, r.start_revision, r.user_id, r.created_at_ms, r.origin,
                r.additional_fields,
                MIN(?, COALESCE((
                  SELECT next.start_revision - 1
                  FROM collaboration_history_records AS next
                  WHERE next.unit_id = r.unit_id AND next.start_revision > r.start_revision
                  ORDER BY next.start_revision ASC
                  LIMIT 1
                ), ?)) AS end_revision
         FROM collaboration_history_records AS r
         WHERE r.unit_id = ? AND r.start_revision <= ?
           ${filters.length > 0 ? `AND ${filters.join(' AND ')}` : ''}
         ORDER BY r.start_revision DESC
         LIMIT ?`
      )
      .all(...parameters) as unknown as Array<HistoryRow & { readonly end_revision: number }>
    return {
      records: rows.slice(0, options.length).map((row) => ({
        record: rowToRecord(row),
        endRevision: row.end_revision
      })),
      hasMore: rows.length > options.length
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
        `SELECT DISTINCT user_id, origin
         FROM collaboration_history_records
         WHERE unit_id = ? AND start_revision <= ?
         ORDER BY user_id, origin`
      )
      .all(unitID, options.throughRevision) as unknown as Array<{
      readonly user_id: string
      readonly origin: number
    }>
    const creators = new Map<string, HistoryOrigin[]>()
    for (const row of rows) {
      const origins = creators.get(row.user_id) ?? []
      origins.push(toOrigin(row.origin))
      creators.set(row.user_id, origins)
    }
    return [...creators].map(([userID, origins]) => ({ userID, origins }))
  }

  /** Latest persisted boundary, or `null` when History Service has not initialized the Unit. */
  public latestStartRevision(unitID: string): number | null {
    this._assertOpen()
    return this._latest(unitID)?.start_revision ?? null
  }

  public async dispose(): Promise<void> {
    this._disposed = true
  }

  private _latest(unitID: string): HistoryRow | undefined {
    return this._database
      .prepare(
        `SELECT unit_id, start_revision, user_id, created_at_ms, origin, additional_fields
         FROM collaboration_history_records
         WHERE unit_id = ?
         ORDER BY start_revision DESC
         LIMIT 1`
      )
      .get(unitID) as HistoryRow | undefined
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
          throw new Error(`Unsupported .univer History schema version ${row.version}`)
        }
        if (!this._hasTable(HISTORY_RECORDS_TABLE)) {
          throw new Error(
            `.univer History schema v${HISTORY_SCHEMA_VERSION} is missing its records table`
          )
        }
        return
      }
      if (
        this._hasTable(HISTORY_RECORDS_TABLE) ||
        this._hasTable('collaboration_history_revisions')
      ) {
        throw new Error('.univer History table exists without a schema version')
      }
      this._database.exec(`
        ${HISTORY_RECORDS_SCHEMA_SQL}
        INSERT INTO collaboration_schema_versions (component, version)
        VALUES ('${HISTORY_SCHEMA_COMPONENT}', ${HISTORY_SCHEMA_VERSION});
      `)
    })
  }

  private _hasTable(tableName: string): boolean {
    return (
      this._database
        .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
        .get(tableName) !== undefined
    )
  }

  private _assertOpen(): void {
    if (this._disposed) throw new Error('History Database Adapter is disposed')
  }
}

function rowToRecord(row: HistoryRow): HistoryRecord {
  return {
    unitID: row.unit_id,
    startRevision: row.start_revision,
    userID: row.user_id,
    createdAt: row.created_at_ms,
    origin: toOrigin(row.origin),
    ...(row.additional_fields === null ? {} : { additionalFields: row.additional_fields })
  }
}

function toOrigin(value: number): HistoryOrigin {
  if (value !== 0 && value !== 1 && value !== 2) {
    throw new Error('.univer History contains an invalid origin')
  }
  return value
}

function validateRecord(record: HistoryRecord): void {
  if (
    record.unitID.length === 0 ||
    record.userID.length === 0 ||
    !Number.isSafeInteger(record.startRevision) ||
    record.startRevision < 1 ||
    !Number.isSafeInteger(record.createdAt) ||
    record.createdAt < 0 ||
    (record.origin !== 0 && record.origin !== 1 && record.origin !== 2)
  ) {
    throw new TypeError('History record is invalid')
  }
}
