// Same-origin Viewer proxy (docs/viewer-same-origin-deployment.md): the real proxy handler in
// front of a real Gateway. The DSH connection fence is a stub; DSH owns real Host/Origin checks.
import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { startGateway, type GatewayHarness } from '../support/gateway.ts'
import { closeServer, listen } from '../support/net.ts'

const SESSION = 'viewer-proxy-session'

describe('same-origin Viewer proxy', () => {
  let gateway: GatewayHarness
  let proxy: any
  let server: Server
  let proxyOrigin: string
  let ufBase: string
  let gateRejection: number | undefined
  let tunneledWorktreeId: string

  const eventsTunnel = () =>
    `${proxyOrigin}/univer-viewer/ws?target=${encodeURIComponent(`/uf/${gateway.fileKey}/events`)}`

  beforeAll(async () => {
    gateway = await startGateway()
    const worktreeId = await gateway.createWorktree('viewer proxy')
    await gateway.createUnit(worktreeId, 'sheet', 'Proxy')
    proxy = gateway.plugin.createViewerProxy({
      gatewayOrigin: async () => {
        const started = await gateway.service.ensureGateway()
        if (!started.ok) throw new Error(started.reason)
        return started.gateway
      },
      sessions: {
        get: (id: string) => (id === SESSION ? { header: { cwd: gateway.workspace } } : undefined)
      },
      connection: { requestRejection: () => gateRejection }
    })
    server = createServer((request, response) => void proxy.httpHandler(request, response))
    server.on('upgrade', proxy.upgradeHandler)
    proxyOrigin = `http://127.0.0.1:${await listen(server)}`
    ufBase = `${proxyOrigin}/uf/${gateway.fileKey}`
  })

  afterAll(async () => {
    proxy?.dispose()
    if (server !== undefined) await closeServer(server)
    await gateway?.dispose()
  })

  it('mounts the Viewer under the shared base for direct Gateway access', async () => {
    const mount = await fetch(`${gateway.origin}/univer-viewer/`)
    expect(mount.ok).toBe(true)
    expect(await mount.text()).toContain('<html')
  })

  it('gates the Viewer document and transport config behind the connection fence', async () => {
    gateRejection = 401
    try {
      const document = await fetch(
        `${proxyOrigin}/univer-viewer/?file=${gateway.fileKey}&sessionId=${SESSION}`
      )
      expect(document.status).toBe(401)
      const config = await fetch(`${proxyOrigin}/univer-viewer/runtime-config`)
      expect(config.status).toBe(401)
    } finally {
      gateRejection = undefined
    }
  })

  it('returns the actual dynamic Host port as uncached, read-only transport config', async () => {
    const config = await fetch(`${proxyOrigin}/univer-viewer/runtime-config`)
    expect(config.ok).toBe(true)
    expect(config.headers.get('cache-control')).toBe('no-store')
    expect(await config.json()).toMatchObject({ desktopStreamBaseUrl: proxyOrigin })
    const mutation = await fetch(`${proxyOrigin}/univer-viewer/runtime-config`, {
      method: 'POST'
    })
    expect(mutation.status).toBe(405)
  })

  it('refuses Viewer documents without a session or outside its scope', async () => {
    const unscoped = await fetch(`${proxyOrigin}/univer-viewer/?file=${gateway.fileKey}`)
    expect(unscoped.status).toBe(403)
    const foreign = await fetch(
      `${proxyOrigin}/univer-viewer/?file=${gateway.fileKey}&sessionId=foreign-session`
    )
    expect(foreign.status).toBe(403)
  })

  it('proxies a scoped Viewer document and its assets without setting a cookie', async () => {
    const document = await fetch(
      `${proxyOrigin}/univer-viewer/?file=${gateway.fileKey}&sessionId=${SESSION}`
    )
    const html = await document.text()
    expect(document.ok).toBe(true)
    expect(html).toContain('<html')
    expect(document.headers.get('set-cookie')).toBeNull()
    const asset = html.match(/\/univer-viewer\/assets\/[^"']+\.css/u)?.[0]
    expect(asset, 'built Viewer must reference assets under the shared base').toBeDefined()
    expect((await fetch(`${proxyOrigin}${asset}`)).ok).toBe(true)
  })

  // Desktop forwarding retains only DSH authentication cookies. Legacy scope cookies must
  // neither be required nor affect the Gateway surface, including the startup descriptor.
  it.each([
    ['no cookie', undefined],
    ['a DSH cookie', 'dsh-auth-probe=desktop-owned'],
    ['a foreign legacy scope cookie', 'univer-viewer-sessions=foreign-session'],
    ['a malformed legacy scope cookie', 'univer-viewer-sessions=%zz']
  ])('serves /uf and the Gateway descriptor with %s', async (_label, cookie) => {
    const headers: Record<string, string> = cookie === undefined ? {} : { cookie }
    const api = await fetch(`${ufBase}/worktrees`, { headers })
    expect(api.ok).toBe(true)
    expect((await api.json()).worktrees).toEqual(expect.any(Array))
    const descriptor = await fetch(ufBase, {
      headers: { ...headers, accept: 'application/vnd.univer.collab-gateway+json;v=1' }
    })
    expect(descriptor.ok).toBe(true)
    expect((await descriptor.json()).protocolVersion).toBe(1)
  })

  it.each([401, 403])('keeps the connection fence on /uf (%i)', async (rejection) => {
    gateRejection = rejection
    try {
      expect((await fetch(`${ufBase}/worktrees`)).status).toBe(rejection)
    } finally {
      gateRejection = undefined
    }
  })

  it('tunnels lifecycle events for a cookie-free worktree creation', async () => {
    let mutation: Promise<void> | undefined
    const frame = await new Promise<any>((resolve, reject) => {
      const client = new WebSocket(eventsTunnel())
      const timer = setTimeout(() => {
        client.terminate()
        reject(new Error('tunneled lifecycle events channel never opened'))
      }, 10_000)
      client.on('unexpected-response', (_request, response) => {
        clearTimeout(timer)
        reject(new Error(`tunnel upgrade was refused: ${response.statusCode}`))
      })
      client.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      client.on('open', () => {
        // Let the Gateway finish registering the socket in its event hub before triggering.
        setTimeout(() => {
          mutation = fetch(`${ufBase}/worktrees`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'proxy event smoke' })
          }).then(async (response) => {
            if (!response.ok || (await response.json()).error?.code !== 1) {
              throw new Error(`cookie-free worktree creation failed: ${response.status}`)
            }
          })
          mutation.catch((error) => {
            clearTimeout(timer)
            reject(error)
          })
        }, 100)
      })
      client.on('message', (data) => {
        const event = JSON.parse(String(data))
        if (event.type !== 'worktree') return
        clearTimeout(timer)
        client.close()
        resolve(event)
      })
    })
    expect(frame.worktree?.worktreeId).toEqual(expect.any(String))
    tunneledWorktreeId = frame.worktree.worktreeId
    await mutation
    const persisted = await gateway.service.status(gateway.scoped)
    expect(persisted.result?.worktrees).toEqual(
      expect.arrayContaining([expect.objectContaining({ worktreeId: tunneledWorktreeId })])
    )
  })

  it.each([401, 403])(
    'keeps the connection fence on the tunnel upgrade (%i)',
    async (rejection) => {
      gateRejection = rejection
      try {
        const outcome = await new Promise<number | string>((resolve, reject) => {
          const client = new WebSocket(eventsTunnel())
          const timer = setTimeout(() => {
            client.terminate()
            reject(new Error('DSH connection fence did not settle the tunnel upgrade'))
          }, 10_000)
          client.on('unexpected-response', (_request, response) => {
            clearTimeout(timer)
            response.resume()
            client.terminate()
            resolve(response.statusCode ?? 'no status')
          })
          client.on('open', () => {
            clearTimeout(timer)
            client.terminate()
            resolve('opened')
          })
          client.on('error', () => {
            clearTimeout(timer)
            resolve('error')
          })
        })
        expect(outcome).toBe(rejection)
      } finally {
        gateRejection = undefined
      }
    }
  )

  // The comb endpoint authenticates each upgrade with a one-time query parameter the client
  // appends to the tunneled URL, then speaks TEXT frames; the tunnel must relay endpoint
  // parameters upstream and preserve the frame opcode, or every collab socket dies right after
  // opening (issue #76). A full HELLO round trip proves both, and the same upgrade without the
  // parameter is the differential control.
  it('relays the comb session ticket and TEXT frames through the tunnel (#76)', async () => {
    const ticketResponse = await fetch(
      `${ufBase}/worktrees/${tunneledWorktreeId}/universer-api/user/session-ticket`
    )
    expect(ticketResponse.ok).toBe(true)
    const { ticket } = await ticketResponse.json()
    expect(ticket).toEqual(expect.any(String))
    expect(ticket.length).toBeGreaterThan(0)
    const combTunnel =
      `${proxyOrigin}/univer-viewer/ws?target=` +
      encodeURIComponent(
        `/uf/${gateway.fileKey}/worktrees/${tunneledWorktreeId}/universer-api/comb/connect`
      )

    const memberID = await new Promise<unknown>((resolve, reject) => {
      const client = new WebSocket(`${combTunnel}&sessionTicket=${encodeURIComponent(ticket)}`)
      const timer = setTimeout(() => {
        client.terminate()
        reject(new Error('comb HELLO round trip through the tunnel never completed'))
      }, 10_000)
      client.on('open', () => client.send(JSON.stringify({ cmd: 1, routeKey: '' }))) // CombCmd.HELLO
      client.on('message', (data) => {
        const response = JSON.parse(String(data))
        if (response.cmd !== 1) return
        clearTimeout(timer)
        client.close()
        resolve(response.infoRsp?.memberID)
      })
      client.on('close', (code) => {
        clearTimeout(timer)
        reject(new Error(`comb socket closed before the HELLO response: ${code}`))
      })
      client.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })
    expect(memberID).toEqual(expect.any(String))
    expect(memberID).not.toBe('')

    const anonymous = await new Promise<string>((resolve) => {
      const client = new WebSocket(combTunnel)
      const timer = setTimeout(() => {
        client.terminate()
        resolve('held open')
      }, 1_500)
      client.on('close', () => {
        clearTimeout(timer)
        resolve('closed')
      })
      client.on('error', () => resolve('error'))
    })
    expect(anonymous, 'comb upgrade without a session ticket').not.toBe('held open')
  })

  it('closes live bridges on dispose', async () => {
    const outcome = await new Promise<string>((resolve, reject) => {
      const client = new WebSocket(eventsTunnel())
      const timer = setTimeout(() => {
        client.terminate()
        reject(new Error('tunnel client was not closed by proxy.dispose()'))
      }, 10_000)
      client.on('open', () => proxy.dispose())
      client.on('close', () => {
        clearTimeout(timer)
        resolve('closed')
      })
      client.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })
    expect(outcome).toBe('closed')
    await gateway.service.worktreeAction({
      ...gateway.scoped,
      action: 'discard',
      worktreeId: tunneledWorktreeId
    })
  })
})
