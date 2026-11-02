-- Frozen schema from the pre-1.0.0 Gateway (format v2). Keep independent of current adapters.

CREATE TABLE collaboration_schema_versions (
  component TEXT PRIMARY KEY,
  version INTEGER NOT NULL CHECK (version >= 1)
);

CREATE TABLE collaboration_units (
  unit_id TEXT PRIMARY KEY,
  type INTEGER NOT NULL,
  name TEXT NOT NULL,
  head_revision INTEGER NOT NULL CHECK (head_revision >= 1),
  created_at_ms INTEGER NOT NULL,
  soft_deleted_at_ms INTEGER
);

CREATE TABLE collaboration_unit_tombstones (
  unit_id TEXT PRIMARY KEY,
  purged_at INTEGER NOT NULL
);

CREATE TABLE collaboration_snapshots (
  unit_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  type INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (unit_id, revision),
  FOREIGN KEY (unit_id)
    REFERENCES collaboration_units(unit_id) ON DELETE CASCADE
);

CREATE TABLE collaboration_changesets (
  unit_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 2),
  base_revision INTEGER NOT NULL CHECK (base_revision >= 1),
  sid TEXT NOT NULL,
  req_id INTEGER NOT NULL CHECK (req_id >= 1),
  payload_json TEXT NOT NULL,
  PRIMARY KEY (unit_id, revision),
  UNIQUE (unit_id, sid, req_id),
  FOREIGN KEY (unit_id)
    REFERENCES collaboration_units(unit_id) ON DELETE CASCADE
);

CREATE TABLE collaboration_sheet_blocks (
  unit_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (unit_id, block_id),
  FOREIGN KEY (unit_id)
    REFERENCES collaboration_units(unit_id) ON DELETE CASCADE
);

CREATE TABLE collaboration_resources (
  unit_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (unit_id, resource_id),
  FOREIGN KEY (unit_id)
    REFERENCES collaboration_units(unit_id) ON DELETE CASCADE
);

CREATE INDEX collaboration_snapshots_nearest_revision
  ON collaboration_snapshots(unit_id, revision DESC);
CREATE INDEX collaboration_changesets_revision_range
  ON collaboration_changesets(unit_id, revision ASC);

INSERT INTO collaboration_schema_versions (component, version)
VALUES ('core', 1);

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

CREATE TABLE collaboration_asset_blobs (
  digest TEXT PRIMARY KEY CHECK (length(digest) = 64),
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  bytes BLOB NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE collaboration_assets (
  asset_id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL,
  worktree_id TEXT,
  digest TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  FOREIGN KEY (digest) REFERENCES collaboration_asset_blobs(digest) ON DELETE RESTRICT
) STRICT;

CREATE INDEX collaboration_assets_scope
  ON collaboration_assets(unit_id, worktree_id, created_at_ms, asset_id);

INSERT INTO collaboration_schema_versions (component, version)
VALUES ('assets', 1);

CREATE TABLE collaboration_history_revisions (
  unit_id TEXT NOT NULL,
  type INTEGER NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  user_id TEXT NOT NULL,
  commands_json TEXT NOT NULL,
  committed_at INTEGER NOT NULL CHECK (committed_at >= 0),
  additional_fields TEXT,
  origin INTEGER NOT NULL,
  history_revision INTEGER NOT NULL CHECK (history_revision >= 1),
  force_next_history INTEGER NOT NULL,
  restored_revision INTEGER,
  PRIMARY KEY (unit_id, revision)
);

CREATE INDEX collaboration_history_record_lookup
  ON collaboration_history_revisions(unit_id, history_revision DESC);
CREATE INDEX collaboration_history_creator_lookup
  ON collaboration_history_revisions(unit_id, user_id);

INSERT INTO collaboration_schema_versions (component, version)
VALUES ('history', 1);
