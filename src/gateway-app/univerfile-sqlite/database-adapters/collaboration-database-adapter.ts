import type Database from "libsql";
import {
  CollabError,
  type ChangesetRange,
  type CommitChangesetInput,
  type CommitChangesetResult,
  type CreateUnitDatabaseInput,
  type CreateUnitDatabaseResult,
  type DatabaseContext,
  type DeleteUnitsDatabaseInput,
  type DeleteUnitsDatabaseResult,
  type IDatabaseAdapter,
  type RecoverUnitsDatabaseInput,
  type RecoverUnitsDatabaseResult,
  type SaveSnapshotInput,
  type UnitRecord,
} from "@univerjs-pro/collaboration-service";
import type { IChangeset, ISheetBlock, ISnapshot, UniverType } from "@univerjs/protocol";
import { UniverfileSQLiteConnection, runUniverfileSQLiteTransaction } from "../connection.js";

const BINARY_TAG = "__univerCollaborationBinary";
const CORE_SCHEMA_COMPONENT = "core";
const CORE_SCHEMA_VERSION = 1;
const CORE_TABLE_NAMES = [
  "collaboration_units",
  "collaboration_unit_tombstones",
  "collaboration_snapshots",
  "collaboration_changesets",
  "collaboration_sheet_blocks",
  "collaboration_resources",
] as const;
const PRE_DATABASE_V1_TABLE_NAMES = [
  "units",
  "changesets",
  "snapshots",
  "sheet_blocks",
  "worktrees",
  "worktree_commits",
  "worktree_changesets",
  "worktree_snapshots",
] as const;

interface UnitRow {
  readonly unit_id: string;
  readonly type: number;
  readonly name: string;
  readonly head_revision: number;
  readonly created_at_ms: number;
  readonly soft_deleted_at_ms: number | null;
}

interface PayloadRow {
  readonly payload_json: string;
}

interface SchemaVersionRow {
  readonly version: number;
}

interface ChangesetReadRow {
  readonly head_revision: number;
  readonly payload_json: string | null;
}

interface ColumnRow {
  readonly name: string;
}

export interface UniverfileSQLiteDatabaseAdapterOptions {
  /** SQLite filename or `:memory:`. The parent directory must already exist. */
  readonly filename: string;
  /** How long SQLite waits for another writer when this adapter opens its own connection. */
  readonly busyTimeoutMs?: number;
  /** Borrow a connection owned by the gateway instead of opening and closing another one. */
  readonly connection?: UniverfileSQLiteConnection;
}

/**
 * Node 22+ SQLite implementation of the collaboration persistence contract.
 *
 * The Node API is synchronous, while IDatabaseAdapter remains asynchronous so
 * applications can swap this adapter for a remote database implementation.
 */
export interface UniverfileUnitMetadata {
  readonly name?: string;
  /** Merge may create several Worktree Units in trunk under one SDK call. */
  readonly unitNames?: Readonly<Record<string, string>>;
  readonly createdAtMs?: number;
}

export interface UniverfileUnitSummary {
  readonly unitId: string;
  readonly type: UniverType;
  readonly name: string;
  readonly headRev: number;
  readonly createdAt: string;
}

/**
 * Gateway 通过 request customData 把产品 metadata 带到 SDK Database Adapter。
 * SDK 不解释该字段；CLI-owned Adapter 在创建 Unit 的同一事务中持久化。
 */
export const UNIVERFILE_UNIT_METADATA_KEY = "@univer/univerfile-sqlite/unit-metadata";

export class UniverfileSQLiteDatabaseAdapter implements IDatabaseAdapter {
  private readonly _connection: UniverfileSQLiteConnection;
  private readonly _database: Database.Database;
  private readonly _ownsConnection: boolean;
  private _disposed = false;

  constructor(options: UniverfileSQLiteDatabaseAdapterOptions) {
    validateOptions(options);
    this._ownsConnection = options.connection === undefined;
    this._connection =
      options.connection ??
      new UniverfileSQLiteConnection({
        filename: options.filename,
        ...(options.busyTimeoutMs === undefined ? {} : { busyTimeoutMs: options.busyTimeoutMs }),
      });
    this._database = this._connection.database;

    try {
      this._initializeSchema();
    } catch (error) {
      if (this._ownsConnection) {
        this._connection.dispose();
      }
      throw error;
    }
  }

