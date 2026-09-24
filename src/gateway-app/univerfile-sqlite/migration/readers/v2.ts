import type Database from 'libsql'
import type { UniverfileSQLiteConnection } from '../../connection.ts'
import { runUniverfileSQLiteTransaction } from '../../connection.ts'
import {
  coreChangesetsTableSql,
  coreUnitsTableSql
} from '../../database-adapters/collaboration-database-adapter.ts'
import {
  HISTORY_RECORDS_SCHEMA_SQL,
  HISTORY_SCHEMA_VERSION
} from '../../database-adapters/history-database-adapter.ts'
import {
  worktreeChangesetsTableSql,
  worktreeUnitsTableSql
} from '../../database-adapters/worktree-database-adapter.ts'

const LEGACY_HISTORY_TABLE = 'collaboration_history_revisions'
/** Values at or above this are Unix milliseconds; Unix seconds stay below it until year 5138. */
const MILLISECOND_THRESHOLD = 100_000_000_000
/** Creator the SDK migrations record when no legacy History names one. */
export const ANONYMOUS_CREATOR_ID = 'anonymous'

interface UnitRow {
  readonly unit_id: string
  readonly head_revision: number
  readonly creator_id: string
  readonly created_at_ms: number
}

interface ChangesetTimeRow {
  readonly scope_id: string
  readonly unit_id: string
  readonly revision: number
  readonly create_time: unknown
  readonly legacy_committed_at: number | null
}

interface LegacyHistoryRow {
  readonly unit_id: string
  readonly revision: number
  readonly user_id: string
  readonly origin: number
  readonly history_revision: number
  readonly additional_fields: string | null
}

interface HistoryStart {
  readonly startRevision: number
  readonly userID: string
  readonly origin: number
  readonly additionalFields: string | null
}

/**
 * Converts a Collaboration SDK rc `.univer` layout (core v1, worktree v2, history v1) in place.
 *
 * Unit records gain their creator, and changesets gain `created_at_ms` with `createTime` in Unix
 * seconds. History keeps the segment starts it can prove and leaves any other Unit to History
 * Service's lazy initialization.
 */
export function migrateV2CandidateToV3(connection: UniverfileSQLiteConnection): void {
  const { database } = connection
  const hasLegacyHistory = hasTable(database, LEGACY_HISTORY_TABLE)
  database.exec('PRAGMA foreign_keys = OFF;')
  try {
    runUniverfileSQLiteTransaction(database, () => {
      rebuildCoreUnits(database, hasLegacyHistory)
      rebuildWorktreeUnits(database)
      rebuildChangesetTables(database)
      normalizeAllChangesetCreateTimes(database)
      if (hasLegacyHistory) migrateHistory(database)
      database.exec(`
        UPDATE collaboration_schema_versions SET version = 2
        WHERE component = 'core' AND version = 1;
        UPDATE collaboration_schema_versions SET version = 3
        WHERE component = 'worktree' AND version = 2;
      `)
    })
  } finally {
    database.exec('PRAGMA foreign_keys = ON;')
  }
  if (database.prepare('PRAGMA foreign_key_check').get() !== undefined) {
    throw new Error('v2 to v3 migration produced a foreign-key violation')
  }
}

/** Matches the SDK Core migration: the creator is the legacy History author of revision 1. */
function rebuildCoreUnits(database: Database.Database, hasLegacyHistory: boolean): void {
  const creator = hasLegacyHistory
    ? `COALESCE(NULLIF((SELECT history.user_id FROM ${LEGACY_HISTORY_TABLE} AS history
                        WHERE history.unit_id = units.unit_id AND history.revision = 1), ''),
                '${ANONYMOUS_CREATOR_ID}')`
    : `'${ANONYMOUS_CREATOR_ID}'`
  database.exec(`
    ${coreUnitsTableSql('collaboration_units_v3')}

    INSERT INTO collaboration_units_v3
      (unit_id, type, name, head_revision, creator_id, created_at_ms, soft_deleted_at_ms)
    SELECT units.unit_id, units.type, units.name, units.head_revision,
           ${creator},
           units.created_at_ms, units.soft_deleted_at_ms
    FROM collaboration_units AS units;

    DROP TABLE collaboration_units;
    ALTER TABLE collaboration_units_v3 RENAME TO collaboration_units;
  `)
}

/**
 * Matches the SDK Worktree migration: trunk-sourced Units take the trunk creation identity, and
 * Worktree-created Units have no recorded author.
 */
