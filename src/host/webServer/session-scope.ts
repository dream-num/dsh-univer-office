import { SessionId, type SessionStore } from '@deepseek-ai/dsh-session'
import { UniverError } from '../service/errors.ts'
import { resolveExistingUniverPath } from '../service/workspace.ts'

/** Resolve a browser file only when it belongs to the addressed live session. */
export async function resolveAuthorizedFile(
  value: unknown,
  sessionId: unknown,
  sessions: SessionStore
) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new UniverError('file is required', 'INVALID_REQUEST')
  }
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new UniverError('sessionId is required', 'INVALID_REQUEST')
  }
  const cwd = sessions.get(SessionId(sessionId))?.header.cwd
  if (cwd === undefined)
    throw new UniverError('session is unavailable or has no workspace', 'SESSION_SCOPE_UNAVAILABLE')
  return resolveExistingUniverPath(cwd, value)
}
