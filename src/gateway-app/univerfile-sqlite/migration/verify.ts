import { createHash } from "node:crypto";
import { UniverfileSQLiteConnection } from "../connection.js";
import { UniverfileSQLiteAssetStore } from "../database-adapters/asset-store.js";
import { UniverfileSQLiteDatabaseAdapter } from "../database-adapters/collaboration-database-adapter.js";
import { UniverfileSQLiteHistoryDatabaseAdapter } from "../database-adapters/history-database-adapter.js";
import { UniverfileSQLiteWorktreeDatabaseAdapter } from "../database-adapters/worktree-database-adapter.js";
import { UniverfileSQLiteError } from "../errors.js";
import { detectUniverfileSQLiteFormat } from "../schema/detect.js";

interface AssetRow {
  readonly asset_id: string;
  readonly digest: string;
  readonly bytes: Uint8Array | ArrayBuffer;
  readonly byte_size: number;
}

export interface UniverfileVerification {
  readonly units: number;
  readonly worktrees: number;
  readonly assets: number;
}

export function verifyV2Candidate(filename: string): UniverfileVerification {
  let connection: UniverfileSQLiteConnection | undefined;
  let trunk: UniverfileSQLiteDatabaseAdapter | undefined;
  let worktrees: UniverfileSQLiteWorktreeDatabaseAdapter | undefined;
  let history: UniverfileSQLiteHistoryDatabaseAdapter | undefined;
  try {
    if (detectUniverfileSQLiteFormat(filename) !== "v2") {
      throw new Error("candidate did not identify as v2");
    }
    connection = new UniverfileSQLiteConnection({ filename });
    const integrityRow = connection.database.prepare("PRAGMA integrity_check").get() as
      | Readonly<Record<string, unknown>>
      | undefined;
    const integrity = integrityRow === undefined ? undefined : Object.values(integrityRow)[0];
    if (integrity !== "ok") throw new Error(`SQLite integrity check returned ${String(integrity)}`);
    if (connection.database.prepare("PRAGMA foreign_key_check").get() !== undefined) {
      throw new Error("SQLite foreign-key check failed");
    }
    trunk = new UniverfileSQLiteDatabaseAdapter({ filename, connection });
    worktrees = new UniverfileSQLiteWorktreeDatabaseAdapter({ filename, connection });
    history = new UniverfileSQLiteHistoryDatabaseAdapter({ connection });
    const assetStore = new UniverfileSQLiteAssetStore({ connection });
    const units = trunk.listUnits();
    const worktreeRows = worktrees.listWorktrees();
    for (const worktree of worktreeRows) {
      worktrees.listWorktreeUnits(worktree.worktreeId);
      worktrees.listDeletedUnits(worktree.worktreeId);
    }
    const assets = connection.database
      .prepare(
        `SELECT a.asset_id, a.digest, b.bytes, b.byte_size
         FROM collaboration_assets a
         JOIN collaboration_asset_blobs b ON b.digest = a.digest`,
      )
      .all() as unknown as AssetRow[];
    for (const asset of assets) {
      const bytes = asset.bytes instanceof ArrayBuffer ? new Uint8Array(asset.bytes) : asset.bytes;
      if (bytes.byteLength !== asset.byte_size) {
        throw new Error(`Asset ${asset.asset_id} byte size does not match its blob`);
      }
      const opened = assetStore.open(asset.asset_id);
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (
        digest !== asset.digest ||
        opened === null ||
        opened.bytes.byteLength !== asset.byte_size
      ) {
        throw new Error(`Asset ${asset.asset_id} failed digest verification`);
      }
    }
    return { units: units.length, worktrees: worktreeRows.length, assets: assets.length };
  } catch (error) {
    throw new UniverfileSQLiteError(
      "VERIFICATION_FAILED",
      `v2 candidate verification failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  } finally {
    if (history !== undefined) void history.dispose();
    if (worktrees !== undefined) void worktrees.dispose();
    if (trunk !== undefined) void trunk.dispose();
    connection?.dispose();
  }
}
