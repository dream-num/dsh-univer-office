import { readFile, mkdtemp, realpath, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer as createNetServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeServer, listen, occupyPortWithFreeSuccessor } from '../support/net.ts'
import { importHostBundle, pluginRoot, REPO_ROOT } from '../support/paths.ts'

const BINDINGS = [
  '@univerjs-pro/engine-formula-rust-binding',
  '@univerjs-pro/exchange-node-binding'
] as const

describe('packaged runtime', () => {
  it('bundles the exchange client instead of requiring it at runtime', async () => {
    const gateway = await readFile(join(pluginRoot(), 'artifacts', 'gateway.cjs'), 'utf8')
    expect(gateway).not.toContain('require("@univerjs-pro/exchange-node")')
  })

  // The repository manifests never declare the native bindings (their wrappers own the
  // versions); the published manifest receives them at packaging time, because pnpm consumers
  // cannot resolve transitive dependencies from the plugin bundles.
  it('declares native bindings only in the published manifest', async () => {
    const manifestPath = join(pluginRoot(), 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const declared = BINDINGS.filter(
      (binding) =>
        manifest.dependencies?.[binding] !== undefined ||
        manifest.devDependencies?.[binding] !== undefined ||
        manifest.peerDependencies?.[binding] !== undefined
    )
    expect(declared).toEqual(pluginRoot() === REPO_ROOT ? [] : [...BINDINGS])

    const resolve = createRequire(manifestPath)
    for (const binding of BINDINGS) {
      const installed = await readNearestManifest(dirname(resolve.resolve(binding)))
      expect(installed.name).toBe(binding)
      expect(installed.version).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/)
    }
  })
})

describe('Gateway ownership', () => {
  let plugin: any
  let service: any
  let foreign: Server
  let occupiedPort: number
  let availablePort: number
  let workspace: string

  beforeAll(async () => {
    plugin = await importHostBundle(pluginRoot())
    ;({ foreign, occupiedPort, availablePort } = await occupyPortWithFreeSuccessor())
    workspace = await realpath(await mkdtemp(join(tmpdir(), 'dsh-univer-lifecycle-')))
    service = new plugin.GatewayUniverService(
      new Context(),
      plugin.resolveConfig({ gatewayPort: occupiedPort, tools: false })
    )
  })

  afterAll(async () => {
    await service?.dispose()
    await closeServer(foreign)
    await rm(workspace, { recursive: true, force: true })
  })

  it('joins concurrent starts and skips a port owned by another service', async () => {
    const origin = `http://127.0.0.1:${availablePort}`
    const [started, joined] = await Promise.all([service.ensureGateway(), service.ensureGateway()])
    expect(started).toMatchObject({ ok: true, gateway: origin, reused: false })
    expect(joined).toMatchObject({ ok: true, gateway: origin, reused: false })
    const untouched = await fetch(`http://127.0.0.1:${occupiedPort}`)
    expect(await untouched.text()).toBe('not a Univer Gateway')
  })

  it('reuses its own running Gateway', async () => {
    const reused = await service.ensureGateway()
    expect(reused).toMatchObject({
      ok: true,
      gateway: `http://127.0.0.1:${availablePort}`,
      reused: true
    })
  })

  it('serves the bundled Viewer', async () => {
    const viewer = await fetch(`http://127.0.0.1:${availablePort}/`)
    expect(viewer.ok).toBe(true)
    expect(await viewer.text()).toContain('<html')
  })

  it('creates an empty .univer file', async () => {
    const scoped = { workspace, file: join(workspace, 'lifecycle.univer') }
    const created = await service.newFile(scoped)
    expect(created).toMatchObject({ ok: true, operation: 'new', result: { created: true } })
    const status = await service.status(scoped)
    expect(status.result?.trunk?.units).toEqual([])
  })

  it('releases its port on dispose', async () => {
    await service.dispose()
    const released: Server = createNetServer()
    await listen(released, availablePort)
    await closeServer(released)
  })
})

async function readNearestManifest(start: string): Promise<{ name?: string; version?: string }> {
  for (let cursor = start; ; cursor = dirname(cursor)) {
    try {
      return JSON.parse(await readFile(join(cursor, 'package.json'), 'utf8'))
    } catch {
      // Not a package root yet; keep walking up.
      if (dirname(cursor) === cursor) throw new Error(`package manifest not found above ${start}`)
    }
  }
}
