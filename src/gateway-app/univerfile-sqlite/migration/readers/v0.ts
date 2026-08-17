import { existsSync, statSync } from "node:fs";
import type Database from "libsql";
import type { IChangeset, IMutation, ISheetBlock, ISnapshot } from "@univerjs/protocol";
import {
  type UniverfileSQLiteConnection,
  runUniverfileSQLiteTransaction,
} from "../../connection.js";
import { UniverfileSQLiteDatabaseAdapter } from "../../database-adapters/collaboration-database-adapter.js";
import { UniverfileSQLiteWorktreeDatabaseAdapter } from "../../database-adapters/worktree-database-adapter.js";

const LEGACY_PREFIX = "__collaboration_migration_v0_";
const BINARY_TAG = "__univerCollaborationBinary";
const LEGACY_BINARY_TAG = "__u8__";
const SUPPORTED_UNIT_TYPES = new Set([1, 2, 3, 5, 6]);
const LEGACY_TABLE_COLUMNS = {
  units: [
    "unit_id",
    "type",
    "name",
    "baseline_rev",
    "head_rev",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
  changesets: [
    "unit_id",
    "revision",
    "type",
    "base_rev",
    "user_id",
    "member_id",
    "sid",
    "req_id",
    "mutations",
    "mutation_size",
    "additional_fields",
    "create_time",
  ],
  snapshots: ["unit_id", "revision", "data"],
  sheet_blocks: ["unit_id", "block_id", "start_row", "end_row", "data"],
  worktrees: [
    "worktree_id",
    "status",
    "agent_id",
    "name",
    "baseline",
    "head_commit",
    "created_at",
    "merged_at",
  ],
  worktree_commits: [
    "worktree_id",
    "seq",
    "message",
    "changes",
    "custom_tag",
    "units",
    "created_at",
  ],
  worktree_changesets: [
    "worktree_id",
    "unit_id",
    "revision",
    "commit_seq",
    "type",
    "base_rev",
    "user_id",
    "member_id",
    "sid",
    "req_id",
    "mutations",
    "mutation_size",
    "additional_fields",
    "create_time",
  ],
  worktree_snapshots: ["worktree_id", "unit_id", "revision", "data"],
} as const;

type LegacyTableName = keyof typeof LEGACY_TABLE_COLUMNS;

interface ColumnRow {
  readonly name: string;
}

interface LegacyUnitRow {
  readonly unit_id: string;
  readonly type: number;
  readonly name: string;
  readonly head_rev: number;
  readonly created_at: string;
  readonly deleted_at: string | null;
}

interface LegacyChangesetRow {
  readonly unit_id: string;
  readonly revision: number;
  readonly type: number;
  readonly base_rev: number;
  readonly user_id: string;
  readonly member_id: string;
  readonly sid: string;
  readonly req_id: number;
  readonly mutations: string;
  readonly mutation_size: number | null;
  readonly additional_fields: string | null;
  readonly create_time: number;
}

interface LegacySnapshotRow {
  readonly unit_id: string;
  readonly revision: number;
  readonly data: string;
}

interface LegacySheetBlockRow {
  readonly unit_id: string;
  readonly block_id: string;
  readonly start_row: number;
  readonly end_row: number;
  readonly data: Uint8Array;
}

interface LegacyWorktreeRow {
  readonly worktree_id: string;
  readonly status: string;
  readonly agent_id: string;
  readonly name: string;
  readonly baseline: string;
  readonly head_commit: number;
  readonly created_at: string;
  readonly merged_at: string | null;
}

interface LegacyCommitRow {
  readonly worktree_id: string;
  readonly seq: number;
  readonly message: string;
  readonly changes: string;
  readonly custom_tag: string | null;
  readonly units: string;
  readonly created_at: number;
}

interface LegacyCommitChanges {
  readonly create?: readonly {
    readonly unitId: string;
    readonly type: number;
    readonly name: string;
  }[];
  readonly delete?: readonly string[];
}

interface LegacyWorktreeChangesetRow extends LegacyChangesetRow {
  readonly worktree_id: string;
  readonly commit_seq: number;
}

export type V0CandidateMigrationResult =
  | { readonly status: "not-needed" }
  | { readonly status: "migrated" };

/**
 * Converts the complete pre-database-v1 Univer CLI schema in one SQLite transaction.
 *
 * Transactional DDL keeps the original legacy schema intact on any conversion failure without
 * copying, deleting or replacing the database file. This also avoids libsql's nondeterministic
 * same-process file-handle release on Windows.
 */
export function migrateV0CandidateToV2(
  connection: UniverfileSQLiteConnection,
): V0CandidateMigrationResult {
  const { database, filename } = connection;
  if (filename === ":memory:" || !existsSync(filename) || statSync(filename).size === 0) {
    return { status: "not-needed" };
  }

  try {
    if (!inspectLegacySchema(database)) {
      return { status: "not-needed" };
    }
    const mergingWorktrees = countMergingWorktrees(database, "worktrees");
    if (mergingWorktrees > 0) {
      throw new Error(
        "legacy v0 contains a merging Worktree without Collaboration SDK recovery context",
      );
    }

    runUniverfileSQLiteTransaction(database, () => {
      renameLegacyTables(database);
      initializeDatabaseV2(filename, connection);
      migrateTrunk(database);
      migrateWorktrees(database);
      validateDatabaseV2(filename, connection);
      for (const tableName of [...legacyTableNames()].reverse()) {
        database.exec(`DROP TABLE ${legacyTable(tableName)};`);
      }
    });
    return { status: "migrated" };
  } catch (error) {
    throw legacyError(error);
  }
}

function inspectLegacySchema(database: Database.Database): boolean {
  const legacyTables = legacyTableNames().filter((tableName) => hasTable(database, tableName));
  const collaborationTables = (
    database
      .prepare(
        `SELECT name
         FROM sqlite_schema
         WHERE type = 'table' AND name LIKE 'collaboration_%'`,
      )
      .all() as unknown as { readonly name: string }[]
  ).map(({ name }) => name);

  if (legacyTables.length === 0) {
    return false;
  }
  if (collaborationTables.length > 0) {
    throw legacyError(
      `legacy and database v1 tables are mixed (${collaborationTables.join(", ")})`,
    );
  }
  if (legacyTables.length !== legacyTableNames().length) {
    const missing = legacyTableNames().filter((tableName) => !legacyTables.includes(tableName));
    throw legacyError(`legacy schema is incomplete: missing ${missing.join(", ")}`);
  }
  for (const tableName of legacyTableNames()) {
    const actual = new Set(
      (database.prepare(`PRAGMA table_info(${tableName})`).all() as unknown as ColumnRow[]).map(
        ({ name }) => name,
      ),
    );
    const missing = LEGACY_TABLE_COLUMNS[tableName].filter((column) => !actual.has(column));
    if (missing.length > 0) {
      throw legacyError(`legacy table ${tableName} is missing columns: ${missing.join(", ")}`);
    }
  }
  return true;
}

function renameLegacyTables(database: Database.Database): void {
  for (const tableName of legacyTableNames()) {
    database.exec(`ALTER TABLE ${tableName} RENAME TO ${legacyTable(tableName)};`);
  }
}

function initializeDatabaseV2(filename: string, connection: UniverfileSQLiteConnection): void {
  const trunk = new UniverfileSQLiteDatabaseAdapter({ filename, connection });
  let worktree: UniverfileSQLiteWorktreeDatabaseAdapter | undefined;
  try {
    worktree = new UniverfileSQLiteWorktreeDatabaseAdapter({ filename, connection });
  } finally {
    if (worktree !== undefined) {
      void worktree.dispose();
    }
    void trunk.dispose();
  }
}

function migrateTrunk(database: Database.Database): void {
  const units = database
    .prepare(
      `SELECT unit_id, type, name, head_rev, created_at, deleted_at
       FROM ${legacyTable("units")}
       ORDER BY created_at ASC, unit_id ASC`,
    )
    .all() as unknown as LegacyUnitRow[];
  const unitById = new Map(units.map((unit) => [unit.unit_id, unit]));
  const insertUnit = database.prepare(
    `INSERT INTO collaboration_units
       (unit_id, type, name, head_revision, created_at_ms, soft_deleted_at_ms)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const unit of units) {
    requireText(unit.unit_id, "legacy Unit id");
    requireSupportedUnitType(unit.type, `legacy Unit ${unit.unit_id}`);
    requirePositiveRevision(unit.head_rev, `legacy Unit ${unit.unit_id} head`);
    insertUnit.run(
      unit.unit_id,
      unit.type,
      unit.name,
      unit.head_rev,
      parseTimestamp(unit.created_at, `legacy Unit ${unit.unit_id} created_at`),
      unit.deleted_at === null
        ? null
        : parseTimestamp(unit.deleted_at, `legacy Unit ${unit.unit_id} deleted_at`),
    );
  }

  const snapshots = database
    .prepare(
      `SELECT unit_id, revision, data
       FROM ${legacyTable("snapshots")}
       ORDER BY unit_id ASC, revision ASC`,
    )
    .all() as unknown as LegacySnapshotRow[];
  const snapshotUnits = new Set<string>();
  const latestSnapshotByUnit = new Map<string, number>();
  const insertSnapshot = database.prepare(
    `INSERT INTO collaboration_snapshots
       (unit_id, revision, type, payload_json)
     VALUES (?, ?, ?, ?)`,
  );
  for (const row of snapshots) {
    const unit = requireUnit(unitById, row.unit_id);
    requirePositiveRevision(row.revision, `legacy snapshot ${row.unit_id}@${row.revision}`);
    if (row.revision > unit.head_rev) {
      throw new Error(`snapshot ${row.unit_id}@${row.revision} exceeds Unit head ${unit.head_rev}`);
    }
    const snapshot = parseLegacyPayload<ISnapshot>(row.data, `snapshot ${row.unit_id}`);
    if (
      snapshot.unitID !== row.unit_id ||
      snapshot.rev !== row.revision ||
      snapshot.type !== unit.type
    ) {
      throw new Error(`snapshot ${row.unit_id}@${row.revision} identity does not match its row`);
    }
    insertSnapshot.run(row.unit_id, row.revision, unit.type, encode(snapshot));
    snapshotUnits.add(row.unit_id);
    latestSnapshotByUnit.set(
      row.unit_id,
      Math.max(latestSnapshotByUnit.get(row.unit_id) ?? 0, row.revision),
    );
  }
  for (const unit of units) {
    if (!snapshotUnits.has(unit.unit_id)) {
      throw new Error(`legacy Unit ${unit.unit_id} has no snapshot`);
    }
  }

  const changesets = database
    .prepare(
      `SELECT unit_id, revision, type, base_rev, user_id, member_id, sid, req_id,
              mutations, mutation_size, additional_fields, create_time
       FROM ${legacyTable("changesets")}
       ORDER BY unit_id ASC, revision ASC`,
    )
    .all() as unknown as LegacyChangesetRow[];
  validateTrunkContinuity(units, latestSnapshotByUnit, changesets);
  migrateChangesets(database, changesets, unitById, "collaboration_changesets");

  const blocks = database
    .prepare(
      `SELECT unit_id, block_id, start_row, end_row, data
       FROM ${legacyTable("sheet_blocks")}
       ORDER BY unit_id ASC, block_id ASC`,
    )
    .all() as unknown as LegacySheetBlockRow[];
  const insertBlock = database.prepare(
    `INSERT INTO collaboration_sheet_blocks
       (unit_id, block_id, payload_json)
     VALUES (?, ?, ?)`,
  );
  for (const block of blocks) {
    if (!unitById.has(block.unit_id)) {
      continue;
    }
    requireText(block.block_id, `legacy sheet block id for ${block.unit_id}`);
    if (
      !Number.isSafeInteger(block.start_row) ||
      !Number.isSafeInteger(block.end_row) ||
      block.start_row < 0 ||
      block.end_row < block.start_row
    ) {
      throw new Error(`legacy sheet block ${block.unit_id}/${block.block_id} range is invalid`);
    }
    const payload: ISheetBlock = {
      id: block.block_id,
      startRow: block.start_row,
      endRow: block.end_row,
      data: new Uint8Array(block.data),
    };
    insertBlock.run(block.unit_id, block.block_id, encode(payload));
  }
}

function migrateWorktrees(database: Database.Database): void {
  const trunkUnits = database
    .prepare(
      `SELECT unit_id, type, name, head_rev, created_at, deleted_at
       FROM ${legacyTable("units")}`,
    )
    .all() as unknown as LegacyUnitRow[];
  const trunkById = new Map(trunkUnits.map((unit) => [unit.unit_id, unit]));
  const worktrees = database
    .prepare(
      `SELECT worktree_id, status, agent_id, name, baseline, head_commit,
              created_at, merged_at
       FROM ${legacyTable("worktrees")}
       ORDER BY created_at ASC, worktree_id ASC`,
    )
    .all() as unknown as LegacyWorktreeRow[];

  for (const worktree of worktrees) {
    migrateWorktree(database, worktree, trunkById);
  }
}

function migrateWorktree(
  database: Database.Database,
  worktree: LegacyWorktreeRow,
  trunkById: ReadonlyMap<string, LegacyUnitRow>,
): void {
  requireText(worktree.worktree_id, "legacy Worktree id");
  const status = legacyStatus(worktree.status);
  const baseline = parseRevisionMap(worktree.baseline, `Worktree ${worktree.worktree_id} baseline`);
  const commits = database
    .prepare(
      `SELECT worktree_id, seq, message, changes, custom_tag, units, created_at
       FROM ${legacyTable("worktree_commits")}
       WHERE worktree_id = ?
       ORDER BY seq ASC`,
    )
    .all(worktree.worktree_id) as unknown as LegacyCommitRow[];
  validateCommitSequence(worktree, commits);

  const created = new Map<
    string,
    {
      readonly unitId: string;
      readonly type: number;
      readonly name: string;
      readonly createdAt: number;
    }
  >();
  const deleted = new Map<string, number>();
  for (const commit of commits) {
    const changes = parseJson<LegacyCommitChanges>(
      commit.changes,
      `Worktree ${worktree.worktree_id} commit ${commit.seq} changes`,
    );
    for (const unit of changes.create ?? []) {
      requireText(unit.unitId, `Worktree ${worktree.worktree_id} created Unit id`);
      requireSupportedUnitType(
        unit.type,
        `Worktree ${worktree.worktree_id} created Unit ${unit.unitId}`,
      );
      if (typeof unit.name !== "string") {
        throw new Error(
          `Worktree ${worktree.worktree_id} created Unit ${unit.unitId} name is invalid`,
        );
      }
      if (created.has(unit.unitId) || Object.prototype.hasOwnProperty.call(baseline, unit.unitId)) {
        throw new Error(`Worktree ${worktree.worktree_id} creates duplicate Unit ${unit.unitId}`);
      }
      created.set(unit.unitId, { ...unit, createdAt: commit.created_at });
    }
    for (const unitId of changes.delete ?? []) {
      requireText(unitId, `Worktree ${worktree.worktree_id} deleted Unit id`);
      deleted.set(unitId, commit.created_at);
    }
  }

  for (const [unitId, revision] of Object.entries(baseline)) {
    requirePositiveRevision(revision, `Worktree ${worktree.worktree_id} baseline ${unitId}`);
    if (!trunkById.has(unitId)) {
      throw new Error(`Worktree ${worktree.worktree_id} baseline Unit ${unitId} is missing`);
    }
  }
  for (const unitId of deleted.keys()) {
    if (!Object.prototype.hasOwnProperty.call(baseline, unitId) && !created.has(unitId)) {
      throw new Error(`Worktree ${worktree.worktree_id} deletes unknown Unit ${unitId}`);
    }
  }
  if (status === "draft" || status === "ready") {
    for (const unitId of Object.keys(baseline)) {
      if (trunkById.get(unitId)?.deleted_at !== null && !deleted.has(unitId)) {
        throw new Error(
          `active Worktree ${worktree.worktree_id} references soft-deleted trunk Unit ${unitId}`,
        );
      }
    }
  }

  const createdAt = parseTimestamp(
    worktree.created_at,
    `Worktree ${worktree.worktree_id} created_at`,
  );
  const mergedAt =
    worktree.merged_at === null
      ? null
      : parseTimestamp(worktree.merged_at, `Worktree ${worktree.worktree_id} merged_at`);
  database
    .prepare(
      `INSERT INTO collaboration_worktrees
         (worktree_id, sid, status, agent_id, name, created_at_ms, merged_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      worktree.worktree_id,
      `legacy:${worktree.worktree_id}`,
      status,
      worktree.agent_id,
      worktree.name,
      createdAt,
      mergedAt,
    );

  const worktreeChangesets = database
    .prepare(
      `SELECT worktree_id, unit_id, revision, commit_seq, type, base_rev, user_id, member_id,
              sid, req_id, mutations, mutation_size, additional_fields, create_time
       FROM ${legacyTable("worktree_changesets")}
       WHERE worktree_id = ?
       ORDER BY unit_id ASC, revision ASC`,
    )
    .all(worktree.worktree_id) as unknown as LegacyWorktreeChangesetRow[];
  const changesetsByUnit = groupByUnit(worktreeChangesets);
  for (const unitId of changesetsByUnit.keys()) {
    if (!Object.prototype.hasOwnProperty.call(baseline, unitId) && !created.has(unitId)) {
      throw new Error(
        `Worktree ${worktree.worktree_id} changesets reference unknown Unit ${unitId}`,
      );
    }
  }
  const activeUnits = [
    ...Object.keys(baseline).map((unitId) => {
      const unit = requireUnit(trunkById, unitId);
      return {
        unitId,
        type: unit.type,
        name: unit.name,
        source: "trunk" as const,
        baselineRevision: baseline[unitId]!,
        createdAt,
      };
    }),
    ...[...created.values()].map((unit) => ({
      ...unit,
      source: "worktree" as const,
      baselineRevision: 1,
    })),
  ].filter((unit) => !deleted.has(unit.unitId));

  const insertUnit = database.prepare(
    `INSERT INTO collaboration_worktree_units
       (worktree_id, unit_id, unit_order, type, name, created_at_ms, source,
        baseline_trunk_revision, draft_head_revision, ready_draft_head_revision,
        merge_result_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  activeUnits.forEach((unit, order) => {
    const unitChangesets = changesetsByUnit.get(unit.unitId) ?? [];
    validateWorktreeChangesets(worktree, unit, unitChangesets);
    const draftHead = unitChangesets.at(-1)?.revision ?? unit.baselineRevision;
    const readyHead = status === "ready" || status === "merged" ? draftHead : null;
    const mergeResult = status === "merged" ? encode({ status: "unchanged" }) : null;
    insertUnit.run(
      worktree.worktree_id,
      unit.unitId,
      order,
      unit.type,
      unit.name,
      unit.createdAt,
      unit.source,
      unit.baselineRevision,
      draftHead,
      readyHead,
      mergeResult,
    );
  });

  migrateWorktreeSeeds(database, worktree, activeUnits);
  migrateActiveWorktreeChangesets(database, worktree, activeUnits, changesetsByUnit);
  migrateDeletedWorktreeUnits(database, worktree, baseline, created, deleted, trunkById);
}

function migrateWorktreeSeeds(
  database: Database.Database,
  worktree: LegacyWorktreeRow,
  activeUnits: readonly {
    readonly unitId: string;
    readonly type: number;
    readonly source: "trunk" | "worktree";
  }[],
): void {
  const insertSeed = database.prepare(
    `INSERT INTO collaboration_worktree_unit_seeds
       (worktree_id, unit_id, snapshot_json, sheet_blocks_json, resources_json)
     VALUES (?, ?, ?, ?, NULL)`,
  );
  for (const unit of activeUnits) {
    if (unit.source !== "worktree") {
      continue;
    }
    const row = database
      .prepare(
        `SELECT unit_id, revision, data
         FROM ${legacyTable("worktree_snapshots")}
         WHERE worktree_id = ? AND unit_id = ?
         ORDER BY revision ASC
         LIMIT 1`,
      )
      .get(worktree.worktree_id, unit.unitId) as LegacySnapshotRow | undefined;
    if (!row || row.revision !== 1) {
      throw new Error(
        `Worktree ${worktree.worktree_id} created Unit ${unit.unitId} lacks revision 1 seed`,
      );
    }
    const snapshot = parseLegacyPayload<ISnapshot>(
      row.data,
      `Worktree ${worktree.worktree_id} seed ${unit.unitId}`,
    );
    if (snapshot.unitID !== unit.unitId || snapshot.type !== unit.type || snapshot.rev !== 1) {
      throw new Error(`Worktree ${worktree.worktree_id} seed ${unit.unitId} identity is invalid`);
    }
    const blocks = legacySheetBlocks(database, unit.unitId);
    insertSeed.run(
      worktree.worktree_id,
      unit.unitId,
      encode(snapshot),
      blocks.length === 0 ? null : encode(blocks),
    );
  }
}

function migrateActiveWorktreeChangesets(
  database: Database.Database,
  worktree: LegacyWorktreeRow,
  activeUnits: readonly { readonly unitId: string; readonly type: number }[],
  changesetsByUnit: ReadonlyMap<string, readonly LegacyWorktreeChangesetRow[]>,
): void {
  const insert = database.prepare(
    `INSERT INTO collaboration_worktree_changesets
       (worktree_id, unit_id, revision, base_revision, sid, req_id, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const unit of activeUnits) {
    const usedIdentities = new Set<string>();
    for (const row of changesetsByUnit.get(unit.unitId) ?? []) {
      const identity = normalizedIdentity(row, usedIdentities, "worktree");
      const changeset = toChangeset(row, identity);
      insert.run(
        worktree.worktree_id,
        row.unit_id,
        row.revision,
        row.base_rev,
        identity.sid,
        identity.reqId,
        encode(changeset),
      );
    }
  }
}

function migrateDeletedWorktreeUnits(
  database: Database.Database,
  worktree: LegacyWorktreeRow,
  baseline: Readonly<Record<string, number>>,
  created: ReadonlyMap<
    string,
    { readonly unitId: string; readonly type: number; readonly name: string }
  >,
  deleted: ReadonlyMap<string, number>,
  trunkById: ReadonlyMap<string, LegacyUnitRow>,
): void {
  const insert = database.prepare(
    `INSERT INTO collaboration_worktree_deleted_units
       (worktree_id, unit_id, type, name, source, baseline_trunk_revision, deleted_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const [unitId, deletedAt] of deleted) {
    const createdUnit = created.get(unitId);
    const trunkUnit = trunkById.get(unitId);
    const source = createdUnit === undefined ? "trunk" : "worktree";
    const type = createdUnit?.type ?? trunkUnit?.type;
    const name = createdUnit?.name ?? trunkUnit?.name;
    if (type === undefined || name === undefined) {
      throw new Error(
        `Worktree ${worktree.worktree_id} deleted Unit ${unitId} metadata is missing`,
      );
    }
    insert.run(
      worktree.worktree_id,
      unitId,
      type,
      name,
      source,
      source === "trunk" ? baseline[unitId]! : 1,
      deletedAt,
    );
  }
}

function migrateChangesets(
  database: Database.Database,
  rows: readonly LegacyChangesetRow[],
  unitById: ReadonlyMap<string, LegacyUnitRow>,
  targetTable: "collaboration_changesets",
): void {
  const insert = database.prepare(
    `INSERT INTO ${targetTable}
       (unit_id, revision, base_revision, sid, req_id, payload_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const usedByUnit = new Map<string, Set<string>>();
  for (const row of rows) {
    const unit = requireUnit(unitById, row.unit_id);
    validateChangesetRow(row, unit.type, unit.head_rev, `trunk Unit ${row.unit_id}`);
    const used = usedByUnit.get(row.unit_id) ?? new Set<string>();
    usedByUnit.set(row.unit_id, used);
    const identity = normalizedIdentity(row, used, "core");
    insert.run(
      row.unit_id,
      row.revision,
      row.base_rev,
      identity.sid,
      identity.reqId,
      encode(toChangeset(row, identity)),
    );
  }
}

function validateWorktreeChangesets(
  worktree: LegacyWorktreeRow,
  unit: { readonly unitId: string; readonly type: number; readonly baselineRevision: number },
  rows: readonly LegacyWorktreeChangesetRow[],
): void {
  let expectedBase = unit.baselineRevision;
  for (const row of rows) {
    validateChangesetRow(
      row,
      unit.type,
      Number.MAX_SAFE_INTEGER,
      `Worktree ${worktree.worktree_id} Unit ${unit.unitId}`,
    );
    if (row.base_rev !== expectedBase || row.revision !== expectedBase + 1) {
      throw new Error(
        `Worktree ${worktree.worktree_id} Unit ${unit.unitId} changesets are not contiguous`,
      );
    }
    if (row.commit_seq < 1 || row.commit_seq > worktree.head_commit) {
      throw new Error(
        `Worktree ${worktree.worktree_id} Unit ${unit.unitId} has invalid commit_seq ${row.commit_seq}`,
      );
    }
    expectedBase = row.revision;
  }
}

function validateChangesetRow(
  row: LegacyChangesetRow,
  expectedType: number,
  maximumRevision: number,
  label: string,
): void {
  if (
    row.revision < 2 ||
    row.base_rev < 1 ||
    row.revision !== row.base_rev + 1 ||
    row.revision > maximumRevision ||
    row.type !== expectedType
  ) {
    throw new Error(`${label} changeset ${row.revision} is not valid for database v1`);
  }
}

function validateTrunkContinuity(
  units: readonly LegacyUnitRow[],
  latestSnapshotByUnit: ReadonlyMap<string, number>,
  rows: readonly LegacyChangesetRow[],
): void {
  const grouped = new Map<string, LegacyChangesetRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.unit_id) ?? [];
    current.push(row);
    grouped.set(row.unit_id, current);
  }
  for (const unit of units) {
    let expectedBase = latestSnapshotByUnit.get(unit.unit_id)!;
    for (const row of grouped.get(unit.unit_id) ?? []) {
      if (row.revision <= expectedBase) {
        continue;
      }
      if (row.base_rev !== expectedBase || row.revision !== expectedBase + 1) {
        throw new Error(
          `legacy Unit ${unit.unit_id} cannot be replayed continuously from snapshot ${latestSnapshotByUnit.get(unit.unit_id)}`,
        );
      }
      expectedBase = row.revision;
    }
    if (expectedBase !== unit.head_rev) {
      throw new Error(
        `legacy Unit ${unit.unit_id} data ends at revision ${expectedBase}, not head ${unit.head_rev}`,
      );
    }
  }
}

function toChangeset(
  row: LegacyChangesetRow,
  identity: { readonly sid: string; readonly reqId: number },
): IChangeset {
  const mutations = parseJson<
    readonly { readonly id: string; readonly data?: unknown; readonly params?: unknown }[]
  >(row.mutations, `changeset ${row.unit_id}@${row.revision} mutations`).map(toProtocolMutation);
  return {
    unitID: row.unit_id,
    type: row.type,
    baseRev: row.base_rev,
    revision: row.revision,
    userID: row.user_id,
    memberID: row.member_id,
    mutations,
    sid: identity.sid,
    reqId: identity.reqId,
    createTime: row.create_time,
    ...(row.mutation_size === null ? {} : { mutationSize: row.mutation_size }),
    ...(row.additional_fields === null ? {} : { additionalFields: row.additional_fields }),
  };
}

function toProtocolMutation(mutation: {
  readonly id: string;
  readonly data?: unknown;
  readonly params?: unknown;
}): IMutation {
  requireText(mutation.id, "legacy mutation id");
  return {
    id: mutation.id,
    data: typeof mutation.data === "string" ? mutation.data : JSON.stringify(mutation.params ?? {}),
  };
}

function normalizedIdentity(
  row: Pick<LegacyChangesetRow, "unit_id" | "revision" | "sid" | "req_id">,
  used: Set<string>,
  component: "core" | "worktree",
): { readonly sid: string; readonly reqId: number } {
  if (row.sid.length > 0 && Number.isSafeInteger(row.req_id) && row.req_id >= 1) {
    const key = changesetIdentityKey(row.sid, row.req_id);
    if (!used.has(key)) {
      used.add(key);
      return { sid: row.sid, reqId: row.req_id };
    }
  }
  const sid = `legacy-migration:${component}:${row.unit_id}:${row.revision}`;
  const reqId = 1;
  used.add(changesetIdentityKey(sid, reqId));
  return { sid, reqId };
}

function changesetIdentityKey(sid: string, reqId: number): string {
  return JSON.stringify([sid, reqId]);
}

function validateCommitSequence(
  worktree: LegacyWorktreeRow,
  commits: readonly LegacyCommitRow[],
): void {
  if (!Number.isSafeInteger(worktree.head_commit) || worktree.head_commit < 0) {
    throw new Error(`Worktree ${worktree.worktree_id} has invalid head_commit`);
  }
  if (commits.length !== worktree.head_commit) {
    throw new Error(
      `Worktree ${worktree.worktree_id} head ${worktree.head_commit} does not match commit count ${commits.length}`,
    );
  }
  commits.forEach((commit, index) => {
    if (commit.seq !== index + 1) {
      throw new Error(`Worktree ${worktree.worktree_id} commit sequence is not contiguous`);
    }
  });
}

function legacySheetBlocks(database: Database.Database, unitId: string): readonly ISheetBlock[] {
  const rows = database
    .prepare(
      `SELECT unit_id, block_id, start_row, end_row, data
       FROM ${legacyTable("sheet_blocks")}
       WHERE unit_id = ?
       ORDER BY block_id ASC`,
    )
    .all(unitId) as unknown as LegacySheetBlockRow[];
  return rows.map((row) => ({
    id: row.block_id,
    startRow: row.start_row,
    endRow: row.end_row,
    data: new Uint8Array(row.data),
  }));
}

function groupByUnit(
  rows: readonly LegacyWorktreeChangesetRow[],
): ReadonlyMap<string, readonly LegacyWorktreeChangesetRow[]> {
  const grouped = new Map<string, LegacyWorktreeChangesetRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.unit_id) ?? [];
    current.push(row);
    grouped.set(row.unit_id, current);
  }
  return grouped;
}

function parseRevisionMap(json: string, label: string): Record<string, number> {
  const value = parseJson<unknown>(json, label);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const result: Record<string, number> = {};
  for (const [unitId, revision] of Object.entries(value)) {
    requireText(unitId, `${label} Unit id`);
    requirePositiveRevision(revision, `${label} ${unitId}`);
    result[unitId] = revision;
  }
  return result;
}

function parseLegacyPayload<T>(json: string, label: string): T {
  try {
    return JSON.parse(json, (_key, value: unknown) => {
      if (
        typeof value === "object" &&
        value !== null &&
        typeof (value as Record<string, unknown>)[LEGACY_BINARY_TAG] === "string"
      ) {
        return new Uint8Array(
          Buffer.from((value as Record<string, string>)[LEGACY_BINARY_TAG]!, "base64"),
        );
      }
      return value;
    }) as T;
  } catch (error) {
    throw new Error(`${label} is not valid legacy JSON: ${asMessage(error)}`);
  }
}

function parseJson<T>(json: string, label: string): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${asMessage(error)}`);
  }
}

function encode(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (entry instanceof Uint8Array) {
      return { [BINARY_TAG]: Buffer.from(entry).toString("base64") };
    }
    return entry;
  });
}

function parseTimestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} is not a valid timestamp`);
  }
  return parsed;
}

