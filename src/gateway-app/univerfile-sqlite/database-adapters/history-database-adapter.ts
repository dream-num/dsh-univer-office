import type Database from "libsql";
import {
  buildHistoryRecords,
  selectHistoryRecords,
  type AppendHistoryRevisionResult,
  type HistoryCreatorIndex,
  type HistoryIndexState,
  type HistoryOrigin,
  type HistoryRevision,
  type IHistoryDatabaseAdapter,
  type ListHistoryRecordsOptions,
  type ListHistoryRecordsResult,
} from "@univerjs-pro/collaboration-history-service";
import type { UniverType } from "@univerjs/protocol";
import {
  UniverfileSQLiteConnection,
  runUniverfileSQLiteTransaction,
} from "../connection.js";

const HISTORY_SCHEMA_COMPONENT = "history";
const HISTORY_SCHEMA_VERSION = 1;

interface HistoryRow {
  readonly unit_id: string;
  readonly type: number;
  readonly revision: number;
  readonly user_id: string;
  readonly commands_json: string;
  readonly committed_at: number;
  readonly additional_fields: string | null;
  readonly origin: number;
  readonly history_revision: number;
  readonly force_next_history: number;
  readonly restored_revision: number | null;
}

interface LatestRevisionRow {
  readonly revision: number;
}

interface SchemaVersionRow {
  readonly version: number;
}

export interface UniverfileSQLiteHistoryDatabaseAdapterOptions {
  /** Borrow the `.univer` connection owned by the application. */
  readonly connection: UniverfileSQLiteConnection;
}

/**
 * Persistent, rebuildable History index stored beside the authoritative collaboration data.
 *
 * This adapter never owns or closes the shared `.univer` connection. History Service owns the
 * grouping policy; this class only provides its CAS persistence contract and Gateway repair seam.
 */
export class UniverfileSQLiteHistoryDatabaseAdapter implements IHistoryDatabaseAdapter {
  private readonly _database: Database.Database;
  private _disposed = false;

  public constructor(options: UniverfileSQLiteHistoryDatabaseAdapterOptions) {
    if (!(options?.connection instanceof UniverfileSQLiteConnection)) {
      throw new TypeError("History Database Adapter requires a .univer connection");
    }
    this._database = options.connection.database;
    this._initializeSchema();
  }

  public async getIndexState(unitID: string): Promise<HistoryIndexState | null> {
    this._assertOpen();
    const latest = this._latestEntry(unitID);
    if (latest === null) return null;
    const current = this._getEntry(unitID, latest.historyRevision);
    if (current === null) {
      throw new Error(`History index for ${unitID} references a missing grouped revision`);
    }
    return {
      unitID,
      type: latest.type,
      latestRevision: latest.revision,
      currentHistoryRevision: latest.historyRevision,
      currentHistoryCreatedAt: current.committedAt,
      forceNextHistory: latest.forceNextHistory,
    };
  }

  public async getRevision(unitID: string, revision: number): Promise<HistoryRevision | null> {
    this._assertOpen();
    return this._getEntry(unitID, revision);
  }

