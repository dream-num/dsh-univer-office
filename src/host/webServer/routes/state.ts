import type { SessionStore } from '@deepseek-ai/dsh-session'
import type { UniverService } from '../../service/univer-service.ts'
import { resolveAuthorizedFile } from '../session-scope.ts'

/** Read one file's current worktree state. */
export async function stateRoute(
  service: UniverService,
  sessions: SessionStore,
  file: unknown,
  sessionId: unknown
) {
  const authorized = await resolveAuthorizedFile(file, sessionId, sessions)
  return service.fileState({ workspace: authorized.workspace, file: authorized.path })
}