function requirePositiveRevision(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer revision`);
  }
}

function requireSupportedUnitType(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || !SUPPORTED_UNIT_TYPES.has(value)) {
    throw new Error(`${label} has unsupported Unit type ${value}`);
  }
}

function requireText(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function requireUnit(units: ReadonlyMap<string, LegacyUnitRow>, unitId: string): LegacyUnitRow {
  const unit = units.get(unitId);
  if (!unit) {
    throw new Error(`legacy data references missing Unit ${unitId}`);
  }
  return unit;
}

function legacyStatus(status: string): "draft" | "ready" | "merged" | "discarded" {
  if (status === "draft" || status === "ready" || status === "merged" || status === "discarded") {
    return status;
  }
  throw new Error(`legacy Worktree status ${status} is not supported`);
}

function countMergingWorktrees(database: Database.Database, table: string): number {
  const row = database
    .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE status = 'merging'`)
    .get() as { readonly count: number };
  return Number(row.count);
}

function validateDatabaseV2(filename: string, connection: UniverfileSQLiteConnection): void {
  let trunk: UniverfileSQLiteDatabaseAdapter | undefined;
  let worktree: UniverfileSQLiteWorktreeDatabaseAdapter | undefined;
  try {
    trunk = new UniverfileSQLiteDatabaseAdapter({ filename, connection });
    worktree = new UniverfileSQLiteWorktreeDatabaseAdapter({ filename, connection });
    trunk.listUnits();
    for (const record of worktree.listWorktrees()) {
      worktree.listWorktreeUnits(record.worktreeId);
      worktree.listDeletedUnits(record.worktreeId);
    }
  } finally {
    if (worktree !== undefined) {
      void worktree.dispose();
    }
    if (trunk !== undefined) {
      void trunk.dispose();
    }
  }
}

function legacyTableNames(): LegacyTableName[] {
  return Object.keys(LEGACY_TABLE_COLUMNS) as LegacyTableName[];
}

function legacyTable(tableName: LegacyTableName): string {
  return `${LEGACY_PREFIX}${tableName}`;
}

function hasTable(database: Database.Database, tableName: string): boolean {
  return Boolean(
    database
      .prepare(
        `SELECT 1
         FROM sqlite_schema
         WHERE type = 'table' AND name = ?`,
      )
      .get(tableName),
  );
}

function legacyError(error: unknown): Error {
  const message = asMessage(error);
  return new Error(
    message.startsWith("UNIVERFILE_V0_MIGRATION_FAILED:")
      ? message
      : `UNIVERFILE_V0_MIGRATION_FAILED: ${message}`,
  );
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
