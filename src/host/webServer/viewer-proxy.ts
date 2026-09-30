import type { IncomingMessage, ServerResponse } from 'node:http'
import http from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer } from 'ws'
import type { SessionStore } from '@deepseek-ai/dsh-session'
import { VIEWER_BASE, VIEWER_WS_TUNNEL } from '../../shared/wire/viewer.ts'
import { resolveAuthorizedFile } from './session-scope.ts'

/** Trust surface consumed from the DSH `connection` service (its package is browser-side). */
export interface ConnectionTrust {
  requestRejection(request: { readonly headers: IncomingMessage['headers'] }): 401 | 403 | undefined
}

export interface ViewerProxyOptions {
  /** Resolves the loopback Gateway origin (starts it when `autoStartGateway` allows). */
  readonly gatewayOrigin: () => Promise<string>
  readonly sessions: SessionStore
  readonly connection: ConnectionTrust
}

export interface ViewerProxy {
  /** Serve one `/univer-viewer` or `/uf` browser request against the loopback Gateway. */
  readonly httpHandler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  /** Bridge one `/univer-viewer/ws?target=/uf/...` upgrade to the Gateway WebSocket. */
  readonly upgradeHandler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void
  /** Close every live tunnel bridge; the plugin must call it on unload. */
  readonly dispose: () => void
}

function reject(res: ServerResponse, status: 401 | 403 | 404 | 502): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  res.end()
}

/**
 * Same-origin proxy for the Viewer surface. Browser requests arrive on the DSH origin, pass the
 * `connection` trust fence, and are forwarded verbatim after document-only session scope checks
 * to the loopback Gateway. See docs/viewer-same-origin-deployment.md for the contract.
 */
export function createViewerProxy(options: ViewerProxyOptions): ViewerProxy {
  const { gatewayOrigin, sessions, connection } = options
  const wss = new WebSocketServer({ noServer: true })
  const bridges = new Set<() => void>()

  const httpHandler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const rejection = connection.requestRejection(req)
    if (rejection !== undefined) {
      reject(res, rejection)
      return
    }
    const url = new URL(req.url ?? '/', 'http://localhost')
    const pathname = url.pathname
    if (pathname === VIEWER_BASE || pathname === `${VIEWER_BASE}/`) {
      // The Viewer document carries the addressing parameters: authorize the file against the
      // named live session. Subsequent Gateway traffic relies on DSH browser authentication.
      const file = url.searchParams.get('file')
      const sessionId = url.searchParams.get('sessionId')
      if (
        file === null ||
        !isGatewayFileKey(file) ||
        sessionId === null ||
        sessionId.length === 0
      ) {
        reject(res, 403)
        return
      }
      if (!(await isFileInSessionScope(decodeFileKey(file), sessionId, sessions))) {
        reject(res, 403)
        return
      }
    } else if (pathname.startsWith(`${VIEWER_BASE}/`)) {
      // Static Viewer assets are public code once the browser fence passed; no scope check.
    } else if (fileKeyOfUfPath(pathname) === null) {
      reject(res, url.pathname === '/uf' || url.pathname.startsWith('/uf/') ? 403 : 404)
      return
    }
    await forwardToGateway(req, res, gatewayOrigin)
  }

  const upgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const fail = (status: 401 | 403): void => {
      const reason = status === 401 ? 'unauthorized' : 'forbidden'
      socket.write(`HTTP/1.1 ${String(status)} ${reason}\r\nconnection: close\r\n\r\n`)
      socket.destroy()
    }
    const rejection = connection.requestRejection(req)
    if (rejection !== undefined) {
      fail(rejection)
      return
    }
    let url: URL
    try {
      url = new URL(req.url ?? '/', 'http://localhost')
    } catch {
      socket.destroy()
      return
    }
    if (url.pathname !== VIEWER_WS_TUNNEL) {
      socket.destroy()
      return
    }
    const target = url.searchParams.get('target')
    if (target === null || !target.startsWith('/uf/')) {
      fail(403)
      return
    }
    const fileKey = fileKeyOfUfPath(target)
    if (fileKey === null) {
      fail(403)
      return
    }
    bridgeTunnel(req, socket, head, target, gatewayOrigin)
  }

  const bridgeTunnel = (
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    target: string,
    resolveOrigin: () => Promise<string>
  ): void => {
    void (async () => {
      const upstreamUrl = new URL(target, rewriteLoopback(await resolveOrigin()))
      // `target` is the tunnel's own routing parameter; every other query parameter belongs to
      // the endpoint protocol — e.g. the SDK comb handshake appends its one-time `sessionTicket`
      // to the tunneled URL — and must reach the Gateway verbatim, matching the HTTP forward path.
      for (const [name, value] of new URL(req.url ?? '/', 'http://localhost').searchParams) {
        if (name !== 'target') {
          upstreamUrl.searchParams.set(name, value)
        }
      }
      wss.handleUpgrade(req, socket, head, (client) => {
        // Frames may arrive before the upstream socket opens; queue them instead of dropping.
        const pending: { readonly data: Buffer; readonly binary: boolean }[] = []
        let closed = false
        const protocols = headerValue(req.headers['sec-websocket-protocol'])
        const upstream =
          protocols === undefined
            ? new WebSocket(upstreamUrl)
            : new WebSocket(
                upstreamUrl,
                protocols.split(',').map((protocol) => protocol.trim())
              )
        const close = (): void => {
          if (closed) return
          closed = true
          bridges.delete(close)
          try {
            client.close()
          } catch {
            /* already closing */
          }
          try {
            upstream.close()
          } catch {
            /* already closing */
          }
        }
        bridges.add(close)
        // The frame opcode must survive the relay: the comb protocol speaks TEXT frames, and a
        // Gateway that receives one as binary rejects the socket with a 1003 close.
        client.on('message', (data, binary) => {
          if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary })
          else if (upstream.readyState === WebSocket.CONNECTING)
            pending.push({ data: toBuffer(data), binary })
        })
        client.on('close', close)
        client.on('error', close)
        upstream.on('open', () => {
          for (const frame of pending.splice(0)) upstream.send(frame.data, { binary: frame.binary })
        })
        upstream.on('message', (data, binary) => {
          client.send(data, { binary })
        })
        upstream.on('close', close)
        upstream.on('error', close)
      })
    })().catch(() => {
      socket.destroy()
    })
  }

  let disposed = false
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    // Deleting the current entry while a Set is being iterated is safe.
    for (const close of bridges) close()
    wss.close()
  }

  return { httpHandler, upgradeHandler, dispose }
}

