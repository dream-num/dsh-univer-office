// Public interface of @univer/univerfile-sqlite. Anything not exported here is internal.
export { openUniverfile } from './open.ts'
export type { OpenUniverfileOptions, Univerfile } from './open.ts'
export { UniverfileError } from './errors.ts'
export type { UniverfileUpgradeOutcome, UniverfileUpgradeSourceFormat } from './upgrade/upgrade.ts'
export type { UniverfileVerification } from './upgrade/verify.ts'

export { UNIVERFILE_UNIT_METADATA_KEY } from './stores/trunk.ts'
export type {
  UniverfileTrunkStore,
  UniverfileUnitMetadata,
  UniverfileUnitSummary
} from './stores/trunk.ts'

export {
  UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY,
  UNIVERFILE_WORKTREE_METADATA_KEY
} from './stores/worktree.ts'
export type {
  DeleteWorktreeUnitResult,
  UniverfileDeletedWorktreeUnit,
  UniverfileWorktreeChangeMetadata,
  UniverfileWorktreeMetadata,
  UniverfileWorktreeStore,
  UniverfileWorktreeSummary,
  UniverfileWorktreeUnitSummary
} from './stores/worktree.ts'

export type { UniverfileHistoryStore } from './stores/history.ts'

export { MAX_UNIVERFILE_ASSET_BYTES } from './stores/assets.ts'
export type {
  UniverfileAssetRecord,
  UniverfileAssetStore,
  UniverfileOpenedAsset,
  UniverfileStoreAssetInput
} from './stores/assets.ts'
