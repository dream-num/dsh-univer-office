import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { UniverError } from '../service/errors.ts'
import {
  resolveExistingUniverPath,
  resolveExistingWorkspacePath,
  resolveNewUniverPath,
  resolveNewWorkspacePath
} from '../service/workspace.ts'

/** Resolve the calling agent's workspace or fail closed for detached calls. */
export function toolWorkspace(exec: ToolRunContext): string {
  const cwd = exec.agent?.session.header.cwd
  if (cwd === undefined || cwd.length === 0) {
    throw new UniverError(
      'Univer tools require a calling agent with a workspace.',
      'SESSION_SCOPE_UNAVAILABLE'
    )
  }
  return cwd
}

/** Resolve an existing Univer file for one tool execution. */
export function existingToolFile(exec: ToolRunContext, file: string) {
  return resolveExistingUniverPath(toolWorkspace(exec), file)
}

/** Resolve a new Univer target for one tool execution. */
export function newToolFile(exec: ToolRunContext, file: string) {
  return resolveNewUniverPath(toolWorkspace(exec), file)
}

/** Resolve an existing non-Univer source for one tool execution. */
export function existingToolPath(exec: ToolRunContext, path: string) {
  return resolveExistingWorkspacePath(toolWorkspace(exec), path)
}

/** Resolve a new non-Univer output for one tool execution. */
export function newToolPath(exec: ToolRunContext, path: string) {
  return resolveNewWorkspacePath(toolWorkspace(exec), path)
}