/** Forward one browser request to the loopback Gateway, streaming both body directions. */
async function forwardToGateway(
  req: IncomingMessage,
  res: ServerResponse,
  resolveOrigin: () => Promise<string>
): Promise<void> {
  let origin: string
  try {
    origin = await resolveOrigin()
  } catch {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    res.end()
    return
  }
  const target = new URL(req.url ?? '/', origin)
  const upstream = http.request(target, {
    method: req.method,
    headers: forwardRequestHeaders(req.headers)
  })
  req.pipe(upstream)
  req.on('error', () => upstream.destroy())
  upstream.on('error', () => {
    if (res.headersSent) res.destroy()
    else {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      res.end()
    }
  })
  upstream.on('response', (upstreamResponse) => {
    res.writeHead(
      upstreamResponse.statusCode ?? 502,
      filterResponseHeaders(upstreamResponse.headers)
    )
    upstreamResponse.pipe(res)
    upstreamResponse.on('error', () => res.destroy())
  })
}

/** Drop hop-by-hop, WebSocket-handshake, and cookie headers; `host` is re-derived from the target. */
function forwardRequestHeaders(headers: IncomingMessage['headers']): IncomingMessage['headers'] {
  const forwarded: Record<string, string | string[] | undefined> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue
    const lower = name.toLowerCase()
    if (
      lower === 'host' ||
      lower === 'connection' ||
      lower === 'cookie' ||
      lower === 'upgrade' ||
      lower.startsWith('sec-websocket-')
    ) {
      continue
    }
    forwarded[name] = value
  }
  return forwarded
}

/** Keep only single-valued response headers node:http does not set itself when piping. */
function filterResponseHeaders(headers: IncomingMessage['headers']): IncomingMessage['headers'] {
  const filtered: Record<string, string | string[] | undefined> = {}
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase()
    if (lower === 'connection' || lower === 'transfer-encoding' || lower === 'keep-alive') continue
    filtered[name] = value
  }
  return filtered
}

/** `/uf/<key>[/...]` → `key`, or `null` when the path is not a file-scoped Gateway route. */
function fileKeyOfUfPath(pathname: string): string | null {
  const match = /^\/uf\/([A-Za-z0-9_-]+)(?:\/|$)/u.exec(pathname)
  return match === null ? null : (match[1] ?? null)
}

function decodeFileKey(key: string): string {
  return Buffer.from(key, 'base64url').toString('utf8')
}

function isGatewayFileKey(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/u.test(value)
}

/** The Viewer document must address a file inside the named live session workspace. */
async function isFileInSessionScope(
  path: string,
  sessionId: string,
  sessions: SessionStore
): Promise<boolean> {
  try {
    await resolveAuthorizedFile(path, sessionId, sessions)
    return true
  } catch {
    return false
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined
  return Array.isArray(value) ? value.join(', ') : value
}

function toBuffer(data: WebSocket.RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data)
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data))
  return Buffer.from(data)
}

/** Gateway origins are plain `http://127.0.0.1:<port>`; derive the `ws:` form for tunnels. */
function rewriteLoopback(origin: string): string {
  return origin.replace(/^http:/u, 'ws:')
}
