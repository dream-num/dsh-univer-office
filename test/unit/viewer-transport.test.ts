import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TARGET = '/uf/test-file/events'
const COLLAB =
  '/uf/test-file/worktrees/test-worktree/universer-api/comb/connect?sessionTicket=probe'

// The module caches the desktop stream base, so each case loads a fresh copy.
const load = async () => {
  vi.resetModules()
  const { resolveWebSocketUrl } = await import('../../src/viewer-app/core/config.ts')
  const { initializeDesktopTransport } =
    await import('../../src/viewer-app/core/desktop-transport.ts')
  return { resolveWebSocketUrl, initializeDesktopTransport }
}

describe('Viewer WebSocket transport', () => {
  let configuration: Record<string, unknown>
  let responseStatus: number
  const fetchMock = vi.fn(async (url: string, options: RequestInit) => {
    expect(url).toBe('/univer-viewer/runtime-config')
    expect(options.cache).toBe('no-store')
    return Response.json(configuration, { status: responseStatus })
  })
  const setLocation = (location: Partial<Location>) => vi.stubGlobal('location', location)

  beforeEach(() => {
    configuration = { desktopStreamBaseUrl: 'http://127.0.0.1:23456' }
    responseStatus = 200
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('tunnels web pages over the serving origin with TLS preserved', async () => {
    setLocation({ protocol: 'https:', origin: 'https://dsh.example', pathname: '/univer-viewer/' })
    const { resolveWebSocketUrl, initializeDesktopTransport } = await load()
    await initializeDesktopTransport()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(resolveWebSocketUrl(TARGET)).toBe(
      `wss://dsh.example/univer-viewer/ws?target=${encodeURIComponent(TARGET)}`
    )
    // An endpoint's authority cannot override the serving origin or downgrade TLS.
    expect(new URL(resolveWebSocketUrl('ws://foreign.invalid/uf/test-file/events')).origin).toBe(
      'wss://dsh.example'
    )
  })

  it('routes desktop lifecycle and collaboration sockets to the real Host address', async () => {
    setLocation({ protocol: 'dsh-app:', origin: 'dsh-app://app', pathname: '/univer-viewer/' })
    const { resolveWebSocketUrl, initializeDesktopTransport } = await load()
    expect(() => resolveWebSocketUrl(TARGET)).toThrow(/has not been loaded/u)
    await initializeDesktopTransport()
    for (const path of [TARGET, COLLAB]) {
      const socket = new URL(resolveWebSocketUrl(path))
      expect(socket.origin).toBe('ws://127.0.0.1:23456')
      expect(socket.pathname).toBe('/univer-viewer/ws')
      expect(socket.searchParams.get('target')).toBe(path)
    }
  })

  it.each([
    'http://foreign.invalid:23456',
    'https://127.0.0.1:23456',
    'http://user:secret@127.0.0.1:23456',
    'http://127.0.0.1:23456/other',
    'http://127.0.0.1:23456/?token=secret'
  ])('rejects the desktop Host address %s', async (base) => {
    setLocation({ protocol: 'dsh-app:', origin: 'dsh-app://app', pathname: '/univer-viewer/' })
    configuration = { desktopStreamBaseUrl: base }
    const { initializeDesktopTransport } = await load()
    await expect(initializeDesktopTransport()).rejects.toThrow(
      /Invalid desktop Viewer Host address/u
    )
  })

  it('rejects missing and unavailable desktop configuration', async () => {
    setLocation({ protocol: 'dsh-app:', origin: 'dsh-app://app', pathname: '/univer-viewer/' })
    const { initializeDesktopTransport } = await load()
    configuration = {}
    await expect(initializeDesktopTransport()).rejects.toThrow(
      /Invalid desktop Viewer transport configuration/u
    )
    responseStatus = 401
    await expect(initializeDesktopTransport()).rejects.toThrow(/configuration is unavailable/u)
  })

  it('keeps an explicit socket on a plain local page', async () => {
    setLocation({ protocol: 'http:', origin: 'http://localhost:23456', pathname: '/' })
    const { resolveWebSocketUrl } = await load()
    expect(resolveWebSocketUrl('ws://localhost:23456/uf/test-file/events')).toBe(
      'ws://localhost:23456/uf/test-file/events'
    )
  })
})
