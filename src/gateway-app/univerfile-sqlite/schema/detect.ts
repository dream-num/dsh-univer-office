import Database from "libsql";
import { UniverfileSQLiteError } from "../errors.js";
import {
  ASSET_V1_TABLES,
  CORE_V1_TABLES,
  HISTORY_V1_TABLES,
  V0_TABLES,
  WORKTREE_COMMON_TABLES,
  WORKTREE_V1_ONLY_TABLES,
} from "./objects.js";

export type UniverfileSQLiteFormat = "v0" | "v1" | "v2";

interface NameRow {
  readonly name: string;
}

interface VersionRow {
  readonly component: string;
  readonly version: number;
}

interface ColumnRow {
  readonly name: string;
}

export function detectUniverfileSQLiteFormat(filename: string): UniverfileSQLiteFormat {
  let database: Database.Database | undefined;
  try {
    database = new Database(filename, { readonly: true, fileMustExist: true });
    const tables = new Set(
      (
        database
          .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
          .all() as unknown as NameRow[]
      ).map(({ name }) => name),
    );
    if (!tables.has("collaboration_schema_versions")) {
      const presentV0 = V0_TABLES.filter((table) => tables.has(table));
      if (presentV0.length === V0_TABLES.length) return "v0";
      if (presentV0.length > 0) {
        const missing = V0_TABLES.filter((table) => !tables.has(table));
        throw unsupported(`legacy v0 schema is incomplete: missing ${missing.join(", ")}`);
      }
      throw unsupported("component schema versions table is missing");
    }
    const versions = new Map(
      (
        database
          .prepare("SELECT component, version FROM collaboration_schema_versions")
          .all() as unknown as VersionRow[]
      ).map(({ component, version }) => [component, version]),
    );
    const known = new Set(["core", "worktree", "assets", "history"]);
    const unknown = [...versions.keys()].filter((component) => !known.has(component));
    if (unknown.length > 0) {
      throw unsupported(`unknown schema components: ${unknown.join(", ")}`);
    }
    if (versions.get("core") !== 1) throw unsupported("core schema version must be v1");
    const worktreeVersion = versions.get("worktree");
    if (worktreeVersion !== 1 && worktreeVersion !== 2) {
      throw unsupported(`worktree schema version ${String(worktreeVersion)} is not supported`);
    }

    const assetVersion = versions.get("assets");
    const presentAssetTables = ASSET_V1_TABLES.filter((table) => tables.has(table));
    const hasCompleteAssetSchema =
      assetVersion === 1 && presentAssetTables.length === ASSET_V1_TABLES.length;
    const hasNoAssetSchema = assetVersion === undefined && presentAssetTables.length === 0;
    if (!hasCompleteAssetSchema && !(worktreeVersion === 1 && hasNoAssetSchema)) {
      throw unsupported("assets schema must be complete, or absent on a Gateway v1 file");
    }

    const historyVersion = versions.get("history");
    const presentHistoryTables = HISTORY_V1_TABLES.filter((table) => tables.has(table));
    const hasCompleteHistorySchema =
      historyVersion === 1 && presentHistoryTables.length === HISTORY_V1_TABLES.length;
    const hasNoHistorySchema = historyVersion === undefined && presentHistoryTables.length === 0;
    if (!hasCompleteHistorySchema && !hasNoHistorySchema) {
      throw unsupported("history schema must be complete or absent");
    }

    const required: string[] = [...CORE_V1_TABLES, ...WORKTREE_COMMON_TABLES];
    if (hasCompleteAssetSchema) required.push(...ASSET_V1_TABLES);
    if (hasCompleteHistorySchema) required.push(...HISTORY_V1_TABLES);
    if (worktreeVersion === 1) required.push(...WORKTREE_V1_ONLY_TABLES);
    const missing = required.filter((table) => !tables.has(table));
    if (missing.length > 0) {
      throw unsupported(`schema is incomplete: missing ${missing.join(", ")}`);
    }

    const worktreeColumns = columns(database, "collaboration_worktrees");
    const hasHeadCommit = worktreeColumns.has("head_commit");
    if (worktreeVersion === 1 && !hasHeadCommit) {
      throw unsupported("worktree v1 logical commit storage is incomplete");
    }
    return worktreeVersion === 1 ? "v1" : "v2";
  } catch (error) {
    if (error instanceof UniverfileSQLiteError) throw error;
    throw new UniverfileSQLiteError(
      "UNSUPPORTED_SCHEMA",
      `cannot identify .univer schema: ${message(error)}`,
      { cause: error },
    );
  } finally {
    database?.close();
  }
}

function columns(database: Database.Database, table: string): ReadonlySet<string> {
  return new Set(
    (database.prepare(`PRAGMA table_info(${table})`).all() as unknown as ColumnRow[]).map(
      ({ name }) => name,
    ),
  );
}

function unsupported(message: string): UniverfileSQLiteError {
  return new UniverfileSQLiteError("UNSUPPORTED_SCHEMA", message);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
