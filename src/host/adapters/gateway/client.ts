import { UniverError } from '../../service/errors.ts'
import type { JsonValue } from '../../service/types.ts'

/** Small typed transport over the bundled Gateway HTTP API. */
export class GatewayClient {
  constructor(
    readonly origin: string,
    private readonly timeoutMs: number
  ) {}

  /** Execute a JSON GET request. */
  async get(path: string): Promise<JsonValue> {
    return this.request(path, 'GET')
  }

  /** Execute a JSON POST request. */
  async post(path: string, body: JsonValue = {}): Promise<JsonValue> {
    return this.request(path, 'POST', body)
  }

  private async request(
    path: string,
    method: 'GET' | 'POST',
    body?: JsonValue
  ): Promise<JsonValue> {
    let response: Response
    try {
      response = await fetch(`${this.origin}${path}`, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(this.timeoutMs)
      })
    } catch (error) {
      throw gatewayTransportError(error)
    }
    let value: JsonValue
    try {
      value = (await response.json()) as JsonValue
    } catch (error) {
      if (isGatewayTimeout(error)) throw gatewayTransportError(error)
      throw new UniverError(
        `Gateway returned invalid JSON for ${method} ${path}`,
        'GATEWAY_INVALID_RESPONSE',
        { cause: error }
      )
    }
    if (!response.ok) {
      const message = gatewayErrorMessage(value) ?? `Gateway HTTP ${String(response.status)}`
      throw new UniverError(message, 'GATEWAY_REQUEST_FAILED')
    }
    return value
  }
}

/** Extract a stable user-facing message from a Gateway error envelope. */
export function gatewayErrorMessage(value: JsonValue): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const error = value.error
  if (typeof error !== 'object' || error === null || Array.isArray(error)) return null
  return typeof error.message === 'string' && error.message.length > 0 ? error.message : null
}

function gatewayTransportError(error: unknown): UniverError {
  return isGatewayTimeout(error)
    ? new UniverError('Gateway request timed out.', 'GATEWAY_REQUEST_TIMEOUT', { cause: error })
    : new UniverError('Gateway request failed.', 'GATEWAY_UNAVAILABLE', { cause: error })
}

function isGatewayTimeout(error: unknown): boolean {
  let current: unknown = error
  const seen = new Set<object>()
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current)
    const name = 'name' in current && typeof current.name === 'string' ? current.name : undefined
    const code = 'code' in current && typeof current.code === 'string' ? current.code : undefined
    if (
      name === 'TimeoutError' ||
      name === 'AbortError' ||
      code === 'ETIMEDOUT' ||
      code?.includes('TIMEOUT') === true
    )
      return true
    current = 'cause' in current ? current.cause : undefined
  }
  return false
}
