export {
  DEFAULT_UNIVERFILE_SQLITE_BUSY_TIMEOUT_MS,
  UniverfileSQLiteConnection,
  runUniverfileSQLiteTransaction
} from './connection.ts'
export type { UniverfileSQLiteConnectionOptions } from './connection.ts'
export { UniverfileSQLiteError } from './errors.ts'
export { createUniverfileSQLite, openUniverfileSQLite } from './open.ts'
export type { OpenUniverfileSQLiteOptions, UniverfileSQLite } from './open.ts'
export { detectUniverfileSQLiteFormat } from './schema/detect.ts'
export type { UniverfileSQLiteFormat } from './schema/detect.ts'
export { upgradeUniverfileSQLite } from './migration/upgrade.ts'
export type {
  UniverfileUpgradeResult,
  UpgradeUniverfileSQLiteOptions
} from './migration/upgrade.ts'
export {
  UNIVERFILE_UNIT_METADATA_KEY,
  UniverfileSQLiteDatabaseAdapter
} from './database-adapters/collaboration-database-adapter.ts'
export { UniverfileSQLiteHistoryDatabaseAdapter } from './database-adapters/history-database-adapter.ts'
export type { UniverfileSQLiteHistoryDatabaseAdapterOptions } from './database-adapters/history-database-adapter.ts'
export type {
  UniverfileSQLiteDatabaseAdapterOptions,
  UniverfileUnitMetadata,
  UniverfileUnitSummary
} from './database-adapters/collaboration-database-adapter.ts'
export {
  MAX_UNIVERFILE_ASSET_BYTES,
  UniverfileSQLiteAssetStore
} from './database-adapters/asset-store.ts'
export type {
  UniverfileAssetRecord,
  UniverfileOpenedAsset,
  UniverfileSQLiteAssetStoreOptions
} from './database-adapters/asset-store.ts'
export {
  UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY,
  UNIVERFILE_WORKTREE_METADATA_KEY,
  UniverfileSQLiteWorktreeDatabaseAdapter
} from './database-adapters/worktree-database-adapter.ts'
export type {
  DeleteWorktreeUnitResult,
  UniverfileDeletedWorktreeUnit,
  UniverfileWorktreeChangeMetadata,
  UniverfileSQLiteWorktreeDatabaseAdapterOptions,
  UniverfileWorktreeMetadata,
  UniverfileWorktreeSummary,
  UniverfileWorktreeUnitSummary
} from './database-adapters/worktree-database-adapter.ts'
