/**
 * Creation metadata that every writer of the current component schemas derives from legacy data.
 *
 * `IChangeset.createTime` carries no declared unit: the SDK submit entry fills whole Unix seconds
 * when the caller omits the value, while this repository's own submit paths write `Date.now()`
 * milliseconds. The magnitude therefore decides how a stored value is read, and the Core adapter,
 * the Worktree adapter and the v0 reader all have to agree on it.
 */

/** Creator recorded for Units whose legacy History row is gone or never existed. */
export const ANONYMOUS_CREATOR_ID = 'anonymous'

/**
 * Magnitude boundary between whole Unix seconds and Unix milliseconds: seconds stay below it until
 * the year 5138, while millisecond timestamps pass it in 1973.
 */
export const CREATE_TIME_SECONDS_LIMIT = 1e11

/**
 * Normalizes a change-set `createTime` to Unix milliseconds. `undefined` marks an unusable value,
 * leaving the caller to apply its own fallback.
 */
export function toUnixMilliseconds(createTime: number): number | undefined {
  if (!Number.isFinite(createTime) || createTime < 0) {
    return undefined
  }
  const milliseconds = Math.floor(
    createTime >= CREATE_TIME_SECONDS_LIMIT ? createTime : createTime * 1000
  )
  return Number.isSafeInteger(milliseconds) ? milliseconds : undefined
}
