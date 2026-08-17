export {
  DEFAULT_UNIVERFILE_SQLITE_BUSY_TIMEOUT_MS,
  UniverfileSQLiteConnection,
  runUniverfileSQLiteTransaction,
} from "./connection.js";
export type { UniverfileSQLiteConnectionOptions } from "./connection.js";
export { UniverfileSQLiteError } from "./errors.js";
export { createUniverfileSQLite, openUniverfileSQLite } from "./open.js";
export type { OpenUniverfileSQLiteOptions, UniverfileSQLite } from "./open.js";
export { detectUniverfileSQLiteFormat } from "./schema/detect.js";
export type { UniverfileSQLiteFormat } from "./schema/detect.js";
export { upgradeUniverfileSQLite } from "./migration/upgrade.js";
export type {
  UniverfileUpgradeResult,
  UpgradeUniverfileSQLiteOptions,
} from "./migration/upgrade.js";
export {
  UNIVERFILE_UNIT_METADATA_KEY,
  UniverfileSQLiteDatabaseAdapter,
} from "./database-adapters/collaboration-database-adapter.js";
export type {
  UniverfileSQLiteDatabaseAdapterOptions,
  UniverfileUnitMetadata,
  UniverfileUnitSummary,
} from "./database-adapters/collaboration-database-adapter.js";
export {
  MAX_UNIVERFILE_ASSET_BYTES,
  UniverfileSQLiteAssetStore,
} from "./database-adapters/asset-store.js";
export type {
  UniverfileAssetRecord,
  UniverfileOpenedAsset,
  UniverfileSQLiteAssetStoreOptions,
} from "./database-adapters/asset-store.js";
export {
  UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY,
  UNIVERFILE_WORKTREE_METADATA_KEY,
  UniverfileSQLiteWorktreeDatabaseAdapter,
} from "./database-adapters/worktree-database-adapter.js";
export type {
  DeleteWorktreeUnitResult,
  UniverfileDeletedWorktreeUnit,
  UniverfileWorktreeChangeMetadata,
  UniverfileSQLiteWorktreeDatabaseAdapterOptions,
  UniverfileWorktreeMetadata,
  UniverfileWorktreeSummary,
  UniverfileWorktreeUnitSummary,
} from "./database-adapters/worktree-database-adapter.js";
