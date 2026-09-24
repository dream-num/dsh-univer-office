import type Database from 'libsql'
import { runUniverfileSQLiteTransaction } from '../connection.ts'
import { UniverfileSQLiteError } from '../errors.ts'
import {
  coreUnitsTableDdl,
  coreChangesetsTableDdl,
  CORE_CHANGESETS_REVISION_INDEX_DDL
} from '../schema/core.ts'
import { ANONYMOUS_CREATOR_ID, toUnixMilliseconds } from './legacy-creation.ts'

const CORE_SCHEMA_COMPONENT = 'core'
const CORE_SCHEMA_VERSION = 2
/** Scratch tables for the v1 → v2 rebuild; they exist only inside the migration transaction. */
const CORE_UNITS_REBUILD_TABLE = 'collaboration_units_migrating_v2'
const CORE_CHANGESETS_REBUILD_TABLE = 'collaboration_changesets_migrating_v2'
/** `collaboration_units` as the v1 schema stored it, before `creator_id` existed. */
interface LegacyUnitRow {
  readonly unit_id: string
  readonly type: number
  readonly name: string
  readonly head_revision: number
  readonly created_at_ms: number
  readonly soft_deleted_at_ms: number | null
}

/** `collaboration_changesets` as the v1 schema stored it, before `created_at_ms` existed. */
interface LegacyChangesetRow {
  readonly unit_id: string
  readonly revision: number
  readonly base_revision: number
  readonly sid: string
  readonly req_id: number
  readonly payload_json: string
}

interface LegacyHistoryCreatorRow {
  readonly user_id: string
}

interface LegacyHistoryCommitRow {
  readonly committed_at: number
}

interface SchemaVersionRow {
  readonly version: number
}

/**
 * Convert the Core tables on an upgrade candidate before constructing current adapters.
 * A missing component row means a fresh database, which the adapter initializes directly.
 *
 * Must not run inside a caller-owned transaction while foreign key enforcement is on: the v1 → v2
 * rebuild has to switch enforcement off, which SQLite only accepts outside a transaction.
 */
export function migrateUniverfileCoreSchema(database: Database.Database): void {
  if (!hasTable(database, 'collaboration_schema_versions')) {
    // No component has initialized this database yet, so the adapter creates the v2 schema itself.
    return
  }
  // Decided up front so a database that is already current never touches foreign key enforcement.
  const version = readCoreSchemaVersion(database)
  if (version === undefined || version === CORE_SCHEMA_VERSION) {
    return
  }
  if (version !== 1) {
    throw new UniverfileSQLiteError(
      'UNSUPPORTED_SCHEMA',
      `SQLite collaboration core schema version ${version} is not supported`
    )
  }

  // Both new columns are NOT NULL, which `ALTER TABLE ADD COLUMN` cannot add without a constant
  // default, so the affected tables are rebuilt. With foreign keys enforced, `DROP TABLE
  // collaboration_units` performs an implicit DELETE FROM that cascades into snapshots,
  // change-sets, sheet blocks, and resources. That pragma has no effect inside a transaction, so
  // enforcement is switched around the migration transaction and restored afterwards.
  const foreignKeysEnforced = isForeignKeyEnforcementEnabled(database)
  if (foreignKeysEnforced) {
    if (database.inTransaction) {
      throw new Error(
        'Core schema migration must run outside a transaction while foreign keys are enforced'
      )
    }
    database.exec('PRAGMA foreign_keys = OFF;')
  }
  // Change-sets that record no time are backfilled with the instant the migration started, taken
  // once so the whole upgrade shares one origin.
  const migrationStartedAtMs = Date.now()
  try {
    runUniverfileSQLiteTransaction(database, () => {
      if (readCoreSchemaVersion(database) !== 1) {
        return
      }

      migrateCoreUnitsToV2(database)
      migrateCoreChangesetsToV2(database, migrationStartedAtMs)
      database
        .prepare(
          `UPDATE collaboration_schema_versions
           SET version = ?
           WHERE component = ?`
        )
        .run(CORE_SCHEMA_VERSION, CORE_SCHEMA_COMPONENT)
    })
  } finally {
    if (foreignKeysEnforced) {
      database.exec('PRAGMA foreign_keys = ON;')
    }
  }
}

function readCoreSchemaVersion(database: Database.Database): number | undefined {
  const row = database
    .prepare(
      `SELECT version
       FROM collaboration_schema_versions
       WHERE component = ?`
    )
    .get(CORE_SCHEMA_COMPONENT) as SchemaVersionRow | undefined
  return row?.version
}

/**
 * Rebuilds `collaboration_units` with the v2 `creator_id`. The creator is the `user_id` the legacy
 * History row for revision 1 recorded; Core migrates before History, so that v1 table is still
 * readable here, and a database without it falls back to the anonymous creator.
 */
