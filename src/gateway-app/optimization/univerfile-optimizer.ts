import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import type Database from "libsql";
import {
  GatewaySemanticErrorCode,
  type OptimizeHistoryActiveWorktreeDetails,
  type OptimizeUniverfileHistory,
  type OptimizeUniverfileReport,
  type OptimizeUniverfileWorktrees,
} from "../contract";
import { type DatabaseContext, UniverUnitRuntime } from "@univerjs-pro/collaboration-service";
import type { UniverType } from "@univerjs/protocol";
import { externalizeEmbeddedImages } from "../assets/externalize-embedded-images.js";
import { GatewaySemanticError } from "../errors.js";
import { UniverfileSQLiteAssetStore } from "../univerfile-sqlite";
import {
  UniverfileSQLiteConnection,
  detectUniverfileSQLiteFormat,
  runUniverfileSQLiteTransaction,
  upgradeUniverfileSQLite,
} from "../univerfile-sqlite";
import { UniverfileSQLiteDatabaseAdapter } from "../univerfile-sqlite";

const BINARY_TAG = "__univerCollaborationBinary";

export interface OptimizeUniverfileCopyInput {
  readonly sourcePath: string;
  readonly outputPath?: string;
  readonly images?: "externalize";
  readonly worktrees?: OptimizeUniverfileWorktrees;
  readonly history?: OptimizeUniverfileHistory;
  readonly dryRun: boolean;
}

interface PayloadSpec {
  readonly column: string;
  readonly kind: "changeset" | "generic" | "snapshot";
  readonly table: string;
  readonly worktree: boolean;
}

interface PayloadRow {
  readonly storage_rowid: number;
  readonly unit_id: string;
  readonly worktree_id?: string;
  readonly payload: string;
}

interface UnitRow {
  readonly unit_id: string;
  readonly type: number;
}

interface ActiveWorktreeRow {
  readonly worktree_id: string;
  readonly status: string;
  readonly name: string;
}

interface HeadSnapshotRow {
  readonly unit_id: string;
  readonly type: number;
  readonly payload_json: string;
}

interface CountSnapshot {
  readonly activeUnits: number;
  readonly trunkChangesets: number;
  readonly snapshots: number;
  readonly worktrees: number;
}

const PAYLOAD_SPECS: readonly PayloadSpec[] = [
  { table: "collaboration_snapshots", column: "payload_json", kind: "snapshot", worktree: false },
  {
    table: "collaboration_changesets",
    column: "payload_json",
    kind: "changeset",
    worktree: false,
  },
  {
    table: "collaboration_sheet_blocks",
    column: "payload_json",
    kind: "generic",
    worktree: false,
  },
  {
    table: "collaboration_resources",
    column: "payload_json",
    kind: "generic",
    worktree: false,
  },
  {
    table: "collaboration_worktree_changesets",
    column: "payload_json",
    kind: "changeset",
    worktree: true,
  },
  {
    table: "collaboration_worktree_unit_seeds",
    column: "snapshot_json",
    kind: "snapshot",
    worktree: true,
  },
  {
    table: "collaboration_worktree_unit_seeds",
    column: "sheet_blocks_json",
    kind: "generic",
    worktree: true,
  },
  {
    table: "collaboration_worktree_unit_seeds",
    column: "resources_json",
    kind: "generic",
    worktree: true,
  },
  {
    table: "collaboration_worktree_unit_merge_artifacts",
    column: "snapshot_json",
    kind: "snapshot",
    worktree: true,
  },
  {
    table: "collaboration_worktree_unit_merge_artifacts",
    column: "sheet_blocks_json",
    kind: "generic",
    worktree: true,
  },
  {
    table: "collaboration_worktree_unit_merge_artifacts",
    column: "resources_json",
    kind: "generic",
    worktree: true,
  },
];

