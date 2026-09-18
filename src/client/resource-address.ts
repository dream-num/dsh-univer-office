/**
 * The DSH resource-address grammar for files (`dsh-resource://file/…`).
 *
 * DSH's right Sidebar opens a file BY ADDRESS, and that address is the tab's
 * content identity: the same address is the same tab. This plugin only
 * CONSUMES addresses — the native sidebar hands one to every registered tab
 * body — so only the parsing half of the grammar is mirrored here.
 *
 * It is mirrored rather than imported because the client bundle's purity gate
 * forbids value-importing an unlisted `@deepseek-ai/*` package, which is the
 * same reason `dsh-better-sidebar` mirrors it. Keep this in step with
 * `@deepseek-ai/dsh-util-workspace-path`'s `file-address` module.
 *
 * Every id and path segment is component-encoded, so a name carrying `#`, `?`
 * or a space survives the round trip; `:` stays literal so a drive letter reads
 * as written.
 */

/** The scheme and type every file address opens with. */
export const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'

/** A parsed file address, in one of the two scopes DSH spells. */
export type FileAddress =
  | {
      readonly scope: 'session'
      /** The session whose workspace root resolves the path. */
      readonly sessionId: string
      /** Absolute or workspace-relative `/`-separated path; empty for the workspace root. */
      readonly path: string
    }
  | {
      readonly scope: 'absolute'
      /** Absolute `/`-separated path, with no session to scope it. */
      readonly path: string
    }

/** Whether a decoded first path segment is a Windows drive (`C:`). */
function isDriveSegment(segment: string | undefined): boolean {
  return segment !== undefined && /^[A-Za-z]:$/.test(segment)
}

/**
 * Read a file address back into its parts without resolving `.` or `..`.
 * Query and fragment suffixes are ignored and encoded path segments are
 * decoded.
 * @param address - a candidate address.
 * @returns the parts, or undefined when the string is not a `file:` address in
 *   a known scope with a path, or a segment is not validly encoded.
 */
export function parseFileAddress(address: string): FileAddress | undefined {
  try {
    if (!address.startsWith(FILE_ADDRESS_PREFIX)) return undefined
    const end = address.search(/[?#]/)
    const [scope, ...rest] = address
      .slice(FILE_ADDRESS_PREFIX.length, end === -1 ? undefined : end)
      .split('/')
    if (scope === 'session') {
      const [id, ...segments] = rest
      if (id === undefined || id === '' || segments.length === 0) return undefined
      return {
        scope,
        sessionId: decodeURIComponent(id),
        path: segments.map(decodeURIComponent).join('/')
      }
    }
    if (scope === 'absolute') {
      // An empty first segment with more behind it is a UNC path's `//`; alone
      // it is no path.
      const unc = rest[0] === '' && rest.length > 1
      const segments = (unc ? rest.slice(1) : rest).map(decodeURIComponent)
      if (segments.length === 0 || segments[0] === '') return undefined
      if (unc) return { scope, path: `//${segments.join('/')}` }
      return {
        scope,
        path: isDriveSegment(segments[0]) ? segments.join('/') : `/${segments.join('/')}`
      }
    }
    return undefined
  } catch {
    // `decodeURIComponent` throws URIError on a malformed escape.
    return undefined
  }
}

/**
 * The decoded last path segment of an address, used as the readable tab title.
 * The whole address stays the content identity, so this shortens the chip text
 * only; an address with no readable segment falls back to itself.
 */
export function fileAddressBasename(address: string): string {
  const parsed = parseFileAddress(address)
  const segments = (parsed?.path ?? address).split('/').filter((segment) => segment.length > 0)
  return segments[segments.length - 1] ?? address
}
