import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { FileState } from '../../shared/wire/state.ts'
import type { EnsureGatewayResult, UniverStatus } from '../../shared/wire/status.ts'

/** Error envelope returned by the Host browser API. */
interface ApiError {
  readonly message?: string
  readonly code?: string
}

/** Structured Host failure retained for UI decisions that depend on the error code. */
export class UniverApiError extends Error {
  readonly code: string | undefined
  readonly status: number

  constructor(message: string, code: string | undefined, status: number) {
    super(message)
    this.name = 'UniverApiError'
    this.code = code
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${window.location.origin}${path}`, init)
  const body = (await response.json()) as T | ApiError
  if (!response.ok) {
    const error = body as ApiError
    throw new UniverApiError(
      error.message ?? `Univer API HTTP ${String(response.status)}`,
      error.code,
      response.status
    )
  }
  return body as T
}

/** Read package, Gateway, and Unit content availability. */
export function getUniverStatus(): Promise<UniverStatus> {
  return request('/univer-api/status')
}

/** Start or reuse the bundled Gateway. */
export function startGateway(): Promise<EnsureGatewayResult> {
  return request('/univer-api/gateway/start', { method: 'POST' })
}

/** Read one file's current collaboration state and Viewer targets. */
export function getFileState(file: string, sessionId: SessionId): Promise<FileState> {
  return request(
    `/univer-api/state?file=${encodeURIComponent(file)}&sessionId=${encodeURIComponent(sessionId)}`
  )
}

/** A projected file was removed (or never successfully created) in the session workspace. */
export function isMissingUniverFile(error: unknown): boolean {
  return error instanceof UniverApiError && error.code === 'INVALID_FILE_PATH'
}