/** Open the source without runtime/schema initialization; any required migration happens on a copy. */
export async function optimizeUniverfilePath(
  input: OptimizeUniverfileCopyInput,
): Promise<OptimizeUniverfileReport> {
  validateInput(input);
  const sourceFormat = detectUniverfileSQLiteFormat(input.sourcePath);
  const workingDirectory =
    sourceFormat === "v2" ? undefined : mkdtempSync(join(tmpdir(), "univer-optimize-source-"));
  const workingPath =
    workingDirectory === undefined ? input.sourcePath : join(workingDirectory, "source.univer");
  let sourceConnection: UniverfileSQLiteConnection | undefined;
  try {
    if (workingDirectory !== undefined) {
      copyFileSync(input.sourcePath, workingPath);
      upgradeUniverfileSQLite(workingPath);
    }
    sourceConnection = new UniverfileSQLiteConnection({ filename: workingPath });
    return await optimizeUniverfileCopy(sourceConnection, input);
  } finally {
    sourceConnection?.dispose();
    if (workingDirectory !== undefined) {
      rmSync(workingDirectory, { recursive: true, force: true });
    }
  }
}

/** Write an atomic optimized copy from a consistent SQLite snapshot of the read-only source. */
export async function optimizeUniverfileCopy(
  sourceConnection: UniverfileSQLiteConnection,
  input: OptimizeUniverfileCopyInput,
): Promise<OptimizeUniverfileReport> {
  validateInput(input);
  assertIntegrity(sourceConnection.database);
  const beforeBytes = statSync(input.sourcePath).size;
  const dryRunDirectory = input.dryRun
    ? mkdtempSync(join(tmpdir(), "univer-optimize-dry-run-"))
    : undefined;
  const outputPath = input.outputPath;
  const temporaryPath = input.dryRun
    ? join(dryRunDirectory as string, "source.univer")
    : `${outputPath as string}.optimize-${randomUUID()}.tmp`;
  let outputConnection: UniverfileSQLiteConnection | undefined;
  try {
    sourceConnection.database.prepare("VACUUM INTO ?").run(temporaryPath);
    outputConnection = new UniverfileSQLiteConnection({ filename: temporaryPath });
    const before = countHistory(outputConnection.database);
    rejectActiveWorktreesForHistoryReset(outputConnection.database, input.history);

    const cleanWorktrees = input.worktrees === "clean" || input.history === "reset";
    if (cleanWorktrees) {
      pruneTerminalWorktrees(outputConnection.database);
      assertNoTerminalWorktrees(outputConnection.database);
    }
    if (input.history === "reset") {
      await materializeCurrentHeads(outputConnection);
      resetCurrentHistory(outputConnection.database);
      assertResetHistory(outputConnection.database);
    }

    const imageStats = new ImageStats();
    if (input.images === "externalize") {
      const assetStore = new UniverfileSQLiteAssetStore({ connection: outputConnection });
      rewriteImagePayloads(outputConnection.database, assetStore, imageStats);
    }
    removeOutOfScopeAssets(outputConnection.database, cleanWorktrees, input.history === "reset");
    removeOrphanBlobs(outputConnection.database);
    if (cleanWorktrees || input.images === "externalize") {
      assertAssetScopes(outputConnection.database);
    }

    const afterHistory = countHistory(outputConnection.database);
    assertIntegrity(outputConnection.database);
    outputConnection.database.exec("VACUUM;");
    assertIntegrity(outputConnection.database);
    outputConnection.dispose();
    outputConnection = undefined;
    if (!input.dryRun) renameSync(temporaryPath, outputPath as string);
    return report(
      input,
      beforeBytes,
      input.dryRun ? undefined : statSync(outputPath as string).size,
      imageStats,
      {
        worktrees: {
          mode: cleanWorktrees ? "clean" : "preserve",
          impliedByHistory: input.history === "reset" && input.worktrees === undefined,
          removedWorktrees: before.worktrees - afterHistory.worktrees,
        },
        history: {
          mode: input.history ?? "preserve",
          resetUnits: input.history === "reset" ? before.activeUnits : 0,
          removedSnapshots: before.snapshots - afterHistory.snapshots,
          removedChangesets: before.trunkChangesets - afterHistory.trunkChangesets,
        },
      },
    );
  } catch (error) {
    outputConnection?.dispose();
    if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true });
    throw error;
  } finally {
    if (dryRunDirectory !== undefined) {
      rmSync(dryRunDirectory, { recursive: true, force: true });
    }
  }
}

