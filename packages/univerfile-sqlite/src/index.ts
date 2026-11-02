export {
  DEFAULT_UNIVERFILE_SQLITE_BUSY_TIMEOUT_MS,
  UniverfileSQLiteConnection
} from './driver/connection.ts'
export { runUniverfileSQLiteTransaction } from './driver/transaction.ts'
export type { UniverfileSQLiteConnectionOptions } from './driver/connection.ts'
export { UniverfileSQLiteError } from './errors.ts'
export { createUniverfileSQLite, openUniverfileSQLite } from './open.ts'
export type { OpenUniverfileSQLiteOptions, UniverfileSQLite } from './open.ts'
export { detectUniverfileSQLiteFormat } from './upgrade/detect.ts'
export type { UniverfileSQLiteFormat } from './upgrade/detect.ts'
export { upgradeUniverfileSQLite } from './upgrade/upgrade.ts'
export type { UniverfileUpgradeResult, UpgradeUniverfileSQLiteOptions } from './upgrade/upgrade.ts'
export { UNIVERFILE_UNIT_METADATA_KEY, UniverfileSQLiteDatabaseAdapter } from './stores/trunk.ts'
export { UniverfileSQLiteHistoryDatabaseAdapter } from './stores/history.ts'
export type { UniverfileSQLiteHistoryDatabaseAdapterOptions } from './stores/history.ts'
export type {
  UniverfileSQLiteDatabaseAdapterOptions,
  UniverfileUnitMetadata,
  UniverfileUnitSummary
} from './stores/trunk.ts'
export { MAX_UNIVERFILE_ASSET_BYTES, UniverfileSQLiteAssetStore } from './stores/assets.ts'
export type {
  UniverfileAssetRecord,
  UniverfileOpenedAsset,
  UniverfileSQLiteAssetStoreOptions
} from './stores/assets.ts'
export {
  UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY,
  UNIVERFILE_WORKTREE_METADATA_KEY,
  UniverfileSQLiteWorktreeDatabaseAdapter
} from './stores/worktree.ts'
export type {
  DeleteWorktreeUnitResult,
  UniverfileDeletedWorktreeUnit,
  UniverfileWorktreeChangeMetadata,
  UniverfileSQLiteWorktreeDatabaseAdapterOptions,
  UniverfileWorktreeMetadata,
  UniverfileWorktreeSummary,
  UniverfileWorktreeUnitSummary
} from './stores/worktree.ts'
