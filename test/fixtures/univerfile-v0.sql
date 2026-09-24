-- Minimal pre-collaboration table layout, independent of current adapters.

CREATE TABLE units (
  unit_id,
  type,
  name,
  baseline_rev,
  head_rev,
  created_at,
  updated_at,
  deleted_at
);

CREATE TABLE changesets (
  unit_id,
  revision,
  type,
  base_rev,
  user_id,
  member_id,
  sid,
  req_id,
  mutations,
  mutation_size,
  additional_fields,
  create_time
);

CREATE TABLE snapshots (
  unit_id,
  revision,
  data
);

CREATE TABLE sheet_blocks (
  unit_id,
  block_id,
  start_row,
  end_row,
  data
);

CREATE TABLE worktrees (
  worktree_id,
  status,
  agent_id,
  name,
  baseline,
  head_commit,
  created_at,
  merged_at
);

CREATE TABLE worktree_commits (
  worktree_id,
  seq,
  message,
  changes,
  custom_tag,
  units,
  created_at
);

CREATE TABLE worktree_changesets (
  worktree_id,
  unit_id,
  revision,
  commit_seq,
  type,
  base_rev,
  user_id,
  member_id,
  sid,
  req_id,
  mutations,
  mutation_size,
  additional_fields,
  create_time
);

CREATE TABLE worktree_snapshots (
  worktree_id,
  unit_id,
  revision,
  data
);