function migrateCoreUnitsToV2(database: Database.Database): void {
  const legacyCreator = hasTable(database, 'collaboration_history_revisions')
    ? database.prepare(
        `SELECT user_id
         FROM collaboration_history_revisions
         WHERE unit_id = ? AND revision = 1`
      )
    : undefined
  const units = database
    .prepare(
      `SELECT unit_id, type, name, head_revision, created_at_ms, soft_deleted_at_ms
       FROM collaboration_units`
    )
    .all() as unknown as LegacyUnitRow[]

  database.exec(`
    DROP TABLE IF EXISTS ${CORE_UNITS_REBUILD_TABLE};
    ${coreUnitsTableDdl(CORE_UNITS_REBUILD_TABLE)}
  `)
  const insert = database.prepare(
    `INSERT INTO ${CORE_UNITS_REBUILD_TABLE}
       (unit_id, type, name, head_revision, creator_id, created_at_ms, soft_deleted_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  for (const unit of units) {
    insert.run(
      unit.unit_id,
      unit.type,
      unit.name,
      unit.head_revision,
      readLegacyCreatorID(legacyCreator, unit.unit_id) ?? ANONYMOUS_CREATOR_ID,
      unit.created_at_ms,
      unit.soft_deleted_at_ms
    )
  }

  database.exec(`
    DROP TABLE collaboration_units;
    ALTER TABLE ${CORE_UNITS_REBUILD_TABLE} RENAME TO collaboration_units;
  `)
}

/**
 * Rebuilds `collaboration_changesets` with the v2 `created_at_ms`. A payload `createTime` wins over
 * the legacy History `committed_at`, and the migration start time covers rows that record neither.
 */
function migrateCoreChangesetsToV2(
  database: Database.Database,
  migrationStartedAtMs: number
): void {
  const legacyCommitTime = hasTable(database, 'collaboration_history_revisions')
    ? database.prepare(
        `SELECT committed_at
         FROM collaboration_history_revisions
         WHERE unit_id = ? AND revision = ?`
      )
    : undefined

  database.exec(`
    DROP TABLE IF EXISTS ${CORE_CHANGESETS_REBUILD_TABLE};
    ${coreChangesetsTableDdl(CORE_CHANGESETS_REBUILD_TABLE)}
  `)
  const insert = database.prepare(
    `INSERT INTO ${CORE_CHANGESETS_REBUILD_TABLE}
       (unit_id, revision, base_revision, sid, req_id, payload_json, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  // Payloads can carry whole commands, so the legacy rows are streamed instead of collected first.
  const rows = database
    .prepare(
      `SELECT unit_id, revision, base_revision, sid, req_id, payload_json
       FROM collaboration_changesets`
    )
    .iterate() as unknown as IterableIterator<LegacyChangesetRow>
  for (const row of rows) {
    insert.run(
      row.unit_id,
      row.revision,
      row.base_revision,
      row.sid,
      row.req_id,
      row.payload_json,
      readChangesetCreatedAtMs(row.payload_json) ??
        readLegacyCommitTimeMs(legacyCommitTime, row.unit_id, row.revision) ??
        migrationStartedAtMs
    )
  }

  database.exec(`
    DROP TABLE collaboration_changesets;
    ALTER TABLE ${CORE_CHANGESETS_REBUILD_TABLE} RENAME TO collaboration_changesets;
    ${CORE_CHANGESETS_REVISION_INDEX_DDL}
  `)
}

/**
 * Reads the creation time a legacy change-set payload carries. Only that field is needed, so the
 * payload is parsed without the binary reviver a full decode applies.
 */
function readChangesetCreatedAtMs(payloadJson: string): number | undefined {
  const parsed: unknown = JSON.parse(payloadJson)
  if (typeof parsed !== 'object' || parsed === null) {
    return undefined
  }
  const createTime = (parsed as { readonly createTime?: unknown }).createTime
  return typeof createTime === 'number' ? toUnixMilliseconds(createTime) : undefined
}

/** Reads the creator the legacy History table recorded for revision 1, which created the Unit. */
function readLegacyCreatorID(
  statement: Database.Statement | undefined,
  unitID: string
): string | undefined {
  if (statement === undefined) {
    return undefined
  }
  const row = statement.get(unitID) as LegacyHistoryCreatorRow | undefined
  if (row === undefined || typeof row.user_id !== 'string' || row.user_id.length === 0) {
    return undefined
  }
  return row.user_id
}

/** Reads the legacy History commit time of one revision, which is already Unix milliseconds. */
function readLegacyCommitTimeMs(
  statement: Database.Statement | undefined,
  unitID: string,
  revision: number
): number | undefined {
  if (statement === undefined) {
    return undefined
  }
  const row = statement.get(unitID, revision) as LegacyHistoryCommitRow | undefined
  if (row === undefined || !Number.isSafeInteger(row.committed_at) || row.committed_at < 0) {
    return undefined
  }
  return row.committed_at
}

function hasTable(database: Database.Database, tableName: string): boolean {
  return Boolean(
    database
      .prepare(
        `SELECT 1
         FROM sqlite_schema
         WHERE type = 'table' AND name = ?`
      )
      .get(tableName)
  )
}

function isForeignKeyEnforcementEnabled(database: Database.Database): boolean {
  const row = database.prepare('PRAGMA foreign_keys').get() as
    | { readonly foreign_keys: number }
    | undefined
  return row?.foreign_keys === 1
}
