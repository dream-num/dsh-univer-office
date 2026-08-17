import { isDeepStrictEqual } from "node:util";
import type Database from "libsql";
import {
  CollabError,
  type ChangesetRange,
  type DatabaseContext,
} from "@univerjs-pro/collaboration-service";
import type {
  AddWorktreeUnitDatabaseInput,
  AddWorktreeUnitDatabaseResult,
  CommitWorktreeChangesetInput,
  CommitWorktreeChangesetResult,
  CreateWorktreeDatabaseInput,
  CreateWorktreeDatabaseResult,
  CreateWorktreeUnitDatabaseInput,
  CreateWorktreeUnitDatabaseResult,
  IWorktreeDatabaseAdapter,
  RecordUnitMergeResultInput,
  RecordUnitMergeResultResult,
  SaveWorktreeUnitMergeArtifactInput,
  SaveWorktreeUnitMergeArtifactResult,
  StartMergeResult,
  WorktreeAggregateRecord,
  WorktreeRevisionRange,
  WorktreeTransitionResult,
  WorktreeUnitMergeResult,
  WorktreeUnitMergeArtifact,
  WorktreeUnitRecord,
  WorktreeUnitSeed,
} from "@univerjs-pro/collaboration-worktree-service";
import { UniverType, type IChangeset } from "@univerjs/protocol";
import { UniverfileSQLiteConnection, runUniverfileSQLiteTransaction } from "../connection.js";

const SCHEMA_COMPONENT = "worktree";
const SCHEMA_VERSION = 2;
const TABLE_NAMES = [
  "collaboration_worktrees",
  "collaboration_worktree_units",
  "collaboration_worktree_changesets",
  "collaboration_worktree_unit_seeds",
  "collaboration_worktree_unit_merge_artifacts",
  "collaboration_worktree_deleted_units",
] as const;
const BINARY_TAG = "__univerCollaborationBinary";

const SUPPORTED_UNIT_TYPES = new Set<UniverType>([
  UniverType.UNIVER_SHEET,
  UniverType.UNIVER_DOC,
  UniverType.UNIVER_SLIDE,
  UniverType.UNIVER_BOARD,
  UniverType.UNIVER_BASE,
]);

interface WorktreeRow {
  readonly worktree_id: string;
  readonly sid: string;
  readonly status: string;
  readonly agent_id: string;
  readonly name: string;
  readonly created_at_ms: number;
  readonly merged_at_ms: number | null;
}

interface WorktreeUnitRow {
  readonly worktree_id: string;
  readonly unit_id: string;
  readonly name: string;
  readonly created_at_ms: number;
  readonly type: number;
  readonly source: string;
  readonly baseline_trunk_revision: number;
  readonly draft_head_revision: number;
  readonly ready_draft_head_revision: number | null;
  readonly merge_result_json: string | null;
}

interface PayloadRow {
  readonly payload_json: string;
}

interface SeedRow {
  readonly snapshot_json: string;
  readonly sheet_blocks_json: string | null;
}

interface MergeArtifactRow extends SeedRow {
  readonly ready_draft_head_revision: number;
}

interface SchemaVersionRow {
  readonly version: number;
}

interface ColumnRow {
  readonly name: string;
}

interface DeletedUnitRow {
  readonly worktree_id: string;
  readonly unit_id: string;
  readonly type: number;
  readonly name: string;
  readonly source: string;
  readonly baseline_trunk_revision: number;
  readonly deleted_at_ms: number;
}

export interface UniverfileSQLiteWorktreeDatabaseAdapterOptions {
  /** SQLite filename or `:memory:`. The parent directory must already exist. */
  readonly filename: string;
  /** How long SQLite waits for another writer when this adapter opens its own connection. */
  readonly busyTimeoutMs?: number;
  /** Borrow a connection owned by the gateway instead of opening and closing another one. */
  readonly connection?: UniverfileSQLiteConnection;
}

/**
 * 使用 SQLite 写事务实现 Worktree 的状态转换、Draft CAS 与 merge result 原子契约。
 */
export interface UniverfileWorktreeMetadata {
  readonly agentId?: string;
  readonly name?: string;
  readonly createdAtMs?: number;
  readonly unitNames?: Readonly<Record<string, string>>;
}

export interface UniverfileWorktreeChangeMetadata {
  readonly createdAtMs?: number;
  readonly unitName?: string;
}

export interface UniverfileWorktreeSummary {
  readonly worktreeId: string;
  readonly status: "draft" | "ready" | "merging" | "merged" | "discarded";
  readonly agentId: string;
  readonly name: string;
  readonly baseline: Readonly<Record<string, number>>;
  readonly createdAt: string;
  readonly mergedAt?: string;
}

export interface UniverfileWorktreeUnitSummary {
  readonly unitId: string;
  readonly type: UniverType;
  readonly name: string;
  readonly headRev: number;
}

export interface UniverfileDeletedWorktreeUnit {
  readonly unitId: string;
  readonly type: UniverType;
  readonly name: string;
  readonly deleteFromTrunk: boolean;
}

export type DeleteWorktreeUnitResult =
  | { readonly status: "deleted" | "already-deleted" }
  | { readonly status: "not-found" | "not-editable" };

export const UNIVERFILE_WORKTREE_METADATA_KEY = "@univer/univerfile-sqlite/worktree-metadata";
export const UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY =
  "@univer/univerfile-sqlite/worktree-change-metadata";

export class UniverfileSQLiteWorktreeDatabaseAdapter implements IWorktreeDatabaseAdapter {
  private readonly _connection: UniverfileSQLiteConnection;
  private readonly _database: Database.Database;
  private readonly _ownsConnection: boolean;
  private _disposed = false;

