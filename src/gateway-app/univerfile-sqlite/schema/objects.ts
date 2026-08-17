export const V0_TABLES = [
  "units",
  "changesets",
  "snapshots",
  "sheet_blocks",
  "worktrees",
  "worktree_commits",
  "worktree_changesets",
  "worktree_snapshots",
] as const;

export const CORE_V1_TABLES = [
  "collaboration_units",
  "collaboration_unit_tombstones",
  "collaboration_snapshots",
  "collaboration_changesets",
  "collaboration_sheet_blocks",
  "collaboration_resources",
] as const;

export const WORKTREE_COMMON_TABLES = [
  "collaboration_worktrees",
  "collaboration_worktree_units",
  "collaboration_worktree_changesets",
  "collaboration_worktree_unit_seeds",
  "collaboration_worktree_unit_merge_artifacts",
  "collaboration_worktree_deleted_units",
] as const;

export const WORKTREE_V1_ONLY_TABLES = ["collaboration_worktree_commits"] as const;

export const ASSET_V1_TABLES = ["collaboration_asset_blobs", "collaboration_assets"] as const;

export const CURRENT_V2_TABLES = [
  "collaboration_schema_versions",
  ...CORE_V1_TABLES,
  ...WORKTREE_COMMON_TABLES,
  ...ASSET_V1_TABLES,
] as const;

export const CURRENT_V2_INDEXES = [
  "collaboration_snapshots_nearest_revision",
  "collaboration_changesets_revision_range",
  "collaboration_worktree_changesets_revision",
  "collaboration_assets_scope",
] as const;
