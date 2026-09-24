/**
 * v2 History storage: one row per segment start.
 *
 * `endRevision` is deliberately absent. History Service derives a segment's end from the next
 * segment's `start_revision`, so persisting it would only add a range end that a repair pass has to
 * keep in sync. The record index serves `getLatestRecord` and the newest-first page scan in
 * `listRecords`; the creator index serves the grouping in `listCreators`. Both index names are the
 * ones registered as current schema objects, so database pruning keeps them.
 *
 * `origin` intentionally carries no CHECK constraint: v1 accepted any integer there and validated it
 * on read, so adding one here would turn a single unreadable Unit into a migration-wide failure.
 */
export const HISTORY_SCHEMA_TABLE_DDL = `
  CREATE TABLE collaboration_history_records (
    unit_id TEXT NOT NULL,
    start_revision INTEGER NOT NULL CHECK (start_revision >= 1),
    user_id TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
    origin INTEGER NOT NULL,
    additional_fields TEXT,
    PRIMARY KEY (unit_id, start_revision)
  );
`

export const HISTORY_SCHEMA_INDEX_DDL = `
  CREATE INDEX collaboration_history_record_lookup
    ON collaboration_history_records(unit_id, start_revision DESC);
  CREATE INDEX collaboration_history_creator_lookup
    ON collaboration_history_records(unit_id, user_id);
`
