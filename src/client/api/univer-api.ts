import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { FileState } from '../../shared/wire/state.ts'
import type { EnsureGatewayResult, UniverStatus } from '../../shared/wire/status.ts'

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
  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    throw new UniverApiError(
      `Univer API returned a non-JSON response (HTTP ${String(response.status)})`,
      undefined,
      response.status
    )
  }
  if (!response.ok) {
    const envelope = body !== null && typeof body === 'object' ? body : {}
    const message =
      'message' in envelope && typeof envelope.message === 'string' ? envelope.message : undefined
    const code = 'code' in envelope && typeof envelope.code === 'string' ? envelope.code : undefined
    throw new UniverApiError(
      message ?? `Univer API HTTP ${String(response.status)}`,
      code,
      response.status
    )
  }
  return body as T
}

/** Read package, Gateway, and Unit content availability. */
export function getUniverStatus(signal: AbortSignal): Promise<UniverStatus> {
  return request('/univer-api/status', { signal })
}

/** Start or reuse the bundled Gateway. */
export function startGateway(signal: AbortSignal): Promise<EnsureGatewayResult> {
  return request('/univer-api/gateway/start', { method: 'POST', signal })
}

/** Read one file's current collaboration state and Viewer targets. */
export function getFileState(
  file: string,
  sessionId: SessionId,
  signal: AbortSignal
): Promise<FileState> {
  return request(
    `/univer-api/state?file=${encodeURIComponent(file)}&sessionId=${encodeURIComponent(sessionId)}`,
    { signal }
  )
}

/** A projected file was removed (or never successfully created) in the session workspace. */
export function isMissingUniverFile(error: unknown): boolean {
  return error instanceof UniverApiError && error.code === 'INVALID_FILE_PATH'
}
