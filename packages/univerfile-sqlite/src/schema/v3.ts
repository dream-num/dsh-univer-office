/**
 * The current `.univer` schema: core v2, worktree v3, assets v1, and history v2.
 *
 * This is the only place that defines current tables, indexes, and component versions. The core,
 * worktree, and history layouts match the Collaboration SDK SQLite adapters. Readers for older
 * formats build on these definitions, and the stores assume the schema is already in place.
 */

export type SchemaComponentName = 'core' | 'worktree' | 'assets' | 'history'

export interface SchemaComponent {
  readonly name: SchemaComponentName
  readonly version: number
  readonly tables: readonly string[]
  readonly indexes: readonly string[]
  /** Columns that distinguish this version from earlier layouts of the same tables. */
  readonly requiredColumns: readonly (readonly [table: string, columns: readonly string[]])[]
  /** Creates every table and index of the component. */
  readonly sql: string
}

export const SCHEMA_VERSIONS_TABLE = 'collaboration_schema_versions'

export const SCHEMA_VERSIONS_TABLE_SQL = `
  CREATE TABLE collaboration_schema_versions (
    component TEXT PRIMARY KEY,
    version INTEGER NOT NULL CHECK (version >= 1)
  );
`

/** Column layout shared by schema creation and the v2-to-v3 upgrade. */
export function coreUnitsTableSql(tableName: string): string {
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

/** `created_at_ms` stores the commit time in Unix milliseconds; payload `createTime` is its whole seconds. */
export function coreChangesetsTableSql(tableName: string): string {
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

/** Column layout shared by schema creation and the v2-to-v3 upgrade. */
export function worktreeUnitsTableSql(tableName: string): string {
  return `CREATE TABLE ${tableName} (
    worktree_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    unit_order INTEGER NOT NULL CHECK (unit_order >= 0),
    type INTEGER NOT NULL,
    name TEXT NOT NULL,
    creator_id TEXT NOT NULL,
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
  );`
}

/** Column layout shared by schema creation and the v2-to-v3 upgrade. */
export function worktreeChangesetsTableSql(tableName: string): string {
  return `CREATE TABLE ${tableName} (
    worktree_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 2),
    base_revision INTEGER NOT NULL CHECK (base_revision >= 1),
    sid TEXT NOT NULL,
    req_id INTEGER NOT NULL CHECK (req_id >= 1),
    payload_json TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (worktree_id, unit_id, revision),
    UNIQUE (worktree_id, unit_id, sid, req_id),
    FOREIGN KEY (worktree_id, unit_id)
      REFERENCES collaboration_worktree_units(worktree_id, unit_id)
      ON DELETE CASCADE
  );`
}

export const CORE_CHANGESETS_INDEX_SQL = `
  CREATE INDEX collaboration_changesets_revision_range
    ON collaboration_changesets(unit_id, revision ASC);
`

export const WORKTREE_CHANGESETS_INDEX_SQL = `
  CREATE INDEX collaboration_worktree_changesets_revision
    ON collaboration_worktree_changesets(worktree_id, unit_id, revision ASC);
`

/** History records are a derived index that History Service rebuilds from trunk changesets. */
export const HISTORY_SQL = `
  CREATE TABLE collaboration_history_records (
    unit_id TEXT NOT NULL,
    start_revision INTEGER NOT NULL CHECK (start_revision >= 1),
    user_id TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
    origin INTEGER NOT NULL,
    additional_fields TEXT,
    PRIMARY KEY (unit_id, start_revision)
  );

  CREATE INDEX collaboration_history_origin_lookup
    ON collaboration_history_records(unit_id, origin, start_revision);
  CREATE INDEX collaboration_history_creator_lookup
    ON collaboration_history_records(unit_id, user_id, start_revision);
`

const CORE: SchemaComponent = {
  name: 'core',
  version: 2,
  tables: [
    'collaboration_units',
    'collaboration_unit_tombstones',
    'collaboration_snapshots',
    'collaboration_changesets',
    'collaboration_sheet_blocks',
    'collaboration_resources'
  ],
  indexes: ['collaboration_snapshots_nearest_revision', 'collaboration_changesets_revision_range'],
  requiredColumns: [
    ['collaboration_units', ['name', 'creator_id', 'created_at_ms']],
    ['collaboration_changesets', ['created_at_ms']]
  ],
  sql: `
    ${coreUnitsTableSql('collaboration_units')}

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

    ${coreChangesetsTableSql('collaboration_changesets')}

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
    ${CORE_CHANGESETS_INDEX_SQL}
  `
}

const WORKTREE: SchemaComponent = {
  name: 'worktree',
  version: 3,
  tables: [
    'collaboration_worktrees',
    'collaboration_worktree_units',
    'collaboration_worktree_changesets',
    'collaboration_worktree_unit_seeds',
    'collaboration_worktree_unit_merge_artifacts',
    'collaboration_worktree_deleted_units'
  ],
  indexes: ['collaboration_worktree_changesets_revision'],
  requiredColumns: [
    ['collaboration_worktrees', ['agent_id', 'name', 'created_at_ms', 'merged_at_ms']],
    ['collaboration_worktree_units', ['name', 'creator_id', 'created_at_ms']],
    ['collaboration_worktree_changesets', ['created_at_ms']]
  ],
  sql: `
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

    ${worktreeUnitsTableSql('collaboration_worktree_units')}

    ${worktreeChangesetsTableSql('collaboration_worktree_changesets')}

    ${WORKTREE_CHANGESETS_INDEX_SQL}

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
  `
}

const ASSETS: SchemaComponent = {
  name: 'assets',
  version: 1,
  tables: ['collaboration_asset_blobs', 'collaboration_assets'],
  indexes: ['collaboration_assets_scope'],
  requiredColumns: [],
  sql: `
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
  `
}

const HISTORY: SchemaComponent = {
  name: 'history',
  version: 2,
  tables: ['collaboration_history_records'],
  indexes: ['collaboration_history_origin_lookup', 'collaboration_history_creator_lookup'],
  requiredColumns: [
    [
      'collaboration_history_records',
      ['unit_id', 'start_revision', 'user_id', 'created_at_ms', 'origin', 'additional_fields']
    ]
  ],
  sql: HISTORY_SQL
}

/** In creation order: worktree, assets, and history tables refer to core Units by id. */
export const V3_COMPONENTS: readonly SchemaComponent[] = [CORE, WORKTREE, ASSETS, HISTORY]

export const V3_TABLES: readonly string[] = [
  SCHEMA_VERSIONS_TABLE,
  ...V3_COMPONENTS.flatMap(({ tables }) => tables)
]

export const V3_INDEXES: readonly string[] = V3_COMPONENTS.flatMap(({ indexes }) => indexes)

export function v3Component(name: SchemaComponentName): SchemaComponent {
  const component = V3_COMPONENTS.find((candidate) => candidate.name === name)
  if (component === undefined) throw new Error(`unknown schema component ${name}`)
  return component
}
