import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import type { Session } from '@deepseek-ai/dsh-session'
import type { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import { UniverError } from './errors.ts'
import { workspacePath, type WorkspacePath } from './identifiers.ts'

/** A host without a sandbox provider retains the original workspace-only contract. */
export type FileScope =
  | WorkspacePath
  | { readonly cwd: WorkspacePath; readonly policy: SandboxExecutionPolicy }
export type SessionPolicy = Pick<SandboxPolicyService, 'resolve'>

export function sessionFileScope(
  session: Session | undefined,
  sandbox: SessionPolicy | undefined
): FileScope {
  const cwd = session?.header.cwd
  if (session === undefined || !cwd) {
    throw new UniverError(
      'A live session with a workspace is required.',
      'SESSION_SCOPE_UNAVAILABLE'
    )
  }
  if (sandbox === undefined) return workspacePath(cwd)
  try {
    return { cwd: workspacePath(cwd), policy: sandbox.resolve({ session }) }
  } catch (cause) {
    throw new UniverError(
      'The session file policy could not be resolved.',
      'SESSION_SCOPE_UNAVAILABLE',
      { cause }
    )
  }
}
