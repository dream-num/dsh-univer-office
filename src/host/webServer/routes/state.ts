import type { SessionStore } from '@deepseek-ai/dsh-session'
import type { FileState } from '../../../shared/wire/state.ts'
import type { UniverService } from '../../service/univer-service.ts'
import { resolveAuthorizedFile } from '../session-scope.ts'

/** Read one file's current worktree state, with Viewer targets scoped to this browser session. */
export async function stateRoute(
  service: UniverService,
  sessions: SessionStore,
  file: unknown,
  sessionId: unknown
) {
  const authorized = await resolveAuthorizedFile(file, sessionId, sessions)
  const state = await service.fileState({ workspace: authorized.workspace, file: authorized.path })
  // Viewer targets are same-origin relative paths; the named session is what later /uf requests
  // are scoped against, so the Host — not the Client — must place it in every projected URL.
  return typeof sessionId === 'string' ? withSessionScope(state, sessionId) : state
}

function withSessionScope(state: FileState, sessionId: string): FileState {
  const query = `sessionId=${encodeURIComponent(sessionId)}`
  const append = (url: string): string => `${url}&${query}`
  return {
    ...state,
    viewerUrl: state.viewerUrl === null ? null : `${state.viewerUrl}&${query}`,
    worktrees: state.worktrees.map((worktree) => ({
      ...worktree,
      ...(worktree.openUrl === undefined ? {} : { openUrl: append(worktree.openUrl) }),
      ...(worktree.worktreeUrl === undefined ? {} : { worktreeUrl: append(worktree.worktreeUrl) }),
      ...(worktree.mergeUrl === undefined ? {} : { mergeUrl: append(worktree.mergeUrl) }),
      units: worktree.units.map((unit) => ({
        ...unit,
        ...(unit.worktreeUrl === undefined ? {} : { worktreeUrl: append(unit.worktreeUrl) }),
        ...(unit.mergeUrl === undefined ? {} : { mergeUrl: append(unit.mergeUrl) })
      }))
    }))
  }
}
