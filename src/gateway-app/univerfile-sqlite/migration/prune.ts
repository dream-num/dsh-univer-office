import type Database from "libsql";
import { runUniverfileSQLiteTransaction } from "../connection.js";
import { CURRENT_V2_INDEXES, CURRENT_V2_TABLES } from "../schema/objects.js";

interface SchemaObjectRow {
  readonly name: string;
  readonly sql: string | null;
  readonly type: "index" | "table" | "trigger" | "view";
}

const CURRENT_TABLES = new Set<string>(CURRENT_V2_TABLES);
const CURRENT_INDEXES = new Set<string>(CURRENT_V2_INDEXES);

/**
 * Removes source-only SQLite objects after their supported content has been migrated.
 *
 * The source remains available byte-for-byte in the upgrade backup. The candidate contains only
 * the current owned schema so retired caches and unrelated application tables cannot influence a
 * later format detection or adapter initialization.
 */
export function pruneCandidateToCurrentV2Schema(database: Database.Database): void {
  const objects = database
    .prepare(
      `SELECT type, name, sql
       FROM sqlite_schema
       WHERE type IN ('table', 'index', 'trigger', 'view')
         AND name NOT LIKE 'sqlite_%'`,
    )
    .all() as unknown as SchemaObjectRow[];

  const views = objects.filter(({ type }) => type === "view");
  const triggers = objects.filter(({ type }) => type === "trigger");
  const indexes = objects.filter(
    ({ name, sql, type }) => type === "index" && sql !== null && !CURRENT_INDEXES.has(name),
  );
  const tables = objects.filter(({ name, type }) => type === "table" && !CURRENT_TABLES.has(name));

  database.exec("PRAGMA foreign_keys = OFF;");
  try {
    runUniverfileSQLiteTransaction(database, () => {
      for (const object of views) database.exec(`DROP VIEW ${identifier(object.name)};`);
      for (const object of triggers) database.exec(`DROP TRIGGER ${identifier(object.name)};`);
      for (const object of indexes) database.exec(`DROP INDEX ${identifier(object.name)};`);
      for (const object of tables) database.exec(`DROP TABLE ${identifier(object.name)};`);
    });
  } finally {
    database.exec("PRAGMA foreign_keys = ON;");
  }

  if (database.prepare("PRAGMA foreign_key_check").get() !== undefined) {
    throw new Error("pruning source-only schema produced a foreign-key violation");
  }
}

function identifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}