  constructor(options: UniverfileSQLiteWorktreeDatabaseAdapterOptions) {
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

  async getWorktree(
    _context: DatabaseContext,
    worktreeID: string,
  ): Promise<WorktreeAggregateRecord | null> {
    this._assertOpen();
    return this._getAggregate(worktreeID);
  }

  public listWorktrees(status?: string): readonly UniverfileWorktreeSummary[] {
    this._assertOpen();
    const rows = (status === undefined
      ? this._database
          .prepare(
            `SELECT worktree_id, sid, status, agent_id, name,
                      created_at_ms, merged_at_ms
               FROM collaboration_worktrees
               ORDER BY created_at_ms ASC, worktree_id ASC`,
          )
          .all()
      : this._database
          .prepare(
            `SELECT worktree_id, sid, status, agent_id, name,
                      created_at_ms, merged_at_ms
               FROM collaboration_worktrees
               WHERE status = ?
               ORDER BY created_at_ms ASC, worktree_id ASC`,
          )
          .all(status)) as unknown as WorktreeRow[];
    return rows.map((row) => this._rowToGatewaySummary(row));
  }

  public listWorktreeUnits(worktreeID: string): readonly UniverfileWorktreeUnitSummary[] {
    this._assertOpen();
    return this._getUnitRows(worktreeID).map((row) => ({
      unitId: row.unit_id,
      type: row.type as UniverType,
      name: row.name,
      headRev: row.draft_head_revision,
    }));
  }

  public listDeletedUnits(worktreeID: string): readonly UniverfileDeletedWorktreeUnit[] {
    this._assertOpen();
    return this._getDeletedUnitRows(worktreeID).map((row) => ({
      unitId: row.unit_id,
      type: row.type as UniverType,
      name: row.name,
      deleteFromTrunk: row.source === "trunk",
    }));
  }

  async getWorktreeUnit(
    _context: DatabaseContext,
    worktreeID: string,
    unitID: string,
  ): Promise<WorktreeUnitRecord | null> {
    this._assertOpen();
    const row = this._getUnitRow(worktreeID, unitID);
    return row ? rowToUnitRecord(row) : null;
  }

  async getDraftChangesets(
    _context: DatabaseContext,
    worktreeID: string,
    unitID: string,
    range: WorktreeRevisionRange,
  ): Promise<ChangesetRange> {
    this._assertOpen();
    validateRange(range);
    const unit = this._getUnitRow(worktreeID, unitID);
    if (!unit) return { changesets: [], latestRevision: 0 };
    const to =
      range.to === 0 ? unit.draft_head_revision : Math.min(range.to, unit.draft_head_revision);
    const rows = this._database
      .prepare(
        `SELECT payload_json
         FROM collaboration_worktree_changesets
         WHERE worktree_id = ? AND unit_id = ?
           AND revision > ? AND revision <= ?
         ORDER BY revision ASC`,
      )
      .all(worktreeID, unitID, range.from, to) as unknown as PayloadRow[];
    return {
      changesets: rows.map(({ payload_json }) => decode<IChangeset>(payload_json)),
      latestRevision: unit.draft_head_revision,
    };
  }

  async getDraftSubmission(
    _context: DatabaseContext,
    worktreeID: string,
    unitID: string,
    sid: string,
    reqId: number,
  ): Promise<IChangeset | null> {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT payload_json
         FROM collaboration_worktree_changesets
         WHERE worktree_id = ? AND unit_id = ? AND sid = ? AND req_id = ?`,
      )
      .get(worktreeID, unitID, sid, reqId) as PayloadRow | undefined;
    return row ? decode<IChangeset>(row.payload_json) : null;
  }

  async getUnitSeed(
    _context: DatabaseContext,
    worktreeID: string,
    unitID: string,
  ): Promise<WorktreeUnitSeed | null> {
    this._assertOpen();
    return this._getUnitSeed(worktreeID, unitID);
  }

  async getUnitMergeArtifact(
    _context: DatabaseContext,
    worktreeID: string,
    unitID: string,
  ): Promise<WorktreeUnitMergeArtifact | null> {
    this._assertOpen();
    return this._getUnitMergeArtifact(worktreeID, unitID);
  }

  async createWorktree(
    context: DatabaseContext,
    input: CreateWorktreeDatabaseInput,
  ): Promise<CreateWorktreeDatabaseResult> {
    return this.createWorktreeForGateway(context, input);
  }

  /**
   * Synchronous compatibility entry used by the existing Gateway control facade. libsql completes
   * the transaction before returning, so initialization errors propagate to the caller instead of
   * becoming an ignored rejected Promise.
   */
  public createWorktreeForGateway(
    context: DatabaseContext,
    input: CreateWorktreeDatabaseInput,
  ): CreateWorktreeDatabaseResult {
    this._assertOpen();
    validateCreateInput(input);
    return this._transaction(() => {
      const existing = this._getAggregate(input.record.worktreeID);
      if (existing) {
        return { status: "already-exists", aggregate: existing };
      }
      const metadata = readWorktreeMetadata(context);
      this._database
        .prepare(
          `INSERT INTO collaboration_worktrees
             (worktree_id, sid, status, agent_id, name,
              created_at_ms, merged_at_ms)
           VALUES (?, ?, 'draft', ?, ?, ?, NULL)`,
        )
        .run(
          input.record.worktreeID,
          input.record.sid,
          metadata.agentId,
          metadata.name,
          metadata.createdAtMs,
        );
      const insertUnit = this._database.prepare(
        `INSERT INTO collaboration_worktree_units
           (worktree_id, unit_id, unit_order, type, name, created_at_ms, source,
            baseline_trunk_revision, draft_head_revision)
         VALUES (?, ?, ?, ?, ?, ?, 'trunk', ?, ?)`,
      );
      input.units.forEach((unit, index) => {
        insertUnit.run(
          unit.worktreeID,
          unit.unitID,
          index,
          unit.type,
          metadata.unitNames[unit.unitID] ?? unit.unitID,
          metadata.createdAtMs,
          unit.baselineTrunkRevision as number,
          unit.draftHeadRevision,
        );
      });
      return {
        status: "created",
        aggregate: this._requireAggregate(input.record.worktreeID),
      };
    });
  }

  async addUnit(
    context: DatabaseContext,
    input: AddWorktreeUnitDatabaseInput,
  ): Promise<AddWorktreeUnitDatabaseResult> {
    this._assertOpen();
    validateUnitIdentity(input.unit);
    return this._transaction(() => {
      const { unit } = input;
      const worktree = this._getWorktreeRow(unit.worktreeID);
      if (!worktree) return { status: "not-found" };
      if (this._getUnitRow(unit.worktreeID, unit.unitID)) {
        return {
          status: "already-exists",
          aggregate: this._requireAggregate(unit.worktreeID),
        };
      }
      if (worktree.status !== "draft") {
        return {
          status: "status-mismatch",
          aggregate: this._requireAggregate(unit.worktreeID),
        };
      }
      validateInitialUnit(unit);
      const metadata = readWorktreeMetadata(context);
      const orderRow = this._database
        .prepare(
          `SELECT COALESCE(MAX(unit_order), -1) + 1 AS next_order
           FROM collaboration_worktree_units
           WHERE worktree_id = ?`,
        )
        .get(unit.worktreeID) as { readonly next_order: number };
      this._database
        .prepare(
          `INSERT INTO collaboration_worktree_units
             (worktree_id, unit_id, unit_order, type, name, created_at_ms, source,
              baseline_trunk_revision, draft_head_revision)
           VALUES (?, ?, ?, ?, ?, ?, 'trunk', ?, ?)`,
        )
        .run(
          unit.worktreeID,
          unit.unitID,
          orderRow.next_order,
          unit.type,
          metadata.unitNames[unit.unitID] ?? unit.unitID,
          metadata.createdAtMs,
          unit.baselineTrunkRevision as number,
          unit.draftHeadRevision,
        );
      return {
        status: "added",
        aggregate: this._requireAggregate(unit.worktreeID),
      };
    });
  }

  async createUnit(
    context: DatabaseContext,
    input: CreateWorktreeUnitDatabaseInput,
  ): Promise<CreateWorktreeUnitDatabaseResult> {
    this._assertOpen();
    validateWorktreeCreatedUnit(input.unit, input.seed);
    return this._transaction(() => {
      const { unit, seed } = input;
      const worktree = this._getWorktreeRow(unit.worktreeID);
      if (!worktree) return { status: "not-found" };
      const existing = this._getUnitRow(unit.worktreeID, unit.unitID);
      if (existing) {
        const existingSeed = this._getUnitSeed(unit.worktreeID, unit.unitID);
        const exactRetry =
          existing.source === "worktree" &&
          existing.type === unit.type &&
          existingSeed !== null &&
          encode(existingSeed) === encode(seed);
        return {
          status: exactRetry ? "already-created" : "unit-exists",
          aggregate: this._requireAggregate(unit.worktreeID),
        };
      }
      if (worktree.status !== "draft") {
        return {
          status: "status-mismatch",
          aggregate: this._requireAggregate(unit.worktreeID),
        };
      }
      const metadata = readWorktreeMetadata(context);
      const orderRow = this._database
        .prepare(
          `SELECT COALESCE(MAX(unit_order), -1) + 1 AS next_order
           FROM collaboration_worktree_units
           WHERE worktree_id = ?`,
        )
        .get(unit.worktreeID) as { readonly next_order: number };
      this._database
        .prepare(
          `INSERT INTO collaboration_worktree_units
             (worktree_id, unit_id, unit_order, type, name, created_at_ms, source,
              baseline_trunk_revision, draft_head_revision)
           VALUES (?, ?, ?, ?, ?, ?, 'worktree', 1, 1)`,
        )
        .run(
          unit.worktreeID,
          unit.unitID,
          orderRow.next_order,
          unit.type,
          metadata.unitNames[unit.unitID] ?? unit.unitID,
          metadata.createdAtMs,
        );
      this._database
        .prepare(
          `INSERT INTO collaboration_worktree_unit_seeds
             (worktree_id, unit_id, snapshot_json,
              sheet_blocks_json)
           VALUES (?, ?, ?, ?)`,
        )
        .run(
          unit.worktreeID,
          unit.unitID,
          encode(seed.snapshot),
          seed.sheetBlocks === undefined ? null : encode(seed.sheetBlocks),
        );
      return {
        status: "created",
        aggregate: this._requireAggregate(unit.worktreeID),
      };
    });
  }

  async saveUnitMergeArtifact(
    _context: DatabaseContext,
    input: SaveWorktreeUnitMergeArtifactInput,
  ): Promise<SaveWorktreeUnitMergeArtifactResult> {
    this._assertOpen();
    return this._transaction(() => {
      const worktree = this._getWorktreeRow(input.worktreeID);
      const row = this._getUnitRow(input.worktreeID, input.unitID);
      if (!worktree || !row) return { status: "not-found" };
      const unit = rowToUnitRecord(row);
      if (
        worktree.status !== "merging" ||
        unit.source !== "worktree" ||
        unit.readyDraftHeadRevision !== input.artifact.readyDraftHeadRevision ||
        isTerminal(unit)
      ) {
        return { status: "stale-merge" };
      }
      const existing = this._getUnitMergeArtifact(input.worktreeID, input.unitID);
      if (existing) {
        return { status: "already-saved", artifact: existing };
      }
      validateMergeArtifact(unit, input.artifact);
      this._database
        .prepare(
          `INSERT INTO collaboration_worktree_unit_merge_artifacts
             (worktree_id, unit_id, ready_draft_head_revision,
              snapshot_json, sheet_blocks_json)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          input.worktreeID,
          input.unitID,
          input.artifact.readyDraftHeadRevision,
          encode(input.artifact.unit.snapshot),
          input.artifact.unit.sheetBlocks === undefined
            ? null
            : encode(input.artifact.unit.sheetBlocks),
        );
      return {
        status: "saved",
        artifact: decode<WorktreeUnitMergeArtifact>(encode(input.artifact)),
      };
    });
  }

  async commitDraftChangeset(
    context: DatabaseContext,
    input: CommitWorktreeChangesetInput,
  ): Promise<CommitWorktreeChangesetResult> {
    this._assertOpen();
    validateSubmissionIdentity(input.changeset);
    return this._transaction(() => {
      const { worktreeID, expectedHeadRevision, changeset } = input;
      const existing = this._database
        .prepare(
          `SELECT payload_json
           FROM collaboration_worktree_changesets
           WHERE worktree_id = ? AND unit_id = ? AND sid = ? AND req_id = ?`,
        )
        .get(worktreeID, changeset.unitID, changeset.sid as string, changeset.reqId as number) as
        | PayloadRow
        | undefined;
      if (existing) {
        return {
          status: "already-committed",
          changeset: decode<IChangeset>(existing.payload_json),
        };
      }
      const worktree = this._getWorktreeRow(worktreeID);
      const unit = this._getUnitRow(worktreeID, changeset.unitID);
      if (!worktree || !unit) return { status: "not-found" };
      if (worktree.status !== "draft") {
        return {
          status: "not-editable",
          worktreeStatus: toWorktreeStatus(worktree.status),
        };
      }
      const record = rowToUnitRecord(unit);
      if (isTerminal(record)) return { status: "unit-frozen" };
      if (record.draftHeadRevision !== expectedHeadRevision) {
        return {
          status: "revision-mismatch",
          actualHeadRevision: record.draftHeadRevision,
        };
      }
      validateChangesetCandidate(record, input);
      this._database
        .prepare(
          `INSERT INTO collaboration_worktree_changesets
             (worktree_id, unit_id, revision, base_revision,
              sid, req_id, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          worktreeID,
          changeset.unitID,
          changeset.revision,
          changeset.baseRev,
          changeset.sid as string,
          changeset.reqId as number,
          encode(changeset),
        );
      const update = this._database
        .prepare(
          `UPDATE collaboration_worktree_units
           SET draft_head_revision = ?, name = COALESCE(?, name)
           WHERE worktree_id = ? AND unit_id = ?
             AND draft_head_revision = ?`,
        )
        .run(
          changeset.revision,
          readWorktreeChangeMetadata(context).unitName ?? null,
          worktreeID,
          changeset.unitID,
          expectedHeadRevision,
        );
      if (update.changes !== 1) {
        throw new CollabError(
          "INTERNAL_ERROR",
          "SQLite draft head changed inside a write transaction",
        );
      }
      return {
        status: "committed",
        changeset: decode<IChangeset>(encode(changeset)),
        headRevision: changeset.revision,
      };
    });
  }

  public deleteUnit(
    context: DatabaseContext,
    worktreeID: string,
    unitID: string,
  ): DeleteWorktreeUnitResult {
    this._assertOpen();
    return this._transaction(() => {
      const worktree = this._getWorktreeRow(worktreeID);
      if (!worktree) return { status: "not-found" };
      if (worktree.status !== "draft") return { status: "not-editable" };
      const existingDeleted = this._getDeletedUnitRow(worktreeID, unitID);
      if (existingDeleted) {
        return { status: "already-deleted" };
      }
      const unit = this._getUnitRow(worktreeID, unitID);
      if (!unit) return { status: "not-found" };
      this._database
        .prepare(
          `INSERT INTO collaboration_worktree_deleted_units
             (worktree_id, unit_id, type, name, source,
              baseline_trunk_revision, deleted_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          worktreeID,
          unitID,
          unit.type,
          unit.name,
          unit.source,
          unit.baseline_trunk_revision,
          readWorktreeChangeMetadata(context).createdAtMs,
        );
      this._database
        .prepare(
          `DELETE FROM collaboration_worktree_units
           WHERE worktree_id = ? AND unit_id = ?`,
        )
        .run(worktreeID, unitID);
      return { status: "deleted" };
    });
  }

  async markReady(
    _context: DatabaseContext,
    worktreeID: string,
  ): Promise<WorktreeTransitionResult> {
    this._assertOpen();
    return this._transaction(() => {
      const row = this._getWorktreeRow(worktreeID);
      if (!row) return { status: "not-found" };
      if (row.status === "ready") {
        return {
          status: "already-in-target",
          aggregate: this._requireAggregate(worktreeID),
        };
      }
      if (row.status !== "draft") {
        return {
          status: "status-mismatch",
          aggregate: this._requireAggregate(worktreeID),
        };
      }
      for (const unit of this._getUnitRows(worktreeID)) {
        if (isTerminal(rowToUnitRecord(unit))) continue;
        this._database
          .prepare(
            `UPDATE collaboration_worktree_units
             SET ready_draft_head_revision = draft_head_revision
             WHERE worktree_id = ? AND unit_id = ?`,
          )
          .run(worktreeID, unit.unit_id);
        this._database
          .prepare(
            `DELETE FROM collaboration_worktree_unit_merge_artifacts
             WHERE worktree_id = ? AND unit_id = ?`,
          )
          .run(worktreeID, unit.unit_id);
      }
      this._updateStatus(worktreeID, "ready");
      return {
        status: "transitioned",
        previousStatus: "draft",
        aggregate: this._requireAggregate(worktreeID),
      };
    });
  }

  async reopenWorktree(
    _context: DatabaseContext,
    worktreeID: string,
  ): Promise<WorktreeTransitionResult> {
    this._assertOpen();
    return this._transaction(() => {
      const row = this._getWorktreeRow(worktreeID);
      if (!row) return { status: "not-found" };
      if (row.status === "draft") {
        return {
          status: "already-in-target",
          aggregate: this._requireAggregate(worktreeID),
        };
      }
      if (row.status !== "ready") {
        return {
          status: "status-mismatch",
          aggregate: this._requireAggregate(worktreeID),
        };
      }
      for (const unit of this._getUnitRows(worktreeID)) {
        if (isTerminal(rowToUnitRecord(unit))) continue;
        this._database
          .prepare(
            `UPDATE collaboration_worktree_units
             SET ready_draft_head_revision = NULL, merge_result_json = NULL
             WHERE worktree_id = ? AND unit_id = ?`,
          )
          .run(worktreeID, unit.unit_id);
        this._database
          .prepare(
            `DELETE FROM collaboration_worktree_unit_merge_artifacts
             WHERE worktree_id = ? AND unit_id = ?`,
          )
          .run(worktreeID, unit.unit_id);
      }
      this._updateStatus(worktreeID, "draft");
      return {
        status: "transitioned",
        previousStatus: "ready",
        aggregate: this._requireAggregate(worktreeID),
      };
    });
  }

  async discardWorktree(
    _context: DatabaseContext,
    worktreeID: string,
  ): Promise<WorktreeTransitionResult> {
    this._assertOpen();
    return this._transaction(() => {
      const row = this._getWorktreeRow(worktreeID);
      if (!row) return { status: "not-found" };
      if (row.status === "discarded") {
        return {
          status: "already-in-target",
          aggregate: this._requireAggregate(worktreeID),
        };
      }
      if (row.status !== "draft" && row.status !== "ready") {
        return {
          status: "status-mismatch",
          aggregate: this._requireAggregate(worktreeID),
        };
      }
      const previousStatus = toWorktreeStatus(row.status);
      this._updateStatus(worktreeID, "discarded");
      return {
        status: "transitioned",
        previousStatus,
        aggregate: this._requireAggregate(worktreeID),
      };
    });
  }

  async startOrResumeMerge(
    _context: DatabaseContext,
    worktreeID: string,
  ): Promise<StartMergeResult> {
    this._assertOpen();
    return this._transaction(() => {
      const row = this._getWorktreeRow(worktreeID);
      if (!row) return { status: "not-found" };
      if (row.status === "merged") {
        return {
          status: "already-merged",
          aggregate: this._requireAggregate(worktreeID),
        };
      }
      if (row.status === "merging") {
        return {
          status: "resumed",
          aggregate: this._requireAggregate(worktreeID),
        };
      }
      if (row.status !== "ready") {
        return {
          status: "status-mismatch",
          aggregate: this._requireAggregate(worktreeID),
        };
      }
      this._updateStatus(worktreeID, "merging");
      return {
        status: "started",
        aggregate: this._requireAggregate(worktreeID),
      };
    });
  }

  async recordUnitMergeResult(
    _context: DatabaseContext,
    input: RecordUnitMergeResultInput,
  ): Promise<RecordUnitMergeResultResult> {
    this._assertOpen();
    validateMergeResult(input.mergeResult);
    return this._transaction(() => {
      const worktree = this._getWorktreeRow(input.worktreeID);
      const unit = this._getUnitRow(input.worktreeID, input.unitID);
      if (!worktree || !unit) return { status: "not-found" };
      const record = rowToUnitRecord(unit);
      if (
        worktree.status !== "merging" ||
        record.readyDraftHeadRevision !== input.readyDraftHeadRevision
      ) {
        return { status: "stale-merge" };
      }
      const existing = record.mergeResult;
      if (existing && isDeepStrictEqual(existing, input.mergeResult)) {
        return {
          status: "already-recorded",
          aggregate: this._requireAggregate(input.worktreeID),
        };
      }
      if (existing && isTerminalResult(existing)) {
        return { status: "stale-merge" };
      }
      this._database
        .prepare(
          `UPDATE collaboration_worktree_units
           SET merge_result_json = ?
           WHERE worktree_id = ? AND unit_id = ?`,
        )
        .run(encode(input.mergeResult), input.worktreeID, input.unitID);
      return {
        status: "recorded",
        aggregate: this._requireAggregate(input.worktreeID),
      };
    });
  }

  async finishMerge(
    _context: DatabaseContext,
    worktreeID: string,
  ): Promise<WorktreeTransitionResult> {
    this._assertOpen();
    return this._transaction(() => {
      const row = this._getWorktreeRow(worktreeID);
      if (!row) return { status: "not-found" };
      if (row.status === "merged") {
        return {
          status: "already-in-target",
          aggregate: this._requireAggregate(worktreeID),
        };
      }
      if (row.status !== "merging") {
        return {
          status: "status-mismatch",
          aggregate: this._requireAggregate(worktreeID),
        };
      }
      const completed = this._getUnitRows(worktreeID).every((unit) =>
        isTerminal(rowToUnitRecord(unit)),
      );
      this._updateStatus(worktreeID, completed ? "merged" : "ready");
      return {
        status: "transitioned",
        previousStatus: "merging",
        aggregate: this._requireAggregate(worktreeID),
      };
    });
  }

  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    if (this._ownsConnection) {
      this._connection.dispose();
    }
  }

  private _initializeSchema(): void {
    this._transaction(() => {
      if (!this._hasTable("collaboration_schema_versions")) {
        if (this._hasAnyOwnedTable()) {
          throw incompatibleSchema("SQLite Worktree tables exist without a schema version");
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
        .get(SCHEMA_COMPONENT) as SchemaVersionRow | undefined;
      if (row) {
        if (row.version !== SCHEMA_VERSION) {
          throw incompatibleSchema(
            `SQLite Worktree schema version ${row.version} is not supported`,
          );
        }
        const missingTables = TABLE_NAMES.filter((tableName) => !this._hasTable(tableName));
        if (missingTables.length > 0) {
          throw incompatibleSchema(
            `SQLite Worktree schema v2 is incomplete: missing ${missingTables.join(", ")}`,
          );
        }
        this._assertGatewayColumns();
        return;
      }

      if (this._hasAnyOwnedTable()) {
        throw incompatibleSchema("SQLite Worktree tables exist without a schema version");
      }

      this._database.exec(`
        CREATE TABLE collaboration_worktrees (
          worktree_id TEXT PRIMARY KEY,
          sid TEXT NOT NULL,
          status TEXT NOT NULL
            CHECK (status IN ('draft', 'ready', 'merging', 'merged', 'discarded')),
          agent_id TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL,
          merged_at_ms INTEGER
        );

        CREATE TABLE collaboration_worktree_units (
          worktree_id TEXT NOT NULL,
          unit_id TEXT NOT NULL,
          unit_order INTEGER NOT NULL CHECK (unit_order >= 0),
          type INTEGER NOT NULL,
          name TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL,
          source TEXT NOT NULL
            CHECK (source IN ('trunk', 'worktree')),
          baseline_trunk_revision INTEGER NOT NULL
            CHECK (baseline_trunk_revision >= 1),
          draft_head_revision INTEGER NOT NULL
            CHECK (draft_head_revision >= baseline_trunk_revision),
          ready_draft_head_revision INTEGER,
          merge_result_json TEXT,
          PRIMARY KEY (worktree_id, unit_id),
          UNIQUE (worktree_id, unit_order),
          FOREIGN KEY (worktree_id)
            REFERENCES collaboration_worktrees(worktree_id) ON DELETE CASCADE
        );

        CREATE TABLE collaboration_worktree_changesets (
          worktree_id TEXT NOT NULL,
          unit_id TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK (revision >= 2),
          base_revision INTEGER NOT NULL CHECK (base_revision >= 1),
          sid TEXT NOT NULL,
          req_id INTEGER NOT NULL CHECK (req_id >= 1),
          payload_json TEXT NOT NULL,
          PRIMARY KEY (worktree_id, unit_id, revision),
          UNIQUE (worktree_id, unit_id, sid, req_id),
          FOREIGN KEY (worktree_id, unit_id)
            REFERENCES collaboration_worktree_units(worktree_id, unit_id)
            ON DELETE CASCADE
        );

        CREATE INDEX collaboration_worktree_changesets_revision
          ON collaboration_worktree_changesets(
            worktree_id, unit_id, revision ASC
          );

        CREATE TABLE collaboration_worktree_unit_seeds (
          worktree_id TEXT NOT NULL,
          unit_id TEXT NOT NULL,
          snapshot_json TEXT NOT NULL,
          sheet_blocks_json TEXT,
          resources_json TEXT,
          PRIMARY KEY (worktree_id, unit_id),
          FOREIGN KEY (worktree_id, unit_id)
            REFERENCES collaboration_worktree_units(worktree_id, unit_id)
            ON DELETE CASCADE
        );

        CREATE TABLE collaboration_worktree_unit_merge_artifacts (
          worktree_id TEXT NOT NULL,
          unit_id TEXT NOT NULL,
          ready_draft_head_revision INTEGER NOT NULL
            CHECK (ready_draft_head_revision >= 1),
          snapshot_json TEXT NOT NULL,
          sheet_blocks_json TEXT,
          resources_json TEXT,
          PRIMARY KEY (worktree_id, unit_id),
          FOREIGN KEY (worktree_id, unit_id)
            REFERENCES collaboration_worktree_units(worktree_id, unit_id)
            ON DELETE CASCADE
        );

        CREATE TABLE collaboration_worktree_deleted_units (
          worktree_id TEXT NOT NULL,
          unit_id TEXT NOT NULL,
          type INTEGER NOT NULL,
          name TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source IN ('trunk', 'worktree')),
          baseline_trunk_revision INTEGER NOT NULL
            CHECK (baseline_trunk_revision >= 1),
          deleted_at_ms INTEGER NOT NULL,
          PRIMARY KEY (worktree_id, unit_id),
          FOREIGN KEY (worktree_id)
            REFERENCES collaboration_worktrees(worktree_id) ON DELETE CASCADE
        );

        INSERT INTO collaboration_schema_versions (component, version)
        VALUES ('worktree', 2);
      `);
    });
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

  private _hasAnyOwnedTable(): boolean {
    return TABLE_NAMES.some((tableName) => this._hasTable(tableName));
  }

  private _assertGatewayColumns(): void {
    const worktreeColumns = this._tableColumns("collaboration_worktrees");
    const unitColumns = this._tableColumns("collaboration_worktree_units");
    const missingWorktree = ["agent_id", "name", "created_at_ms", "merged_at_ms"].filter(
      (column) => !worktreeColumns.has(column),
    );
    const missingUnit = ["name", "created_at_ms"].filter((column) => !unitColumns.has(column));
    const missing = [
      ...missingWorktree.map((column) => `collaboration_worktrees.${column}`),
      ...missingUnit.map((column) => `collaboration_worktree_units.${column}`),
    ];
    if (missing.length > 0) {
      throw incompatibleSchema(
        `SQLite Worktree database v2 is missing application columns: ${missing.join(", ")}`,
      );
    }
  }

  private _tableColumns(tableName: string): ReadonlySet<string> {
    return new Set(
      (
        this._database.prepare(`PRAGMA table_info(${tableName})`).all() as unknown as ColumnRow[]
      ).map(({ name }) => name),
    );
  }

  private _getWorktreeRow(worktreeID: string): WorktreeRow | null {
    const row = this._database
      .prepare(
        `SELECT worktree_id, sid, status, agent_id, name,
                created_at_ms, merged_at_ms
         FROM collaboration_worktrees
         WHERE worktree_id = ?`,
      )
      .get(worktreeID) as WorktreeRow | undefined;
    return row ?? null;
  }

  private _getUnitRow(worktreeID: string, unitID: string): WorktreeUnitRow | null {
    const row = this._database
      .prepare(
        `SELECT worktree_id, unit_id, type, name, created_at_ms, source,
                baseline_trunk_revision, draft_head_revision, ready_draft_head_revision,
                merge_result_json
         FROM collaboration_worktree_units
         WHERE worktree_id = ? AND unit_id = ?`,
      )
      .get(worktreeID, unitID) as WorktreeUnitRow | undefined;
    return row ?? null;
  }

  private _getUnitRows(worktreeID: string): readonly WorktreeUnitRow[] {
    return this._database
      .prepare(
        `SELECT worktree_id, unit_id, type, name, created_at_ms, source,
                baseline_trunk_revision, draft_head_revision, ready_draft_head_revision,
                merge_result_json
         FROM collaboration_worktree_units
         WHERE worktree_id = ?
         ORDER BY unit_order ASC`,
      )
      .all(worktreeID) as unknown as WorktreeUnitRow[];
  }

  private _getDeletedUnitRow(worktreeID: string, unitID: string): DeletedUnitRow | null {
    const row = this._database
      .prepare(
        `SELECT worktree_id, unit_id, type, name, source,
                baseline_trunk_revision, deleted_at_ms
         FROM collaboration_worktree_deleted_units
         WHERE worktree_id = ? AND unit_id = ?`,
      )
      .get(worktreeID, unitID) as DeletedUnitRow | undefined;
    return row ?? null;
  }

  private _getDeletedUnitRows(worktreeID: string): readonly DeletedUnitRow[] {
    return this._database
      .prepare(
        `SELECT worktree_id, unit_id, type, name, source,
                baseline_trunk_revision, deleted_at_ms
         FROM collaboration_worktree_deleted_units
         WHERE worktree_id = ?
         ORDER BY deleted_at_ms ASC, unit_id ASC`,
      )
      .all(worktreeID) as unknown as DeletedUnitRow[];
  }

  private _getUnitSeed(worktreeID: string, unitID: string): WorktreeUnitSeed | null {
    const row = this._database
      .prepare(
        `SELECT snapshot_json, sheet_blocks_json
         FROM collaboration_worktree_unit_seeds
         WHERE worktree_id = ? AND unit_id = ?`,
      )
      .get(worktreeID, unitID) as SeedRow | undefined;
    if (!row) return null;
    return {
      snapshot: decode(row.snapshot_json),
      ...(row.sheet_blocks_json === null ? {} : { sheetBlocks: decode(row.sheet_blocks_json) }),
    };
  }

  private _getUnitMergeArtifact(
    worktreeID: string,
    unitID: string,
  ): WorktreeUnitMergeArtifact | null {
    const row = this._database
      .prepare(
        `SELECT ready_draft_head_revision, snapshot_json,
                sheet_blocks_json
         FROM collaboration_worktree_unit_merge_artifacts
         WHERE worktree_id = ? AND unit_id = ?`,
      )
      .get(worktreeID, unitID) as MergeArtifactRow | undefined;
    if (!row) return null;
    return {
      readyDraftHeadRevision: row.ready_draft_head_revision,
      unit: {
        snapshot: decode(row.snapshot_json),
        ...(row.sheet_blocks_json === null ? {} : { sheetBlocks: decode(row.sheet_blocks_json) }),
      },
    };
  }

  private _getAggregate(worktreeID: string): WorktreeAggregateRecord | null {
    const worktree = this._getWorktreeRow(worktreeID);
    if (!worktree) return null;
    return {
      worktree: {
        worktreeID: worktree.worktree_id,
        sid: worktree.sid,
        status: toWorktreeStatus(worktree.status),
      },
      units: this._getUnitRows(worktreeID).map(rowToUnitRecord),
    };
  }

  private _requireAggregate(worktreeID: string): WorktreeAggregateRecord {
    const aggregate = this._getAggregate(worktreeID);
    if (!aggregate) {
      throw new CollabError(
        "INTERNAL_ERROR",
        "SQLite Worktree disappeared inside a write transaction",
      );
    }
    return aggregate;
  }

  private _rowToGatewaySummary(row: WorktreeRow): UniverfileWorktreeSummary {
    const baseline: Record<string, number> = {};
    for (const unit of this._getUnitRows(row.worktree_id)) {
      if (unit.source === "trunk") {
        baseline[unit.unit_id] = unit.baseline_trunk_revision;
      }
    }
    for (const unit of this._getDeletedUnitRows(row.worktree_id)) {
      if (unit.source === "trunk") {
        baseline[unit.unit_id] = unit.baseline_trunk_revision;
      }
    }
    return {
      worktreeId: row.worktree_id,
      status: toWorktreeStatus(row.status),
      agentId: row.agent_id,
      name: row.name,
      baseline,
      createdAt: new Date(row.created_at_ms).toISOString(),
      ...(row.merged_at_ms === null ? {} : { mergedAt: new Date(row.merged_at_ms).toISOString() }),
    };
  }

  private _updateStatus(worktreeID: string, status: string): void {
    const update = this._database
      .prepare(
        `UPDATE collaboration_worktrees
         SET status = ?,
             merged_at_ms = CASE
               WHEN ? = 'merged' THEN COALESCE(merged_at_ms, ?)
               ELSE merged_at_ms
             END
         WHERE worktree_id = ?`,
      )
      .run(status, status, Date.now(), worktreeID);
    if (update.changes !== 1) {
      throw new CollabError(
        "INTERNAL_ERROR",
        "SQLite Worktree status update did not affect one record",
      );
    }
  }

  private _transaction<T>(operation: () => T): T {
    return runUniverfileSQLiteTransaction(this._database, operation);
  }

  private _assertOpen(): void {
    if (this._disposed) {
      throw new CollabError("INTERNAL_ERROR", "SQLite Worktree Database Adapter is disposed");
    }
  }
}

function rowToUnitRecord(row: WorktreeUnitRow): WorktreeUnitRecord {
  const source = toWorktreeUnitSource(row.source);
  return {
    worktreeID: row.worktree_id,
    unitID: row.unit_id,
    type: row.type as UniverType,
    source,
    ...(source === "trunk" ? { baselineTrunkRevision: row.baseline_trunk_revision } : {}),
    draftHeadRevision: row.draft_head_revision,
    ...(row.ready_draft_head_revision === null
      ? {}
      : { readyDraftHeadRevision: row.ready_draft_head_revision }),
    ...(row.merge_result_json === null
      ? {}
      : {
          mergeResult: decode<WorktreeUnitMergeResult>(row.merge_result_json),
        }),
  };
}

function validateOptions(options: UniverfileSQLiteWorktreeDatabaseAdapterOptions): void {
  if (!options.filename) throw invalidRequest("SQLite filename is required");
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

function readWorktreeMetadata(context: DatabaseContext): {
  readonly agentId: string;
  readonly name: string;
  readonly createdAtMs: number;
  readonly unitNames: Readonly<Record<string, string>>;
} {
  const value = context.customData[UNIVERFILE_WORKTREE_METADATA_KEY] as
    | UniverfileWorktreeMetadata
    | undefined;
  return {
    agentId: typeof value?.agentId === "string" ? value.agentId : "",
    name: typeof value?.name === "string" ? value.name : "",
    createdAtMs: validTimestamp(value?.createdAtMs),
    unitNames:
      typeof value?.unitNames === "object" && value.unitNames !== null ? value.unitNames : {},
  };
}

function readWorktreeChangeMetadata(context: DatabaseContext): {
  readonly createdAtMs: number;
  readonly unitName?: string;
} {
  const value = context.customData[UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY] as
    | UniverfileWorktreeChangeMetadata
    | undefined;
  return {
    createdAtMs: validTimestamp(value?.createdAtMs),
    ...(typeof value?.unitName === "string" ? { unitName: value.unitName } : {}),
  };
}

function validTimestamp(value: number | undefined): number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : Date.now();
}

function validateCreateInput(input: CreateWorktreeDatabaseInput): void {
  if (!input.record.worktreeID || !input.record.sid || input.record.status !== "draft") {
    throw invalidRequest("New Worktree must be a draft with identity");
  }
  const unitIDs = new Set<string>();
  for (const unit of input.units) {
    if (unit.worktreeID !== input.record.worktreeID || unitIDs.has(unit.unitID)) {
      throw invalidRequest("Initial Worktree Units must be unique and share identity");
    }
    unitIDs.add(unit.unitID);
    validateInitialUnit(unit);
  }
}

function validateInitialUnit(unit: WorktreeUnitRecord): void {
  validateUnitIdentity(unit);
  if (
    unit.source !== "trunk" ||
    !SUPPORTED_UNIT_TYPES.has(unit.type) ||
    !Number.isSafeInteger(unit.baselineTrunkRevision) ||
    (unit.baselineTrunkRevision as number) < 1 ||
    unit.draftHeadRevision !== unit.baselineTrunkRevision ||
    unit.readyDraftHeadRevision !== undefined ||
    unit.mergeResult !== undefined
  ) {
    throw invalidRequest("New Worktree Unit must start at its trunk baseline");
  }
}

function validateWorktreeCreatedUnit(unit: WorktreeUnitRecord, seed: WorktreeUnitSeed): void {
  validateUnitIdentity(unit);
  if (
    unit.source !== "worktree" ||
    unit.baselineTrunkRevision !== undefined ||
    !SUPPORTED_UNIT_TYPES.has(unit.type) ||
    unit.draftHeadRevision !== 1 ||
    unit.readyDraftHeadRevision !== undefined ||
    unit.mergeResult !== undefined ||
    seed.snapshot.unitID !== unit.unitID ||
    seed.snapshot.type !== unit.type ||
    seed.snapshot.rev !== 1
  ) {
    throw invalidRequest("Worktree-created Unit must start from its revision 1 seed");
  }
}

function validateUnitIdentity(unit: WorktreeUnitRecord): void {
  if (!unit.worktreeID || !unit.unitID) {
    throw invalidRequest("Worktree and Unit identity are required");
  }
}

function validateSubmissionIdentity(changeset: IChangeset): void {
  if (!changeset.sid || !Number.isSafeInteger(changeset.reqId) || (changeset.reqId as number) < 1) {
    throw invalidRequest("Changeset sid and positive integer reqId are required");
  }
}

function validateChangesetCandidate(
  unit: WorktreeUnitRecord,
  input: CommitWorktreeChangesetInput,
): void {
  const { changeset, expectedHeadRevision } = input;
  if (
    changeset.type !== unit.type ||
    changeset.baseRev !== expectedHeadRevision ||
    changeset.revision !== expectedHeadRevision + 1
  ) {
    throw invalidRequest("Draft changeset must match Unit type and expected revision");
  }
}

function validateRange(range: WorktreeRevisionRange): void {
  if (
    !Number.isSafeInteger(range.from) ||
    !Number.isSafeInteger(range.to) ||
    range.from < 0 ||
    range.to < 0
  ) {
    throw invalidRequest("Draft revision range cannot be negative");
  }
}

function validateMergeResult(result: WorktreeUnitMergeResult): void {
  if (result.status === "merged") {
    if (!Number.isSafeInteger(result.trunkRevision) || result.trunkRevision < 1) {
      throw invalidRequest("Merged result requires a trunk revision");
    }
    return;
  }
  if (result.status === "unchanged") return;
  if (!result.error.code || !result.error.message || typeof result.error.retryable !== "boolean") {
    throw invalidRequest("Merge error must be stable and serializable");
  }
}

function validateMergeArtifact(
  unit: WorktreeUnitRecord,
  artifact: WorktreeUnitMergeArtifact,
): void {
  if (
    artifact.unit.snapshot.unitID !== unit.unitID ||
    artifact.unit.snapshot.type !== unit.type ||
    artifact.unit.snapshot.rev !== 1
  ) {
    throw invalidRequest("Worktree Unit merge artifact must be a revision 1 snapshot");
  }
}

function isTerminal(unit: WorktreeUnitRecord): boolean {
  return isTerminalResult(unit.mergeResult);
}

function isTerminalResult(result: WorktreeUnitMergeResult | undefined): boolean {
  return result?.status === "merged" || result?.status === "unchanged";
}

function toWorktreeStatus(status: string): WorktreeAggregateRecord["worktree"]["status"] {
  if (
    status === "draft" ||
    status === "ready" ||
    status === "merging" ||
    status === "merged" ||
    status === "discarded"
  ) {
    return status;
  }
  throw new CollabError("INTERNAL_ERROR", `SQLite contains invalid Worktree status ${status}`);
}

function toWorktreeUnitSource(value: string): "trunk" | "worktree" {
  if (value === "trunk" || value === "worktree") return value;
  throw new CollabError("INTERNAL_ERROR", `SQLite contains invalid Worktree Unit source ${value}`);
}

function invalidRequest(message: string): CollabError {
  return new CollabError("INVALID_REQUEST", message);
}

function incompatibleSchema(message: string): CollabError {
  return new CollabError("INTERNAL_ERROR", message);
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
