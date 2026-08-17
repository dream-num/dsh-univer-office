import type { UniverfileSQLiteConnection } from "../../connection.js";
import { runUniverfileSQLiteTransaction } from "../../connection.js";

export function migrateV1CandidateToV2(connection: UniverfileSQLiteConnection): number {
  const { database } = connection;
  const normalizedMergingWorktrees = Number(
    (
      database
        .prepare("SELECT COUNT(*) AS count FROM collaboration_worktrees WHERE status = 'merging'")
        .get() as { readonly count: number }
    ).count,
  );
  database.exec("PRAGMA foreign_keys = OFF;");
  try {
    runUniverfileSQLiteTransaction(database, () => {
      database.exec(`
        CREATE TABLE collaboration_worktrees_v2 (
          worktree_id TEXT PRIMARY KEY,
          sid TEXT NOT NULL,
          status TEXT NOT NULL
            CHECK (status IN ('draft', 'ready', 'merging', 'merged', 'discarded')),
          agent_id TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL,
          merged_at_ms INTEGER
        );

        INSERT INTO collaboration_worktrees_v2
          (worktree_id, sid, status, agent_id, name, created_at_ms, merged_at_ms)
        SELECT worktree_id, sid, status, agent_id, name, created_at_ms, merged_at_ms
        FROM collaboration_worktrees;

        DROP TABLE collaboration_worktree_commits;
        DROP TABLE collaboration_worktrees;
        ALTER TABLE collaboration_worktrees_v2 RENAME TO collaboration_worktrees;

        UPDATE collaboration_schema_versions
        SET version = 2
        WHERE component = 'worktree' AND version = 1;
      `);
    });
  } finally {
    database.exec("PRAGMA foreign_keys = ON;");
  }
  const violation = database.prepare("PRAGMA foreign_key_check").get();
  if (violation !== undefined) {
    throw new Error("worktree v1 to v2 migration produced a foreign-key violation");
  }
  return normalizedMergingWorktrees;
}
