/**
 * JSON text codec for every `.univer` payload column: snapshots, changesets, Sheet blocks,
 * Worktree seeds, and merge artifacts. Binary fields become `{ [BINARY_TAG]: base64 }`, the
 * same tag the Collaboration SDK SQLite adapters write, and decode as plain `Uint8Array`.
 */
const BINARY_TAG = '__univerCollaborationBinary'

export function encodeStoredJson(value: unknown): string {
  // Read the holder value: JSON.stringify applies Buffer#toJSON before the replacer sees it.
  return JSON.stringify(
    value,
    function (this: Readonly<Record<string, unknown>>, key, current: unknown) {
      const raw = this[key]
      return raw instanceof Uint8Array
        ? { [BINARY_TAG]: Buffer.from(raw).toString('base64') }
        : current
    }
  )
}

export function decodeStoredJson<T = unknown>(payload: string): T {
  return JSON.parse(payload, (_key, current: unknown) =>
    isBinaryEncoding(current)
      ? Uint8Array.from(Buffer.from(current[BINARY_TAG], 'base64'))
      : current
  ) as T
}

function isBinaryEncoding(value: unknown): value is Record<typeof BINARY_TAG, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.keys(value).length === 1 &&
    typeof (value as Record<string, unknown>)[BINARY_TAG] === 'string'
  )
}