function validateInput(input: OptimizeUniverfileCopyInput): void {
  if (input.images === undefined && input.worktrees === undefined && input.history === undefined) {
    throw new Error("NO_OPTIMIZATION_SELECTED: select --worktrees, --history, or --images");
  }
  if (input.dryRun) return;
  if (input.outputPath === undefined) {
    throw new Error("OPTIMIZE_OUTPUT_REQUIRED: outputPath is required");
  }
  const sourcePath = resolve(input.sourcePath);
  const outputPath = resolve(input.outputPath);
  if (sourcePath === outputPath) {
    throw new Error("OPTIMIZE_OUTPUT_EQUALS_SOURCE: output must differ from source");
  }
  if (extname(outputPath).toLowerCase() !== ".univer") {
    throw new Error("OPTIMIZE_OUTPUT_INVALID: output must be a .univer path");
  }
  if (existsSync(outputPath)) {
    throw new Error(`OPTIMIZE_OUTPUT_EXISTS: output already exists: ${outputPath}`);
  }
  if (!existsSync(dirname(outputPath))) {
    throw new Error(
      `OPTIMIZE_OUTPUT_PARENT_MISSING: output parent does not exist: ${dirname(outputPath)}`,
    );
  }
}

async function materializeCurrentHeads(connection: UniverfileSQLiteConnection): Promise<void> {
  const adapter = new UniverfileSQLiteDatabaseAdapter({
    filename: connection.filename,
    connection,
  });
  const runtime = new UniverUnitRuntime({ dbAdapter: adapter });
  const context = optimizationDatabaseContext();
  const units = connection.database
    .prepare(
      `SELECT unit_id, type
       FROM collaboration_units
       WHERE soft_deleted_at_ms IS NULL
       ORDER BY unit_id`,
    )
    .all() as unknown as UnitRow[];
  try {
    for (const unit of units) {
      const handle = await runtime.ensureUnit(context, unit.unit_id, unit.type as UniverType);
      try {
        await adapter.saveSnapshot(context, await runtime.createSnapshot(handle));
      } finally {
        runtime.releaseUnit(handle);
      }
    }
  } finally {
    await runtime.dispose();
    await adapter.dispose();
  }
}

function rejectActiveWorktreesForHistoryReset(
  database: Database.Database,
  history: OptimizeUniverfileHistory | undefined,
): void {
  if (history !== "reset") return;
  const active = database
    .prepare(
      `SELECT worktree_id, status, name
       FROM collaboration_worktrees
       WHERE status IN ('draft', 'ready', 'merging')
       ORDER BY created_at_ms, worktree_id`,
    )
    .all() as unknown as ActiveWorktreeRow[];
  if (active.length === 0) return;
  const details: OptimizeHistoryActiveWorktreeDetails = {
    activeWorktrees: active.map((worktree) => ({
      worktreeId: worktree.worktree_id,
      status: worktree.status,
      name: worktree.name,
    })),
  };
  throw new GatewaySemanticError(
    GatewaySemanticErrorCode.OptimizeHistoryActiveWorktrees,
    `history reset requires no active worktrees; merge or discard them first: ${active.map((worktree) => `${worktree.worktree_id} (${worktree.status})`).join(", ")}`,
    details,
  );
}

function resetCurrentHistory(database: Database.Database): void {
  const snapshots = database
    .prepare(
      `SELECT units.unit_id, units.type, snapshots.payload_json
       FROM collaboration_units AS units
       JOIN collaboration_snapshots AS snapshots
         ON snapshots.unit_id = units.unit_id
        AND snapshots.revision = units.head_revision
       WHERE units.soft_deleted_at_ms IS NULL
       ORDER BY units.unit_id`,
    )
    .all() as unknown as HeadSnapshotRow[];
  const activeUnits = countWhere(database, "collaboration_units", "soft_deleted_at_ms IS NULL");
  if (snapshots.length !== activeUnits) {
    throw new Error("OPTIMIZE_HISTORY_RESET_FAILED: materialized head snapshot is missing");
  }
  const resetSnapshots = snapshots.map((row) => {
    const value = decodeStoredJson(row.payload_json);
    if (!isRecord(value)) {
      throw new Error(`OPTIMIZE_HISTORY_RESET_FAILED: invalid snapshot for ${row.unit_id}`);
    }
    return {
      unitId: row.unit_id,
      type: row.type,
      payload: encodeStoredJson({ ...value, rev: 1 }),
    };
  });

  runUniverfileSQLiteTransaction(database, () => {
    database.exec(`
      DELETE FROM collaboration_changesets;
      DELETE FROM collaboration_units WHERE soft_deleted_at_ms IS NOT NULL;
      DELETE FROM collaboration_snapshots;
      UPDATE collaboration_units SET head_revision = 1;
      DELETE FROM collaboration_unit_tombstones;
    `);
    const insert = database.prepare(
      `INSERT INTO collaboration_snapshots (unit_id, revision, type, payload_json)
       VALUES (?, 1, ?, ?)`,
    );
    for (const snapshot of resetSnapshots) {
      insert.run(snapshot.unitId, snapshot.type, snapshot.payload);
    }
  });
}

