import type { IncomingMessage, ServerResponse } from 'node:http'
import http from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer } from 'ws'
import { SessionId, type SessionStore } from '@deepseek-ai/dsh-session'
import { VIEWER_BASE, VIEWER_SESSION_COOKIE, VIEWER_WS_TUNNEL } from '../../shared/wire/viewer.ts'
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

/** Upper bound on sessions remembered per browser so scope checking stays a constant small set. */
const MAX_SCOPED_SESSIONS = 8
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
/** How often a live tunnel re-checks that its authorizing sessions still exist. */
const SESSION_REVALIDATE_MS = 5 * 60 * 1000

function reject(res: ServerResponse, status: 401 | 403 | 404 | 502): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  res.end()
}

/**
 * Same-origin proxy for the Viewer surface. Browser requests arrive on the DSH origin, pass the
 * `connection` trust fence, pass the per-request session scope check, and are forwarded verbatim
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
      // named live session, then bind this browser to that session scope for later /uf requests.
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
      res.setHeader('set-cookie', upsertScopeCookie(req, sessionId))
    } else if (pathname.startsWith(`${VIEWER_BASE}/`)) {
      // Static Viewer assets are public code once the browser fence passed; no scope check.
    } else if (!(await authorizeUfRequest(url, req, sessions))) {
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
    const sessionIds = readScopeCookie(req)
    if (fileKey === null || sessionIds.length === 0) {
      fail(403)
      return
    }
    void (async () => {
      for (const sessionId of sessionIds) {
        if (await isFileInSessionScope(decodeFileKey(fileKey), sessionId, sessions)) {
          bridgeTunnel(req, socket, head, target, gatewayOrigin, sessionIds)
          return
        }
      }
      fail(403)
    })().catch(() => fail(403))
  }

  const bridgeTunnel = (
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    target: string,
    resolveOrigin: () => Promise<string>,
    sessionIds: readonly string[]
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
        // A tunnel must not outlive the sessions that authorized it; revalidate periodically
        // and close when none of the bound sessions is live any more.
        const revalidate = setInterval(() => {
          const alive = sessionIds.some((id) => sessions.get(SessionId(id)) !== undefined)
          if (!alive) close()
        }, SESSION_REVALIDATE_MS)
        const close = (): void => {
          if (closed) return
          closed = true
          clearInterval(revalidate)
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

/** The file is in scope when it resolves inside at least one of the named live sessions' workspaces. */
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

/** `/uf` API request: authorize the addressed file against the browser's bound session scope. */
async function authorizeUfRequest(
  url: URL,
  req: IncomingMessage,
  sessions: SessionStore
): Promise<boolean> {
  const fileKey = fileKeyOfUfPath(url.pathname)
  if (fileKey === null) return false
  const sessionIds = readScopeCookie(req)
  if (sessionIds.length === 0) return false
  for (const sessionId of sessionIds) {
    if (await isFileInSessionScope(decodeFileKey(fileKey), sessionId, sessions)) return true
  }
  return false
}

function parseRequestCookies(rawCookies: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>()
  for (const segment of (rawCookies ?? '').split(';')) {
    const at = segment.indexOf('=')
    if (at === -1) continue
    cookies.set(segment.slice(0, at).trim(), segment.slice(at + 1).trim())
  }
  return cookies
}

/** Read the session ids this browser is currently scoped to (empty when unbound or malformed). */
function readScopeCookie(req: IncomingMessage): string[] {
  const raw = parseRequestCookies(req.headers.cookie).get(VIEWER_SESSION_COOKIE)
  if (raw === undefined || raw.length === 0) return []
  const ids: string[] = []
  for (const segment of raw.split(',')) {
    // A malformed segment must fail closed (empty scope), never throw into the caller:
    // the upgrade path has no error boundary above it.
    try {
      const id = decodeURIComponent(segment)
      if (id.length > 0) ids.push(id)
    } catch {
      /* malformed percent-encoding; skip the segment */
    }
  }
  return ids
}

/** Bind this browser to the session's scope, keeping the most recent bounded set of sessions. */
function upsertScopeCookie(req: IncomingMessage, sessionId: string): string {
  const previous = readScopeCookie(req).filter((id) => id !== sessionId)
  const ids = [sessionId, ...previous].slice(0, MAX_SCOPED_SESSIONS)
  return (
    `${VIEWER_SESSION_COOKIE}=${ids.map((id) => encodeURIComponent(id)).join(',')}` +
    `; Path=/; HttpOnly; SameSite=Strict; Max-Age=${String(COOKIE_MAX_AGE_SECONDS)}`
  )
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
