import { UniverError } from './errors.ts'

/** A string with a domain identity that cannot be mixed with another id accidentally. */
type Branded<Base, Name extends string> = Base & { readonly __brand: Name }

/** Absolute local path of a Univer file. */
export type UniverFilePath = Branded<string, 'UniverFilePath'>
/** Canonical absolute path of an authorized DSH workspace. */
export type WorkspacePath = Branded<string, 'WorkspacePath'>
/** Opaque collaboration worktree id. */
export type WorktreeId = Branded<string, 'WorktreeId'>
/** Opaque Univer unit id. */
export type UnitId = Branded<string, 'UnitId'>

/** Brand an already-validated absolute Univer path. */
export function univerFilePath(value: string): UniverFilePath {
  return value as UniverFilePath
}

/** Brand an already-validated canonical workspace path. */
export function workspacePath(value: string): WorkspacePath {
  return value as WorkspacePath
}

/** Brand an already-validated non-empty worktree id. */
export function worktreeId(value: string): WorktreeId {
  if (value.trim().length === 0)
    throw new UniverError('worktreeId must be non-empty.', 'INVALID_REQUEST')
  return value as WorktreeId
}

/** Brand an already-validated non-empty unit id. */
export function unitId(value: string): UnitId {
  if (value.trim().length === 0)
    throw new UniverError('unitId must be non-empty.', 'INVALID_REQUEST')
  return value as UnitId
}