function pruneTerminalWorktrees(database: Database.Database): void {
  runUniverfileSQLiteTransaction(database, () => {
    database.exec(`DELETE FROM collaboration_worktrees WHERE status IN ('merged', 'discarded');`);
  });
}

function assertNoTerminalWorktrees(database: Database.Database): void {
  if (countWhere(database, "collaboration_worktrees", "status IN ('merged', 'discarded')") !== 0) {
    throw new Error("OPTIMIZE_WORKTREES_CLEAN_FAILED: terminal worktrees remain");
  }
}

function assertResetHistory(database: Database.Database): void {
  if (countRows(database, "collaboration_worktrees") !== 0) {
    throw new Error("OPTIMIZE_HISTORY_RESET_FAILED: worktrees remain after reset");
  }
  if (countRows(database, "collaboration_changesets") !== 0) {
    throw new Error("OPTIMIZE_HISTORY_RESET_FAILED: trunk changesets remain after reset");
  }
  if (
    countWhere(database, "collaboration_units", "soft_deleted_at_ms IS NOT NULL") !== 0 ||
    countRows(database, "collaboration_unit_tombstones") !== 0
  ) {
    throw new Error("OPTIMIZE_HISTORY_RESET_FAILED: deleted unit history remains after reset");
  }
  const units = countWhere(database, "collaboration_units", "soft_deleted_at_ms IS NULL");
  const rows = database
    .prepare(
      `SELECT units.unit_id, units.head_revision, snapshots.revision, snapshots.payload_json
       FROM collaboration_units AS units
       LEFT JOIN collaboration_snapshots AS snapshots ON snapshots.unit_id = units.unit_id
       WHERE units.soft_deleted_at_ms IS NULL
       ORDER BY units.unit_id`,
    )
    .all() as unknown as Array<{
    readonly unit_id: string;
    readonly head_revision: number;
    readonly revision: number | null;
    readonly payload_json: string | null;
  }>;
  if (rows.length !== units) {
    throw new Error("OPTIMIZE_HISTORY_RESET_FAILED: each unit must have exactly one snapshot");
  }
  for (const row of rows) {
    const payload = row.payload_json === null ? null : decodeStoredJson(row.payload_json);
    if (row.head_revision !== 1 || row.revision !== 1 || !isRecord(payload) || payload.rev !== 1) {
      throw new Error(
        `OPTIMIZE_HISTORY_RESET_FAILED: revision-1 snapshot mismatch for ${row.unit_id}`,
      );
    }
  }
}

function assertAssetScopes(database: Database.Database): void {
  if (!tableExists(database, "collaboration_assets")) return;
  const invalid = database
    .prepare(
      `SELECT assets.asset_id
       FROM collaboration_assets AS assets
       LEFT JOIN collaboration_units AS units
         ON units.unit_id = assets.unit_id
       LEFT JOIN collaboration_worktrees AS worktrees
         ON worktrees.worktree_id = assets.worktree_id
       LEFT JOIN collaboration_worktree_units AS worktree_units
         ON worktree_units.worktree_id = assets.worktree_id
        AND worktree_units.unit_id = assets.unit_id
       WHERE (assets.worktree_id IS NULL AND units.unit_id IS NULL)
          OR (assets.worktree_id IS NOT NULL AND (
            worktrees.worktree_id IS NULL OR worktree_units.unit_id IS NULL
          ))
       LIMIT 1`,
    )
    .get() as { readonly asset_id: string } | undefined;
  if (invalid !== undefined) {
    throw new Error(`OPTIMIZE_IMAGE_SCOPE_FAILED: invalid Asset scope for ${invalid.asset_id}`);
  }
}

