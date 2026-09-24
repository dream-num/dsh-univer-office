/**
 * Core v2 DDL shared by `_initializeSchema` and the v1 → v2 migration: the rebuild reuses these
 * definitions so an upgraded database exposes exactly the schema a freshly created one does.
 */
export function coreUnitsTableDdl(tableName: string): string {
  return `CREATE TABLE ${tableName} (
    unit_id TEXT PRIMARY KEY,
    type INTEGER NOT NULL,
    name TEXT NOT NULL,
    head_revision INTEGER NOT NULL CHECK (head_revision >= 1),
    creator_id TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    soft_deleted_at_ms INTEGER
  );`
}

export function coreChangesetsTableDdl(tableName: string): string {
  return `CREATE TABLE ${tableName} (
    unit_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 2),
    base_revision INTEGER NOT NULL CHECK (base_revision >= 1),
    sid TEXT NOT NULL,
    req_id INTEGER NOT NULL CHECK (req_id >= 1),
    payload_json TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (unit_id, revision),
    UNIQUE (unit_id, sid, req_id),
    FOREIGN KEY (unit_id)
      REFERENCES collaboration_units(unit_id) ON DELETE CASCADE
  );`
}

/** Dropped with `collaboration_changesets`, so the rebuild has to recreate it. */
export const CORE_CHANGESETS_REVISION_INDEX_DDL = `CREATE INDEX collaboration_changesets_revision_range
  ON collaboration_changesets(unit_id, revision ASC);`