  public async appendRevision(
    entry: HistoryRevision,
    options: { readonly expectedLatestRevision: number },
  ): Promise<AppendHistoryRevisionResult> {
    this._assertOpen();
    validateEntry(entry);
    return runUniverfileSQLiteTransaction(this._database, () => {
      if (this._getEntry(entry.unitID, entry.revision) !== null) {
        return { status: "already-indexed" };
      }
      const actualLatestRevision = this._latestRevision(entry.unitID);
      if (
        actualLatestRevision !== options.expectedLatestRevision ||
        entry.revision !== actualLatestRevision + 1
      ) {
        return { status: "revision-conflict", actualLatestRevision };
      }
      this._database
        .prepare(
          `INSERT INTO collaboration_history_revisions
             (unit_id, type, revision, user_id, commands_json, committed_at,
              additional_fields, origin, history_revision, force_next_history,
              restored_revision)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          entry.unitID,
          entry.type,
          entry.revision,
          entry.userID,
          JSON.stringify(entry.commands),
          entry.committedAt,
          entry.additionalFields ?? null,
          entry.origin,
          entry.historyRevision,
          entry.forceNextHistory ? 1 : 0,
          entry.restoredRevision ?? null,
        );
      return { status: "appended" };
    });
  }

  public async listRecords(
    unitID: string,
    options: ListHistoryRecordsOptions,
  ): Promise<ListHistoryRecordsResult> {
    this._assertOpen();
    return selectHistoryRecords(buildHistoryRecords(this._listEntries(unitID)), options);
  }

  public async listCreators(unitID: string): Promise<readonly HistoryCreatorIndex[]> {
    this._assertOpen();
    const creators = new Map<string, Set<HistoryOrigin>>();
    for (const entry of this._listEntries(unitID)) {
      const origins = creators.get(entry.userID) ?? new Set<HistoryOrigin>();
      origins.add(entry.origin);
      creators.set(entry.userID, origins);
    }
    return [...creators].map(([userID, origins]) => ({ userID, origins: [...origins] }));
  }

  /** Remove one Unit's derived index so Gateway reconciliation can rebuild it from trunk. */
  public resetUnit(unitID: string): void {
    this._assertOpen();
    runUniverfileSQLiteTransaction(this._database, () => {
      this._database
        .prepare("DELETE FROM collaboration_history_revisions WHERE unit_id = ?")
        .run(unitID);
    });
  }

  public async dispose(): Promise<void> {
    this._disposed = true;
  }

  private _initializeSchema(): void {
    runUniverfileSQLiteTransaction(this._database, () => {
      const row = this._database
        .prepare(
          `SELECT version
           FROM collaboration_schema_versions
           WHERE component = ?`,
        )
        .get(HISTORY_SCHEMA_COMPONENT) as SchemaVersionRow | undefined;
      if (row !== undefined) {
        if (row.version !== HISTORY_SCHEMA_VERSION) {
          throw new Error(`Unsupported .univer History schema version ${row.version}`);
        }
        if (!this._hasTable("collaboration_history_revisions")) {
          throw new Error(".univer History schema v1 is missing its revisions table");
        }
        return;
      }
      if (this._hasTable("collaboration_history_revisions")) {
        throw new Error(".univer History table exists without a schema version");
      }
      this._database.exec(`
        CREATE TABLE collaboration_history_revisions (
          unit_id TEXT NOT NULL,
          type INTEGER NOT NULL,
          revision INTEGER NOT NULL CHECK (revision >= 1),
          user_id TEXT NOT NULL,
          commands_json TEXT NOT NULL,
          committed_at INTEGER NOT NULL CHECK (committed_at >= 0),
          additional_fields TEXT,
          origin INTEGER NOT NULL,
          history_revision INTEGER NOT NULL CHECK (history_revision >= 1),
          force_next_history INTEGER NOT NULL,
          restored_revision INTEGER,
          PRIMARY KEY (unit_id, revision)
        );

        CREATE INDEX collaboration_history_record_lookup
          ON collaboration_history_revisions(unit_id, history_revision DESC);
        CREATE INDEX collaboration_history_creator_lookup
          ON collaboration_history_revisions(unit_id, user_id);

        INSERT INTO collaboration_schema_versions (component, version)
        VALUES ('history', 1);
      `);
    });
  }

  private _listEntries(unitID: string): readonly HistoryRevision[] {
    return (
      this._database
        .prepare(
          `SELECT unit_id, type, revision, user_id, commands_json,
                  committed_at, additional_fields, origin, history_revision,
                  force_next_history, restored_revision
           FROM collaboration_history_revisions
           WHERE unit_id = ?
           ORDER BY revision ASC`,
        )
        .all(unitID) as unknown as HistoryRow[]
    ).map(rowToEntry);
  }

  private _latestRevision(unitID: string): number {
    const row = this._database
      .prepare(
        `SELECT revision
         FROM collaboration_history_revisions
         WHERE unit_id = ?
         ORDER BY revision DESC
         LIMIT 1`,
      )
      .get(unitID) as LatestRevisionRow | undefined;
    return row?.revision ?? 0;
  }

  private _latestEntry(unitID: string): HistoryRevision | null {
    const revision = this._latestRevision(unitID);
    return revision === 0 ? null : this._getEntry(unitID, revision);
  }

  private _getEntry(unitID: string, revision: number): HistoryRevision | null {
    const row = this._database
      .prepare(
        `SELECT unit_id, type, revision, user_id, commands_json,
                committed_at, additional_fields, origin, history_revision,
                force_next_history, restored_revision
         FROM collaboration_history_revisions
         WHERE unit_id = ? AND revision = ?`,
      )
      .get(unitID, revision) as HistoryRow | undefined;
    return row === undefined ? null : rowToEntry(row);
  }

  private _hasTable(tableName: string): boolean {
    return (
      this._database
        .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
        .get(tableName) !== undefined
    );
  }

  private _assertOpen(): void {
    if (this._disposed) throw new Error("History Database Adapter is disposed");
  }
}

function rowToEntry(row: HistoryRow): HistoryRevision {
  const commands = JSON.parse(row.commands_json) as unknown;
  if (!Array.isArray(commands) || commands.some((command) => typeof command !== "string")) {
    throw new Error(".univer History contains invalid commands");
  }
  if (row.origin !== 0 && row.origin !== 1 && row.origin !== 2) {
    throw new Error(".univer History contains an invalid origin");
  }
  return {
    unitID: row.unit_id,
    type: row.type as UniverType,
    revision: row.revision,
    userID: row.user_id,
    commands,
    committedAt: row.committed_at,
    ...(row.additional_fields === null ? {} : { additionalFields: row.additional_fields }),
    origin: row.origin,
    historyRevision: row.history_revision,
    forceNextHistory: row.force_next_history === 1,
    ...(row.restored_revision === null ? {} : { restoredRevision: row.restored_revision }),
  };
}

function validateEntry(entry: HistoryRevision): void {
  if (
    entry.unitID.length === 0 ||
    entry.userID.length === 0 ||
    !Number.isSafeInteger(entry.revision) ||
    entry.revision < 1 ||
    !Number.isSafeInteger(entry.historyRevision) ||
    entry.historyRevision < 1 ||
    entry.historyRevision > entry.revision ||
    !Number.isSafeInteger(entry.committedAt) ||
    entry.committedAt < 0
  ) {
    throw new TypeError("History revision entry is invalid");
  }
}