function removeOutOfScopeAssets(
  database: Database.Database,
  cleanedWorktrees: boolean,
  resetHistory: boolean,
): void {
  if (!tableExists(database, "collaboration_assets")) return;
  runUniverfileSQLiteTransaction(database, () => {
    if (resetHistory) {
      database.exec(`
        DELETE FROM collaboration_assets
        WHERE worktree_id IS NOT NULL
           OR unit_id NOT IN (
             SELECT unit_id FROM collaboration_units WHERE soft_deleted_at_ms IS NULL
           );
      `);
      return;
    }
    if (cleanedWorktrees) {
      database.exec(`
        DELETE FROM collaboration_assets
        WHERE worktree_id IS NOT NULL
          AND worktree_id NOT IN (SELECT worktree_id FROM collaboration_worktrees);
      `);
    }
  });
}

function removeOrphanBlobs(database: Database.Database): void {
  if (!tableExists(database, "collaboration_asset_blobs")) return;
  runUniverfileSQLiteTransaction(database, () => {
    database.exec(`
      DELETE FROM collaboration_asset_blobs
      WHERE digest NOT IN (SELECT digest FROM collaboration_assets);
    `);
  });
}

function rewriteImagePayloads(
  database: Database.Database,
  assetStore: UniverfileSQLiteAssetStore,
  stats: ImageStats,
): void {
  for (const spec of PAYLOAD_SPECS) {
    if (!tableExists(database, spec.table) || !columnExists(database, spec.table, spec.column)) {
      continue;
    }
    const worktreeSelect = spec.worktree ? ", worktree_id" : "";
    const rows = database
      .prepare(
        `SELECT rowid AS storage_rowid, unit_id${worktreeSelect}, ${spec.column} AS payload
         FROM ${spec.table}
         WHERE ${spec.column} IS NOT NULL`,
      )
      .all() as unknown as PayloadRow[];
    const update = database.prepare(`UPDATE ${spec.table} SET ${spec.column} = ? WHERE rowid = ?`);
    for (const row of rows) {
      const rewritten = rewritePayload(row.payload, spec.kind, {
        unitId: row.unit_id,
        ...(row.worktree_id === undefined ? {} : { worktreeId: row.worktree_id }),
        assetStore,
        stats,
      });
      if (rewritten !== row.payload) {
        update.run(rewritten, row.storage_rowid);
      }
    }
  }
}

function rewritePayload(
  payload: string,
  kind: PayloadSpec["kind"],
  options: RewriteOptions,
): string {
  const value = decodeStoredJson(payload);
  const withMutationData = kind === "changeset" ? rewriteMutationData(value, options) : value;
  const rewritten = rewriteValue(withMutationData, options);
  return encodeStoredJson(rewritten);
}

interface RewriteOptions {
  readonly unitId: string;
  readonly worktreeId?: string;
  readonly assetStore: UniverfileSQLiteAssetStore;
  readonly stats: ImageStats;
}

function rewriteMutationData(value: unknown, options: RewriteOptions): unknown {
  if (!isRecord(value) || !Array.isArray(value.mutations)) return value;
  return {
    ...value,
    mutations: value.mutations.map((mutation) => {
      if (!isRecord(mutation) || typeof mutation.data !== "string") return mutation;
      try {
        return {
          ...mutation,
          data: JSON.stringify(rewriteValue(JSON.parse(mutation.data), options)),
        };
      } catch {
        return mutation;
      }
    }),
  };
}

function rewriteValue(value: unknown, options: RewriteOptions): unknown {
  const withBinaryJson = rewriteBinaryJson(value, options);
  return externalizeEmbeddedImages(withBinaryJson, {
    strictStore: true,
    store: ({ bytes, filename, mediaType }) => {
      return options.assetStore.store({
        unitId: options.unitId,
        ...(options.worktreeId === undefined ? {} : { worktreeId: options.worktreeId }),
        originalFilename: filename,
        mediaType,
        bytes,
        reuseInScope: true,
      }).assetId;
    },
    onRewrite: (image) => options.stats.record(image),
  });
}

