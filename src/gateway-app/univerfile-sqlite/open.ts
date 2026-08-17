import { existsSync, unlinkSync } from "node:fs";
import { UniverfileSQLiteConnection } from "./connection.js";
import { UniverfileSQLiteAssetStore } from "./database-adapters/asset-store.js";
import { UniverfileSQLiteDatabaseAdapter } from "./database-adapters/collaboration-database-adapter.js";
import { UniverfileSQLiteWorktreeDatabaseAdapter } from "./database-adapters/worktree-database-adapter.js";
import { UniverfileSQLiteError } from "./errors.js";
import {
  upgradeUniverfileSQLite,
  type UniverfileUpgradeResult,
  type UpgradeUniverfileSQLiteOptions,
} from "./migration/upgrade.js";

export interface OpenUniverfileSQLiteOptions extends UpgradeUniverfileSQLiteOptions {
  readonly busyTimeoutMs?: number;
}

export interface UniverfileSQLite {
  readonly filename: string;
  readonly connection: UniverfileSQLiteConnection;
  readonly databaseAdapter: UniverfileSQLiteDatabaseAdapter;
  readonly worktreeDatabaseAdapter: UniverfileSQLiteWorktreeDatabaseAdapter;
  readonly assetStore: UniverfileSQLiteAssetStore;
  readonly upgrade: UniverfileUpgradeResult;
  dispose(): Promise<void>;
}

export function openUniverfileSQLite(
  filename: string,
  options: OpenUniverfileSQLiteOptions = {},
): UniverfileSQLite {
  if (!existsSync(filename)) {
    throw new UniverfileSQLiteError("FILE_NOT_FOUND", `.univer file not found: ${filename}`);
  }
  const upgrade = upgradeUniverfileSQLite(filename, options);
  return openCurrent(filename, upgrade, options.busyTimeoutMs);
}

export function createUniverfileSQLite(
  filename: string,
  options: Pick<OpenUniverfileSQLiteOptions, "busyTimeoutMs"> = {},
): UniverfileSQLite {
  if (filename !== ":memory:" && existsSync(filename)) {
    throw new UniverfileSQLiteError("FILE_EXISTS", `.univer file already exists: ${filename}`);
  }
  try {
    return openCurrent(filename, { status: "unchanged", format: "v2" }, options.busyTimeoutMs);
  } catch (error) {
    if (filename !== ":memory:" && existsSync(filename)) unlinkSync(filename);
    throw error;
  }
}

function openCurrent(
  filename: string,
  upgrade: UniverfileUpgradeResult,
  busyTimeoutMs: number | undefined,
): UniverfileSQLite {
  const connection = new UniverfileSQLiteConnection({
    filename,
    ...(busyTimeoutMs === undefined ? {} : { busyTimeoutMs }),
  });
  let databaseAdapter: UniverfileSQLiteDatabaseAdapter | undefined;
  let worktreeDatabaseAdapter: UniverfileSQLiteWorktreeDatabaseAdapter | undefined;
  try {
    const trunk = new UniverfileSQLiteDatabaseAdapter({ filename, connection });
    databaseAdapter = trunk;
    const worktree = new UniverfileSQLiteWorktreeDatabaseAdapter({ filename, connection });
    worktreeDatabaseAdapter = worktree;
    const assetStore = new UniverfileSQLiteAssetStore({ connection });
    return {
      filename,
      connection,
      databaseAdapter: trunk,
      worktreeDatabaseAdapter: worktree,
      assetStore,
      upgrade,
      async dispose(): Promise<void> {
        await worktree.dispose();
        await trunk.dispose();
        connection.dispose();
      },
    };
  } catch (error) {
    if (worktreeDatabaseAdapter !== undefined) void worktreeDatabaseAdapter.dispose();
    if (databaseAdapter !== undefined) void databaseAdapter.dispose();
    connection.dispose();
    throw error;
  }
}
