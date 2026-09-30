import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const cache = resolve('node_modules/.cache')
await mkdir(cache, { recursive: true })
const directory = await mkdtemp(join(cache, 'viewer-transport-'))
const originalLocation = globalThis.location
const originalFetch = globalThis.fetch

try {
  const outfile = join(directory, 'transport.mjs')
  await build({
    stdin: {
      contents: `export { resolveWebSocketUrl } from './src/viewer-app/core/config.ts';
        export { initializeDesktopTransport } from './src/viewer-app/core/desktop-transport.ts';`,
      resolveDir: resolve('.')
    },
    outfile,
    tsconfig: 'tsconfig.viewer.json',
    bundle: true,
    format: 'esm',
    platform: 'node'
  })
  const { resolveWebSocketUrl, initializeDesktopTransport } = await import(
    pathToFileURL(outfile).href
  )
  const target = '/uf/test-file/events'
  const collab =
    '/uf/test-file/worktrees/test-worktree/universer-api/comb/connect?sessionTicket=probe'
  let configuration = { desktopStreamBaseUrl: 'http://127.0.0.1:23456' }
  let responseStatus = 200
  let fetchCount = 0
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/univer-viewer/runtime-config')
    assert.equal(options.cache, 'no-store')
    fetchCount++
    return Response.json(configuration, { status: responseStatus })
  }

  globalThis.location = {
    protocol: 'https:',
    origin: 'https://dsh.example',
    pathname: '/univer-viewer/'
  }
  await initializeDesktopTransport()
  assert.equal(fetchCount, 0)
  assert.equal(
    resolveWebSocketUrl(target),
    `wss://dsh.example/univer-viewer/ws?target=${encodeURIComponent(target)}`
  )
  // An endpoint's authority cannot override the serving origin or downgrade TLS.
  assert.equal(
    new URL(resolveWebSocketUrl('ws://foreign.invalid/uf/test-file/events')).origin,
    'wss://dsh.example'
  )

  globalThis.location = {
    protocol: 'dsh-app:',
    origin: 'dsh-app://app',
    pathname: '/univer-viewer/'
  }
  assert.throws(() => resolveWebSocketUrl(target), /has not been loaded/u)
  await initializeDesktopTransport()
  for (const path of [target, collab]) {
    const socket = new URL(resolveWebSocketUrl(path))
    assert.equal(socket.origin, 'ws://127.0.0.1:23456')
    assert.equal(socket.pathname, '/univer-viewer/ws')
    assert.equal(socket.searchParams.get('target'), path)
  }
  for (const base of [
    'http://foreign.invalid:23456',
    'https://127.0.0.1:23456',
    'http://user:secret@127.0.0.1:23456',
    'http://127.0.0.1:23456/other',
    'http://127.0.0.1:23456/?token=secret'
  ]) {
    configuration = { desktopStreamBaseUrl: base }
    await assert.rejects(initializeDesktopTransport(), /Invalid desktop Viewer Host address/u)
  }
  configuration = {}
  await assert.rejects(
    initializeDesktopTransport(),
    /Invalid desktop Viewer transport configuration/u
  )
  responseStatus = 401
  await assert.rejects(initializeDesktopTransport(), /configuration is unavailable/u)
  globalThis.location = { protocol: 'http:', origin: 'http://localhost:23456', pathname: '/' }
  assert.equal(
    resolveWebSocketUrl('ws://localhost:23456/uf/test-file/events'),
    'ws://localhost:23456/uf/test-file/events'
  )
  console.log(
    'viewer transport: web TLS, desktop lifecycle/collaboration, and rejected configuration passed'
  )
} finally {
  globalThis.fetch = originalFetch
  if (originalLocation === undefined) delete globalThis.location
  else globalThis.location = originalLocation
  await rm(directory, { recursive: true, force: true })
}