  async getUnit(_context: DatabaseContext, unitID: string): Promise<UnitRecord | null> {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT unit_id, type, name, head_revision, created_at_ms, soft_deleted_at_ms
         FROM collaboration_units
         WHERE unit_id = ? AND soft_deleted_at_ms IS NULL`,
      )
      .get(unitID) as UnitRow | undefined;
    return row ? rowToUnitRecord(row) : null;
  }

  public listUnits(): readonly UniverfileUnitSummary[] {
    this._assertOpen();
    const rows = this._database
      .prepare(
        `SELECT unit_id, type, name, head_revision, created_at_ms, soft_deleted_at_ms
         FROM collaboration_units
         WHERE soft_deleted_at_ms IS NULL
         ORDER BY created_at_ms ASC, unit_id ASC`,
      )
      .all() as unknown as UnitRow[];
    return rows.map(rowToUnitSummary);
  }

  public getChangeset(unitID: string, revision: number): IChangeset | undefined {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT payload_json
         FROM collaboration_changesets
         WHERE unit_id = ? AND revision = ?`,
      )
      .get(unitID, revision) as PayloadRow | undefined;
    return row ? decode<IChangeset>(row.payload_json) : undefined;
  }

  public getChangesetBySid(unitID: string, sid: string, reqId: number): IChangeset | undefined {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT payload_json
         FROM collaboration_changesets
         WHERE unit_id = ? AND sid = ? AND req_id = ?`,
      )
      .get(unitID, sid, reqId) as PayloadRow | undefined;
    return row ? decode<IChangeset>(row.payload_json) : undefined;
  }

  async getSnapshot(
    _context: DatabaseContext,
    unitID: string,
    options?: { readonly revision?: number },
  ): Promise<ISnapshot | null> {
    this._assertOpen();
    const requestedRevision = options?.revision;
    if (requestedRevision !== undefined && requestedRevision < 0) {
      throw invalidRequest("Snapshot revision cannot be negative");
    }

    const unit = this._getActiveUnitRow(unitID);
    if (!unit) {
      return null;
    }
    const targetRevision =
      requestedRevision === undefined || requestedRevision === 0
        ? unit.head_revision
        : Math.min(requestedRevision, unit.head_revision);
    const row = this._database
      .prepare(
        `SELECT collaboration_snapshots.payload_json
         FROM collaboration_snapshots
         JOIN collaboration_units
           ON collaboration_units.unit_id = collaboration_snapshots.unit_id
         WHERE collaboration_snapshots.unit_id = ?
           AND collaboration_snapshots.revision <= ?
           AND collaboration_units.soft_deleted_at_ms IS NULL
         ORDER BY collaboration_snapshots.revision DESC
         LIMIT 1`,
      )
      .get(unitID, targetRevision) as PayloadRow | undefined;
    return row ? decode<ISnapshot>(row.payload_json) : null;
  }

  async getChangesets(
    _context: DatabaseContext,
    unitID: string,
    range: { readonly from: number; readonly to: number },
  ): Promise<ChangesetRange> {
    this._assertOpen();
    if (range.from < 0 || range.to < 0) {
      throw invalidRequest("Changeset range revisions cannot be negative");
    }

    const rows = this._database
      .prepare(
        `SELECT collaboration_units.head_revision,
                collaboration_changesets.payload_json
         FROM collaboration_units
         LEFT JOIN collaboration_changesets
           ON collaboration_changesets.unit_id = collaboration_units.unit_id
          AND collaboration_changesets.revision > ?
          AND collaboration_changesets.revision <= CASE
            WHEN ? = 0 THEN collaboration_units.head_revision
            ELSE MIN(?, collaboration_units.head_revision)
          END
         WHERE collaboration_units.unit_id = ?
           AND collaboration_units.soft_deleted_at_ms IS NULL
         ORDER BY collaboration_changesets.revision ASC`,
      )
      .all(range.from, range.to, range.to, unitID) as unknown as ChangesetReadRow[];
    const head = rows[0];
    if (!head) {
      return { changesets: [], latestRevision: 0 };
    }
    return {
      changesets: rows.flatMap((row) =>
        row.payload_json ? [decode<IChangeset>(row.payload_json)] : [],
      ),
      latestRevision: head.head_revision,
    };
  }

  async getSubmission(
    _context: DatabaseContext,
    unitID: string,
    sid: string,
    reqId: number,
  ): Promise<IChangeset | null> {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT collaboration_changesets.payload_json
         FROM collaboration_changesets
         JOIN collaboration_units
           ON collaboration_units.unit_id = collaboration_changesets.unit_id
         WHERE collaboration_changesets.unit_id = ?
           AND collaboration_changesets.sid = ?
           AND collaboration_changesets.req_id = ?
           AND collaboration_units.soft_deleted_at_ms IS NULL`,
      )
      .get(unitID, sid, reqId) as PayloadRow | undefined;
    return row ? decode<IChangeset>(row.payload_json) : null;
  }

  async createUnit(
    context: DatabaseContext,
    input: CreateUnitDatabaseInput,
  ): Promise<CreateUnitDatabaseResult> {
    this._assertOpen();
    validateInitialUnit(input);

    const snapshotPayload = encode(input.snapshot);
    const blocks = (input.sheetBlocks ?? []).map((block) => ({
      id: block.id,
      payload: encode(block),
    }));
    return this._transaction(() => {
      if (this._hasTombstone(input.record.unitID)) {
        throw invalidRequest("Cannot reuse a hard-deleted unit ID");
      }
      const existing = this._getStoredUnitRow(input.record.unitID);
      if (existing) {
        if (existing.soft_deleted_at_ms !== null) {
          throw invalidRequest("Cannot reuse a soft-deleted unit ID");
        }
        return { status: "already-exists", record: rowToUnitRecord(existing) };
      }

      const metadata = readUnitMetadata(context, input.record.unitID);
      this._database
        .prepare(
          `INSERT INTO collaboration_units
             (unit_id, type, name, head_revision, created_at_ms, soft_deleted_at_ms)
           VALUES (?, ?, ?, 1, ?, NULL)`,
        )
        .run(input.record.unitID, input.record.type, metadata.name, metadata.createdAtMs);
      this._writeSheetBlocks(input.record.unitID, blocks);
      this._database
        .prepare(
          `INSERT INTO collaboration_snapshots
             (unit_id, revision, type, payload_json)
           VALUES (?, 1, ?, ?)`,
        )
        .run(input.record.unitID, input.record.type, snapshotPayload);

      return { status: "created", record: { ...input.record } };
    });
  }

  async deleteUnits(
    _context: DatabaseContext,
    input: DeleteUnitsDatabaseInput,
  ): Promise<DeleteUnitsDatabaseResult> {
    this._assertOpen();

    return this._transaction(() => {
      const units = uniqueUnitIDs(input.unitIDs).map((unitID) => {
        const unit = this._getStoredUnitRow(unitID);
        if (!unit) {
          if (input.hardDelete && this._hasTombstone(unitID)) {
            return { unitID, status: "already-hard-deleted" as const };
          }
          throw new CollabError("UNIT_NOT_FOUND", "Cannot delete a missing unit");
        }

        if (input.hardDelete) {
          return { unitID, status: "hard-deleted" as const };
        }
        return {
          unitID,
          status:
            unit.soft_deleted_at_ms === null
              ? ("soft-deleted" as const)
              : ("already-soft-deleted" as const),
        };
      });

      const softDelete = this._database.prepare(
        `UPDATE collaboration_units
         SET soft_deleted_at_ms = ?
         WHERE unit_id = ? AND soft_deleted_at_ms IS NULL`,
      );
      const insertTombstone = this._database.prepare(
        `INSERT INTO collaboration_unit_tombstones (unit_id, purged_at)
         VALUES (?, ?)`,
      );
      const deleteUnit = this._database.prepare(
        "DELETE FROM collaboration_units WHERE unit_id = ?",
      );
      const purgedAt = Date.now();

      for (const unit of units) {
        if (unit.status === "soft-deleted") {
          softDelete.run(purgedAt, unit.unitID);
        } else if (unit.status === "hard-deleted") {
          insertTombstone.run(unit.unitID, purgedAt);
          deleteUnit.run(unit.unitID);
        }
      }

      return { units };
    });
  }

  async recoverUnits(
    _context: DatabaseContext,
    input: RecoverUnitsDatabaseInput,
  ): Promise<RecoverUnitsDatabaseResult> {
    this._assertOpen();

    return this._transaction(() => {
      const units = uniqueUnitIDs(input.unitIDs).map((unitID) => {
        const unit = this._getStoredUnitRow(unitID);
        if (!unit) {
          if (this._hasTombstone(unitID)) {
            throw invalidRequest("Cannot recover a hard-deleted unit");
          }
          throw new CollabError("UNIT_NOT_FOUND", "Cannot recover a missing unit");
        }
        return {
          unitID,
          status:
            unit.soft_deleted_at_ms === null ? ("already-active" as const) : ("recovered" as const),
        };
      });

      const recover = this._database.prepare(
        `UPDATE collaboration_units
         SET soft_deleted_at_ms = NULL
         WHERE unit_id = ? AND soft_deleted_at_ms IS NOT NULL`,
      );
      for (const unit of units) {
        if (unit.status === "recovered") {
          recover.run(unit.unitID);
        }
      }

      return { units };
    });
  }

  async commitChangeset(
    context: DatabaseContext,
    input: CommitChangesetInput,
  ): Promise<CommitChangesetResult> {
    this._assertOpen();
    validateSubmissionIdentity(input.changeset);
    const payload = encode(input.changeset);

    return this._transaction(() => {
      const { changeset, expectedHeadRevision } = input;
      const unit = this._getActiveUnitRow(changeset.unitID);
      if (!unit) {
        throw new CollabError("UNIT_NOT_FOUND", "Cannot commit to a missing unit");
      }

      const existing = this._database
        .prepare(
          `SELECT payload_json
           FROM collaboration_changesets
           WHERE unit_id = ? AND sid = ? AND req_id = ?`,
        )
        .get(changeset.unitID, changeset.sid as string, changeset.reqId as number) as
        | PayloadRow
        | undefined;
      if (existing) {
        return {
          status: "already-committed",
          changeset: decode<IChangeset>(existing.payload_json),
        };
      }

      if (unit.head_revision !== expectedHeadRevision) {
        return {
          status: "revision-mismatch",
          actualHeadRevision: unit.head_revision,
        };
      }

      validateCandidate(rowToUnitRecord(unit), input);
      this._database
        .prepare(
          `INSERT INTO collaboration_changesets
             (unit_id, revision, base_revision, sid, req_id, payload_json)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          changeset.unitID,
          changeset.revision,
          changeset.baseRev,
          changeset.sid as string,
          changeset.reqId as number,
          payload,
        );
      const update = this._database
        .prepare(
          `UPDATE collaboration_units
           SET head_revision = ?, name = COALESCE(?, name)
           WHERE unit_id = ?
             AND head_revision = ?
             AND soft_deleted_at_ms IS NULL`,
        )
        .run(
          changeset.revision,
          readOptionalUnitName(context, changeset.unitID) ?? null,
          changeset.unitID,
          expectedHeadRevision,
        );
      if (update.changes !== 1) {
        throw new CollabError(
          "INTERNAL_ERROR",
          "SQLite head changed inside an exclusive write transaction",
        );
      }

      return {
        status: "committed",
        changeset: decode<IChangeset>(payload),
        headRevision: changeset.revision,
      };
    });
  }

  async saveSnapshot(_context: DatabaseContext, input: SaveSnapshotInput): Promise<void> {
    this._assertOpen();
    const snapshotPayload = encode(input.snapshot);
    const blocks = (input.sheetBlocks ?? []).map((block) => ({
      id: block.id,
      payload: encode(block),
    }));
    this._transaction(() => {
      const unit = this._getActiveUnitRow(input.snapshot.unitID);
      if (!unit) {
        throw new CollabError("UNIT_NOT_FOUND", "Cannot snapshot a missing unit");
      }
      if (
        input.snapshot.type !== unit.type ||
        input.snapshot.rev < 1 ||
        input.snapshot.rev > unit.head_revision
      ) {
        throw invalidRequest("Snapshot does not match the stored unit head");
      }

      this._writeSheetBlocks(input.snapshot.unitID, blocks);
      this._database
        .prepare(
          `INSERT INTO collaboration_snapshots
             (unit_id, revision, type, payload_json)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(unit_id, revision) DO UPDATE SET
             type = excluded.type,
             payload_json = excluded.payload_json`,
        )
        .run(input.snapshot.unitID, input.snapshot.rev, input.snapshot.type, snapshotPayload);
    });
  }

  async getSheetBlock(
    _context: DatabaseContext,
    unitID: string,
    blockID: string,
  ): Promise<ISheetBlock | null> {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT collaboration_sheet_blocks.payload_json
         FROM collaboration_sheet_blocks
         JOIN collaboration_units
           ON collaboration_units.unit_id = collaboration_sheet_blocks.unit_id
         WHERE collaboration_sheet_blocks.unit_id = ?
           AND collaboration_sheet_blocks.block_id = ?
           AND collaboration_units.soft_deleted_at_ms IS NULL`,
      )
      .get(unitID, blockID) as PayloadRow | undefined;
    return row ? decode<ISheetBlock>(row.payload_json) : null;
  }

  async dispose(): Promise<void> {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    if (this._ownsConnection) {
      this._connection.dispose();
    }
  }

  private _initializeSchema(): void {
    this._transaction(() => {
      const hasVersionTable = this._hasTable("collaboration_schema_versions");
      if (!hasVersionTable) {
        this._assertNoPreDatabaseV1Tables();
        if (this._hasAnyCoreTable()) {
          throw incompatibleSchema(
            "SQLite collaboration core tables exist without a schema version",
          );
        }
        this._database.exec(`
          CREATE TABLE collaboration_schema_versions (
            component TEXT PRIMARY KEY,
            version INTEGER NOT NULL CHECK (version >= 1)
          );
        `);
      }

      const row = this._database
        .prepare(
          `SELECT version
           FROM collaboration_schema_versions
           WHERE component = ?`,
        )
        .get(CORE_SCHEMA_COMPONENT) as SchemaVersionRow | undefined;
      if (row) {
        if (row.version !== CORE_SCHEMA_VERSION) {
          throw incompatibleSchema(
            `SQLite collaboration core schema version ${row.version} is not supported`,
          );
        }
        const missingTables = CORE_TABLE_NAMES.filter((tableName) => !this._hasTable(tableName));
        if (missingTables.length > 0) {
          throw incompatibleSchema(
            `SQLite collaboration core schema v1 is incomplete: missing ${missingTables.join(", ")}`,
          );
        }
        this._assertGatewayColumns();
        return;
      }

      this._assertNoPreDatabaseV1Tables();
      if (this._hasAnyCoreTable()) {
        throw incompatibleSchema("SQLite collaboration core tables exist without a schema version");
      }

      this._database.exec(`
        CREATE TABLE collaboration_units (
          unit_id TEXT PRIMARY KEY,
          type INTEGER NOT NULL,
          name TEXT NOT NULL,
          head_revision INTEGER NOT NULL CHECK (head_revision >= 1),
          created_at_ms INTEGER NOT NULL,
          soft_deleted_at_ms INTEGER
        );

        CREATE TABLE collaboration_unit_tombstones (
          unit_id TEXT PRIMARY KEY,
          purged_at INTEGER NOT NULL
        );

        CREATE TABLE collaboration_snapshots (
          unit_id TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK (revision >= 1),
          type INTEGER NOT NULL,
          payload_json TEXT NOT NULL,
          PRIMARY KEY (unit_id, revision),
          FOREIGN KEY (unit_id)
            REFERENCES collaboration_units(unit_id) ON DELETE CASCADE
        );

        CREATE TABLE collaboration_changesets (
          unit_id TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK (revision >= 2),
          base_revision INTEGER NOT NULL CHECK (base_revision >= 1),
          sid TEXT NOT NULL,
          req_id INTEGER NOT NULL CHECK (req_id >= 1),
          payload_json TEXT NOT NULL,
          PRIMARY KEY (unit_id, revision),
          UNIQUE (unit_id, sid, req_id),
          FOREIGN KEY (unit_id)
            REFERENCES collaboration_units(unit_id) ON DELETE CASCADE
        );

        CREATE TABLE collaboration_sheet_blocks (
          unit_id TEXT NOT NULL,
          block_id TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          PRIMARY KEY (unit_id, block_id),
          FOREIGN KEY (unit_id)
            REFERENCES collaboration_units(unit_id) ON DELETE CASCADE
        );

        CREATE TABLE collaboration_resources (
          unit_id TEXT NOT NULL,
          resource_id TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          PRIMARY KEY (unit_id, resource_id),
          FOREIGN KEY (unit_id)
            REFERENCES collaboration_units(unit_id) ON DELETE CASCADE
        );

        CREATE INDEX collaboration_snapshots_nearest_revision
          ON collaboration_snapshots(unit_id, revision DESC);
        CREATE INDEX collaboration_changesets_revision_range
          ON collaboration_changesets(unit_id, revision ASC);

        INSERT INTO collaboration_schema_versions (component, version)
        VALUES ('core', 1);
      `);
    });
  }

  private _getActiveUnitRow(unitID: string): UnitRow | null {
    const row = this._database
      .prepare(
        `SELECT unit_id, type, name, head_revision, created_at_ms, soft_deleted_at_ms
         FROM collaboration_units
         WHERE unit_id = ? AND soft_deleted_at_ms IS NULL`,
      )
      .get(unitID) as UnitRow | undefined;
    return row ?? null;
  }

  private _getStoredUnitRow(unitID: string): UnitRow | null {
    const row = this._database
      .prepare(
        `SELECT unit_id, type, name, head_revision, created_at_ms, soft_deleted_at_ms
         FROM collaboration_units
         WHERE unit_id = ?`,
      )
      .get(unitID) as UnitRow | undefined;
    return row ?? null;
  }

  private _hasTombstone(unitID: string): boolean {
    return Boolean(
      this._database
        .prepare("SELECT 1 FROM collaboration_unit_tombstones WHERE unit_id = ?")
        .get(unitID),
    );
  }

  private _hasTable(tableName: string): boolean {
    return Boolean(
      this._database
        .prepare(
          `SELECT 1
           FROM sqlite_schema
           WHERE type = 'table' AND name = ?`,
        )
        .get(tableName),
    );
  }

  private _hasAnyCoreTable(): boolean {
    return CORE_TABLE_NAMES.some((tableName) => this._hasTable(tableName));
  }

  private _assertNoPreDatabaseV1Tables(): void {
    const incompatibleTables = PRE_DATABASE_V1_TABLE_NAMES.filter((tableName) =>
      this._hasTable(tableName),
    );
    if (incompatibleTables.length > 0) {
      throw incompatibleSchema(
        `Pre-database-v1 Gateway schema is not supported: ${incompatibleTables.join(", ")}`,
      );
    }
  }

  private _assertGatewayColumns(): void {
    const columns = new Set(
      (
        this._database
          .prepare("PRAGMA table_info(collaboration_units)")
          .all() as unknown as ColumnRow[]
      ).map(({ name }) => name),
    );
    const missing = ["name", "created_at_ms"].filter((column) => !columns.has(column));
    if (missing.length > 0) {
      throw incompatibleSchema(
        `SQLite collaboration core database v1 is missing CLI columns: ${missing.join(", ")}`,
      );
    }
  }

  private _writeSheetBlocks(
    unitID: string,
    blocks: readonly { readonly id: string; readonly payload: string }[],
  ): void {
    const blockStatement = this._database.prepare(
      `INSERT INTO collaboration_sheet_blocks
         (unit_id, block_id, payload_json)
       VALUES (?, ?, ?)
       ON CONFLICT(unit_id, block_id) DO UPDATE SET
         payload_json = excluded.payload_json`,
    );
    for (const block of blocks) {
      blockStatement.run(unitID, block.id, block.payload);
    }
  }

  private _transaction<T>(operation: () => T): T {
    return runUniverfileSQLiteTransaction(this._database, operation);
  }

  private _assertOpen(): void {
    if (this._disposed) {
      throw new CollabError("INTERNAL_ERROR", "SQLite Database Adapter is disposed");
    }
  }
}

function validateOptions(options: UniverfileSQLiteDatabaseAdapterOptions): void {
  if (!options.filename) {
    throw invalidRequest("SQLite filename is required");
  }
  if (
    options.busyTimeoutMs !== undefined &&
    (!Number.isSafeInteger(options.busyTimeoutMs) || options.busyTimeoutMs < 0)
  ) {
    throw invalidRequest("SQLite busyTimeoutMs must be a non-negative integer");
  }
  if (options.connection !== undefined && options.connection.filename !== options.filename) {
    throw invalidRequest("Shared SQLite connection filename does not match adapter filename");
  }
  if (options.connection !== undefined && options.busyTimeoutMs !== undefined) {
    throw invalidRequest("Shared SQLite connection owns busyTimeoutMs configuration");
  }
}

function validateInitialUnit(input: CreateUnitDatabaseInput): void {
  const { record, snapshot } = input;
  if (
    record.headRevision !== 1 ||
    snapshot.rev !== 1 ||
    snapshot.unitID !== record.unitID ||
    snapshot.type !== record.type
  ) {
    throw invalidRequest("Initial unit record and snapshot must match at revision 1");
  }
}

function validateSubmissionIdentity(changeset: IChangeset): void {
  if (!changeset.sid || !Number.isSafeInteger(changeset.reqId) || (changeset.reqId as number) < 1) {
    throw invalidRequest("Changeset sid and positive integer reqId are required");
  }
}

function validateCandidate(record: UnitRecord, input: CommitChangesetInput): void {
  const { changeset, expectedHeadRevision } = input;
  if (
    changeset.type !== record.type ||
    changeset.baseRev !== expectedHeadRevision ||
    changeset.revision !== expectedHeadRevision + 1
  ) {
    throw invalidRequest("Confirmed changeset must match the unit type and expected revision");
  }
}

function rowToUnitRecord(row: UnitRow): UnitRecord {
  return {
    unitID: row.unit_id,
    type: row.type as UniverType,
    headRevision: row.head_revision,
  };
}

function rowToUnitSummary(row: UnitRow): UniverfileUnitSummary {
  return {
    unitId: row.unit_id,
    type: row.type as UniverType,
    name: row.name,
    headRev: row.head_revision,
    createdAt: new Date(row.created_at_ms).toISOString(),
  };
}

function readUnitMetadata(
  context: DatabaseContext,
  unitID: string,
): { readonly name: string; readonly createdAtMs: number } {
  const value = context.customData[UNIVERFILE_UNIT_METADATA_KEY] as
    | UniverfileUnitMetadata
    | undefined;
  const name =
    typeof value?.unitNames?.[unitID] === "string" && value.unitNames[unitID]!.length > 0
      ? value.unitNames[unitID]!
      : typeof value?.name === "string" && value.name.length > 0
        ? value.name
        : unitID;
  const createdAtMs =
    value?.createdAtMs !== undefined &&
    Number.isSafeInteger(value.createdAtMs) &&
    value.createdAtMs >= 0
      ? value.createdAtMs
      : Date.now();
  return { name, createdAtMs };
}

function readOptionalUnitName(context: DatabaseContext, unitID: string): string | undefined {
  const value = context.customData[UNIVERFILE_UNIT_METADATA_KEY] as
    | UniverfileUnitMetadata
    | undefined;
  return typeof value?.unitNames?.[unitID] === "string"
    ? value.unitNames[unitID]
    : typeof value?.name === "string"
      ? value.name
      : undefined;
}

function invalidRequest(message: string): CollabError {
  return new CollabError("INVALID_REQUEST", message);
}

function incompatibleSchema(message: string): CollabError {
  return new CollabError("INTERNAL_ERROR", message);
}

function uniqueUnitIDs(unitIDs: readonly string[]): readonly string[] {
  return [...new Set(unitIDs)];
}

function encode(value: unknown): string {
  return JSON.stringify(value, (_key, current: unknown) => {
    if (current instanceof Uint8Array) {
      return {
        [BINARY_TAG]: Buffer.from(current).toString("base64"),
      };
    }
    return current;
  });
}

function decode<T>(payload: string): T {
  return JSON.parse(payload, (_key, current: unknown) => {
    if (isBinaryEncoding(current)) {
      return Uint8Array.from(Buffer.from(current[BINARY_TAG], "base64"));
    }
    return current;
  }) as T;
}

function isBinaryEncoding(value: unknown): value is Record<typeof BINARY_TAG, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.keys(value).length === 1 &&
    typeof (value as Record<string, unknown>)[BINARY_TAG] === "string"
  );
}