function rebuildWorktreeUnits(database: Database.Database): void {
  database.exec(`
    ${worktreeUnitsTableSql('collaboration_worktree_units_v3')}

    INSERT INTO collaboration_worktree_units_v3
      (worktree_id, unit_id, unit_order, type, name, creator_id, created_at_ms, source,
       baseline_trunk_revision, draft_head_revision, ready_draft_head_revision, merge_result_json)
    SELECT units.worktree_id, units.unit_id, units.unit_order, units.type, units.name,
           CASE
             WHEN units.source = 'trunk'
               THEN COALESCE(trunk.creator_id, '${ANONYMOUS_CREATOR_ID}')
             ELSE '${ANONYMOUS_CREATOR_ID}'
           END,
           CASE
             WHEN units.source = 'trunk' THEN COALESCE(trunk.created_at_ms, units.created_at_ms)
             ELSE units.created_at_ms
           END,
           units.source, units.baseline_trunk_revision, units.draft_head_revision,
           units.ready_draft_head_revision, units.merge_result_json
    FROM collaboration_worktree_units AS units
    LEFT JOIN collaboration_units AS trunk ON trunk.unit_id = units.unit_id;

    DROP TABLE collaboration_worktree_units;
    ALTER TABLE collaboration_worktree_units_v3 RENAME TO collaboration_worktree_units;
  `)
}

/** `created_at_ms` starts at 0 here; `normalizeAllChangesetCreateTimes` fills it. */
function rebuildChangesetTables(database: Database.Database): void {
  database.exec(`
    ${coreChangesetsTableSql('collaboration_changesets_v3')}

    INSERT INTO collaboration_changesets_v3
      (unit_id, revision, base_revision, sid, req_id, payload_json, created_at_ms)
    SELECT unit_id, revision, base_revision, sid, req_id, payload_json, 0
    FROM collaboration_changesets;

    DROP TABLE collaboration_changesets;
    ALTER TABLE collaboration_changesets_v3 RENAME TO collaboration_changesets;
    CREATE INDEX collaboration_changesets_revision_range
      ON collaboration_changesets(unit_id, revision ASC);

    ${worktreeChangesetsTableSql('collaboration_worktree_changesets_v3')}

    INSERT INTO collaboration_worktree_changesets_v3
      (worktree_id, unit_id, revision, base_revision, sid, req_id, payload_json, created_at_ms)
    SELECT worktree_id, unit_id, revision, base_revision, sid, req_id, payload_json, 0
    FROM collaboration_worktree_changesets;

    DROP TABLE collaboration_worktree_changesets;
    ALTER TABLE collaboration_worktree_changesets_v3 RENAME TO collaboration_worktree_changesets;
    CREATE INDEX collaboration_worktree_changesets_revision
      ON collaboration_worktree_changesets(worktree_id, unit_id, revision ASC);
  `)
}

/**
 * History grouping reads `createTime` as Unix seconds. Earlier CLI builds wrote milliseconds or
 * nothing. Like the SDK migrations, a missing value takes the legacy History commit time for trunk
 * changesets and otherwise the migration start time.
 */
export function normalizeChangesetCreateTimes(database: Database.Database): void {
  runUniverfileSQLiteTransaction(database, () => normalizeAllChangesetCreateTimes(database))
}

function normalizeAllChangesetCreateTimes(database: Database.Database): void {
  const migrationStartedAtMs = Date.now()
  const legacyCommittedAt = hasTable(database, LEGACY_HISTORY_TABLE)
    ? `(SELECT history.committed_at FROM ${LEGACY_HISTORY_TABLE} AS history
        WHERE history.unit_id = changesets.unit_id AND history.revision = changesets.revision)`
    : 'NULL'
  const updateCore = database.prepare(
    `UPDATE collaboration_changesets
     SET payload_json = json_set(payload_json, '$.createTime', ?), created_at_ms = ?
     WHERE unit_id = ? AND revision = ?`
  )
  const coreRows = database
    .prepare(
      `SELECT '' AS scope_id, unit_id, revision,
              json_extract(payload_json, '$.createTime') AS create_time,
              ${legacyCommittedAt} AS legacy_committed_at
       FROM collaboration_changesets AS changesets`
    )
    .all() as unknown as ChangesetTimeRow[]
  for (const row of coreRows) {
    const milliseconds = changesetMilliseconds(row, migrationStartedAtMs)
    updateCore.run(Math.floor(milliseconds / 1000), milliseconds, row.unit_id, row.revision)
  }

  const updateWorktree = database.prepare(
    `UPDATE collaboration_worktree_changesets
     SET payload_json = json_set(payload_json, '$.createTime', ?), created_at_ms = ?
     WHERE worktree_id = ? AND unit_id = ? AND revision = ?`
  )
  const worktreeRows = database
    .prepare(
      `SELECT worktree_id AS scope_id, unit_id, revision,
              json_extract(payload_json, '$.createTime') AS create_time,
              NULL AS legacy_committed_at
       FROM collaboration_worktree_changesets`
    )
    .all() as unknown as ChangesetTimeRow[]
  for (const row of worktreeRows) {
    const milliseconds = changesetMilliseconds(row, migrationStartedAtMs)
    updateWorktree.run(
      Math.floor(milliseconds / 1000),
      milliseconds,
      row.scope_id,
      row.unit_id,
      row.revision
    )
  }
}

