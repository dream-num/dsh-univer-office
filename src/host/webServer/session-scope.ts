import { sessionFileScope, type SessionPolicy } from '../service/session-file-scope.ts'
import type { FileAccess } from '../service/workspace.ts'
import { SessionId, type SessionStore } from '@deepseek-ai/dsh-session'
import { UniverError } from '../service/errors.ts'
import { resolveExistingUniverPath } from '../service/workspace.ts'

/** Resolve a browser file only when it belongs to the addressed live session. */
export async function resolveAuthorizedFile(
  value: unknown,
  sessionId: unknown,
  sessions: SessionStore,
  access: FileAccess,
  sandbox?: () => SessionPolicy | undefined
) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new UniverError('file is required', 'INVALID_REQUEST')
  }
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new UniverError('sessionId is required', 'INVALID_REQUEST')
  }
  const scope = sessionFileScope(sessions.get(SessionId(sessionId)), sandbox?.())
  return resolveExistingUniverPath(scope, value, access)
}
