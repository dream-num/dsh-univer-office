import type { IncomingMessage } from 'node:http'

/** DSH versions before route-level admission expose this connection method. */
export interface ConnectionTrust {
  requestRejection?(request: {
    readonly headers: IncomingMessage['headers']
  }): 401 | 403 | undefined
}

/** Supplied by WebServer only after its required HTTP or upgrade admission succeeds. */
export interface AdmittedPeer {
  readonly signal: AbortSignal
}

export const requiredAdmission = { auth: 'required' } as const

export function browserRequestRejection(
  connection: ConnectionTrust,
  request: IncomingMessage,
  peer: AdmittedPeer | undefined
): 401 | 403 | undefined {
  if (peer !== undefined) return peer.signal.aborted ? 401 : undefined
  if (typeof connection.requestRejection === 'function') return connection.requestRejection(request)
  return 401
}