function changesetMilliseconds(row: ChangesetTimeRow, fallbackMs: number): number {
  return toMilliseconds(row.create_time) ?? toMilliseconds(row.legacy_committed_at) ?? fallbackMs
}

function toMilliseconds(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  const milliseconds = Math.floor(value >= MILLISECOND_THRESHOLD ? value : value * 1000)
  return Number.isSafeInteger(milliseconds) ? milliseconds : undefined
}

/**
 * Rc History stored every indexed revision and marked segment starts with
 * `history_revision = revision`. The SDK stores only the starts, and revision 1 belongs to the
 * creation record alone.
 */
function migrateHistory(database: Database.Database): void {
  const units = database
    .prepare(
      `SELECT unit_id, head_revision, creator_id, created_at_ms
       FROM collaboration_units
       ORDER BY unit_id ASC`
    )
    .all() as unknown as UnitRow[]
  const legacyRows = database
    .prepare(
      `SELECT unit_id, revision, user_id, origin, history_revision, additional_fields
       FROM ${LEGACY_HISTORY_TABLE}
       ORDER BY unit_id ASC, revision ASC`
    )
    .all() as unknown as LegacyHistoryRow[]
  const rowsByUnit = new Map<string, LegacyHistoryRow[]>()
  for (const row of legacyRows) {
    const rows = rowsByUnit.get(row.unit_id) ?? []
    rows.push(row)
    rowsByUnit.set(row.unit_id, rows)
  }
  const createTime = database.prepare(
    `SELECT json_extract(payload_json, '$.createTime') AS create_time
     FROM collaboration_changesets
     WHERE unit_id = ? AND revision = ?`
  )

  database.exec(`
    DROP TABLE ${LEGACY_HISTORY_TABLE};
    ${HISTORY_RECORDS_SCHEMA_SQL}
    UPDATE collaboration_schema_versions SET version = ${HISTORY_SCHEMA_VERSION}
    WHERE component = 'history';
  `)
  const insert = database.prepare(
    `INSERT INTO collaboration_history_records
       (unit_id, start_revision, user_id, created_at_ms, origin, additional_fields)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  for (const unit of units) {
    const starts = historyStarts(unit, rowsByUnit.get(unit.unit_id) ?? [])
    if (starts === null) continue
    insert.run(unit.unit_id, 1, unit.creator_id, unit.created_at_ms, 1, null)
    for (const start of starts) {
      const row = createTime.get(unit.unit_id, start.startRevision) as
        | { readonly create_time: number }
        | undefined
      if (row === undefined) {
        throw new Error(`trunk changeset ${unit.unit_id}@${start.startRevision} is missing`)
      }
      insert.run(
        unit.unit_id,
        start.startRevision,
        start.userID,
        row.create_time * 1000,
        start.origin,
        start.additionalFields
      )
    }
  }
}

/**
 * Returns the starts after revision 1, or `null` when the Unit's rc History cannot be trusted and
 * History Service should rebuild it from trunk.
 */
function historyStarts(
  unit: UnitRow,
  rows: readonly LegacyHistoryRow[]
): readonly HistoryStart[] | null {
  const indexed = rows.filter((row) => row.revision <= unit.head_revision)
  if (indexed.length === 0) return null
  const valid = indexed.every(
    (row, index) =>
      row.revision === index + 1 &&
      row.history_revision >= 1 &&
      row.history_revision <= row.revision &&
      indexed[row.history_revision - 1]!.history_revision === row.history_revision &&
      (row.origin === 0 || row.origin === 1 || row.origin === 2) &&
      row.user_id.length > 0
  )
  if (!valid) return null
  return indexed
    .filter(
      (row) => row.revision >= 2 && (row.revision === 2 || row.history_revision === row.revision)
    )
    .map((row) => ({
      startRevision: row.revision,
      userID: row.user_id,
      origin: row.origin,
      additionalFields: row.additional_fields
    }))
}

function hasTable(database: Database.Database, tableName: string): boolean {
  return (
    database
      .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
      .get(tableName) !== undefined
  )
}
