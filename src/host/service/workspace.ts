import { writableRoots } from '@deepseek-ai/dsh-sandbox'
import type { FileScope } from './session-file-scope.ts'
import { statSync } from 'node:fs'
import { lstat, realpath } from 'node:fs/promises'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { UniverError } from './errors.ts'
import { univerFilePath, workspacePath, type UniverFilePath } from './identifiers.ts'

/** One session-authorized path resolved for a service request. */
export interface AuthorizedPath {
  readonly workspace: FileScope
  readonly path: string
}

export async function resolveReadableUniverPath(scope: FileScope, value: string) {
  return asUniverPath(await resolveReadableFile(scope, value))
}

export async function resolveWritableUniverPath(scope: FileScope, value: string) {
  return asUniverPath(await resolveWritableFile(scope, value))
}

export async function resolveNewUniverPath(scope: FileScope, value: string) {
  return asUniverPath(await resolveWritableOutput(scope, value))
}

export function resolveReadableFile(scope: FileScope, value: string): Promise<AuthorizedPath> {
  return resolveAuthorizedPath(scope, value, true, canReadPath)
}

function resolveWritableFile(scope: FileScope, value: string): Promise<AuthorizedPath> {
  return resolveAuthorizedPath(scope, value, true, canWritePath)
}

/** An output file or directory may already exist or have missing parents. */
export function resolveWritableOutput(scope: FileScope, value: string): Promise<AuthorizedPath> {
  return resolveAuthorizedPath(scope, value, false, canWritePath)
}

export async function assertReadableFile(scope: FileScope, value: string): Promise<void> {
  assertSamePath(scope, value, await resolveReadableFile(scope, value))
}

export async function assertWritableFile(scope: FileScope, value: string): Promise<void> {
  assertSamePath(scope, value, await resolveWritableFile(scope, value))
}

export async function assertWritableOutput(scope: FileScope, value: string): Promise<void> {
  assertSamePath(scope, value, await resolveWritableOutput(scope, value))
}

/** Reject a different real path on the Provider's second resolution. */
function assertSamePath(scope: FileScope, value: string, resolved: AuthorizedPath): void {
  if (resolved.path !== value || scopeCwd(resolved.workspace) !== scopeCwd(scope)) {
    throw new UniverError('path changed after workspace authorization', 'SESSION_SCOPE_DENIED')
  }
}

async function resolveAuthorizedPath(
  scope: FileScope,
  value: string,
  mustExist: boolean,
  allowed: (scope: FileScope, canonical: string) => boolean
): Promise<AuthorizedPath> {
  if (value.trim().length === 0) throw new UniverError('path is required', 'INVALID_FILE_PATH')
  let workspace: string
  try {
    workspace = await realpath(scopeCwd(scope))
  } catch (error) {
    if (isPermissionError(error)) {
      throw new UniverError(
        'session workspace cannot be accessed because permission was denied',
        'FILE_PERMISSION_DENIED',
        { cause: error }
      )
    }
    const message = isMissingPathError(error)
      ? 'session workspace does not exist'
      : 'session workspace cannot be resolved'
    throw new UniverError(message, 'SESSION_SCOPE_UNAVAILABLE', { cause: error })
  }
  const candidate = isAbsolute(value) ? resolve(value) : resolve(workspace, value)
  let canonical: string
  try {
    canonical = mustExist ? await realpath(candidate) : await canonicalizePotentialPath(candidate)
  } catch (error) {
    if (isPermissionError(error)) {
      throw new UniverError(
        'path cannot be accessed because permission was denied',
        'FILE_PERMISSION_DENIED',
        { cause: error }
      )
    }
    const message =
      mustExist && isMissingPathError(error) ? 'path does not exist' : 'path cannot be resolved'
    throw new UniverError(message, 'INVALID_FILE_PATH', { cause: error })
  }
  const authorized =
    typeof scope === 'string'
      ? workspacePath(workspace)
      : { cwd: workspacePath(workspace), policy: scope.policy }
  if (!allowed(authorized, canonical)) {
    throw new UniverError('Path is outside the session file permissions.', 'SESSION_SCOPE_DENIED')
  }
  return { workspace: authorized, path: canonical }
}

export function canReadPath(scope: FileScope, canonical: string): boolean {
  return typeof scope !== 'string' || contains(scope, canonical)
}

export function canWritePath(scope: FileScope, canonical: string): boolean {
  if (typeof scope === 'string') return contains(scope, canonical)
  if (scope.policy.mode === 'danger-full-access') return true
  try {
    return writableRoots(scope.policy).some((root) => contains(root, canonical))
  } catch (cause) {
    throw new UniverError(
      'The session writable directories could not be resolved.',
      'SESSION_SCOPE_DENIED',
      { cause }
    )
  }
}

function scopeCwd(scope: FileScope): string {
  return typeof scope === 'string' ? scope : scope.cwd
}

function contains(root: string, path: string): boolean {
  const suffix = relative(root, path)
  if (suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix)) return true

  // Windows 8.3 names can spell the same directory differently even after path resolution.
  // A new output may have several missing parents before the first existing ancestor.
  try {
    const options = { bigint: true, throwIfNoEntry: false } as const
    const rootStat = statSync(root, options)
    if (!rootStat?.isDirectory() || rootStat.ino === 0n) return false
    let ancestor = path
    for (;;) {
      const entry = statSync(ancestor, options)
      if (entry?.ino === rootStat.ino && entry.dev === rootStat.dev) return true
      const parent = dirname(ancestor)
      if (parent === ancestor) return false
      ancestor = parent
    }
  } catch (cause) {
    throw new UniverError(
      'Cannot verify the path against the session file permissions.',
      'SESSION_SCOPE_DENIED',
      { cause }
    )
  }
}

async function canonicalizePotentialPath(candidate: string): Promise<string> {
  let ancestor = candidate
  for (;;) {
    try {
      const canonicalAncestor = await realpath(ancestor)
      return resolve(canonicalAncestor, relative(ancestor, candidate))
    } catch (error) {
      if (!isMissingPathError(error)) throw error
      // A dangling symlink is an existing entry, not a new child of its parent.
      const entry = await lstat(ancestor).catch((cause: unknown) => {
        if (!isMissingPathError(cause)) throw cause
        return undefined
      })
      if (entry?.isSymbolicLink()) throw error
      const parent = dirname(ancestor)
      if (parent === ancestor) throw new Error(`no existing ancestor for ${candidate}`)
      ancestor = parent
    }
  }
}

function isMissingPathError(error: unknown): boolean {
  const code = nodeErrorCode(error)
  return code === 'ENOENT' || code === 'ENOTDIR'
}

function isPermissionError(error: unknown): boolean {
  const code = nodeErrorCode(error)
  return code === 'EACCES' || code === 'EPERM'
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

function asUniverPath(
  resolved: AuthorizedPath
): AuthorizedPath & { readonly path: UniverFilePath } {
  if (extname(resolved.path).toLowerCase() !== '.univer') {
    throw new UniverError('Univer file path must end in .univer.', 'INVALID_FILE_PATH')
  }
  return { ...resolved, path: univerFilePath(resolved.path) }
}