function rewriteBinaryJson(value: unknown, options: RewriteOptions): unknown {
  if (value instanceof Uint8Array) {
    try {
      const decoded = JSON.parse(new TextDecoder().decode(value)) as unknown;
      return new TextEncoder().encode(JSON.stringify(rewriteValue(decoded, options)));
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map((item) => rewriteBinaryJson(item, options));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, rewriteBinaryJson(child, options)]),
  );
}

class ImageStats {
  public references = 0;
  public sourceBytes = 0;
  private readonly bytesByDigest = new Map<string, number>();

  public record(input: {
    readonly byteSize: number;
    readonly digest: string;
    readonly source: string;
  }): void {
    this.references += 1;
    this.sourceBytes += Buffer.byteLength(input.source);
    this.bytesByDigest.set(input.digest, input.byteSize);
  }

  public get uniqueBlobs(): number {
    return this.bytesByDigest.size;
  }

  public get storedBytes(): number {
    return [...this.bytesByDigest.values()].reduce((sum, size) => sum + size, 0);
  }
}

function report(
  input: OptimizeUniverfileCopyInput,
  beforeBytes: number,
  afterBytes: number | undefined,
  imageStats: ImageStats,
  result: Pick<OptimizeUniverfileReport, "history" | "worktrees">,
): OptimizeUniverfileReport {
  return {
    sourcePath: input.sourcePath,
    ...(input.outputPath === undefined ? {} : { outputPath: input.outputPath }),
    dryRun: input.dryRun,
    beforeBytes,
    ...(afterBytes === undefined ? {} : { afterBytes }),
    images: {
      selected: input.images === "externalize",
      references: imageStats.references,
      uniqueBlobs: imageStats.uniqueBlobs,
      sourceBytes: imageStats.sourceBytes,
      storedBytes: imageStats.storedBytes,
    },
    worktrees: result.worktrees,
    history: result.history,
  };
}

function countHistory(database: Database.Database): CountSnapshot {
  return {
    activeUnits: countWhere(database, "collaboration_units", "soft_deleted_at_ms IS NULL"),
    worktrees: countRows(database, "collaboration_worktrees"),
    snapshots: countRows(database, "collaboration_snapshots"),
    trunkChangesets: countRows(database, "collaboration_changesets"),
  };
}

function countWhere(database: Database.Database, table: string, where: string): number {
  if (!tableExists(database, table)) return 0;
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`).get() as {
    count: number;
  };
  return Number(row.count);
}

function countRows(database: Database.Database, table: string): number {
  if (!tableExists(database, table)) return 0;
  return Number(
    (database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count,
  );
}

function tableExists(database: Database.Database, table: string): boolean {
  return (
    database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !==
    undefined
  );
}

function columnExists(database: Database.Database, table: string, column: string): boolean {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{
    name: string;
  }>;
  return rows.some((row) => row.name === column);
}

function assertIntegrity(database: Database.Database): void {
  const row = database.prepare("PRAGMA quick_check").get() as { quick_check: string } | undefined;
  if (row?.quick_check !== "ok") {
    throw new Error(`OPTIMIZE_INTEGRITY_FAILED: ${row?.quick_check ?? "no result"}`);
  }
  const foreignKeyFailure = database.prepare("PRAGMA foreign_key_check").get();
  if (foreignKeyFailure !== undefined) {
    throw new Error("OPTIMIZE_INTEGRITY_FAILED: foreign key violation");
  }
}

function optimizationDatabaseContext(): DatabaseContext {
  return {
    userID: "local",
    customData: {},
    request: {},
  };
}

function encodeStoredJson(value: unknown): string {
  return JSON.stringify(value, (_key, current: unknown) =>
    current instanceof Uint8Array
      ? { [BINARY_TAG]: Buffer.from(current).toString("base64") }
      : current,
  );
}

function decodeStoredJson(payload: string): unknown {
  return JSON.parse(payload, (_key, current: unknown) =>
    isBinaryEncoding(current)
      ? Uint8Array.from(Buffer.from(current[BINARY_TAG], "base64"))
      : current,
  ) as unknown;
}

function isBinaryEncoding(value: unknown): value is Record<typeof BINARY_TAG, string> {
  return (
    isRecord(value) && Object.keys(value).length === 1 && typeof value[BINARY_TAG] === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
