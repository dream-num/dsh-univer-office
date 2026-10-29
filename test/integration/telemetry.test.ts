// Product telemetry: the real uninstall entry CLI and the real Host telemetry pass, against a
// local proxy double with temporary DSH_HOME state and a dynamic port. Asserts final state-file
// content, wire payload shape, once-only semantics, and that telemetry never fails uninstall or
// startup.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeServer, listen } from '../support/net.ts'
import { importHostBundle, repoPath } from '../support/paths.ts'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const EXPECTED_PROPERTIES = [
  'arch',
  'build_commit',
  'event_source',
  'node_major_version',
  'package_name',
  'package_version',
  'platform',
  'telemetry_state_version'
]
const BUILD_INFO = { commit: 'c0ffee', version: '9.9.9' }

let plugin: any
let manifest: any

beforeAll(async () => {
  plugin = await importHostBundle()
  manifest = JSON.parse(await readFile(repoPath('package.json'), 'utf8'))
})

describe('packaging', () => {
  it('ships the lifecycle entry and launches only it on uninstall', () => {
    expect(manifest.files).toContain('scripts/telemetry-entry.mjs')
    expect(manifest.scripts).not.toHaveProperty('postinstall')
    expect(manifest.scripts.uninstall).toBe('node scripts/telemetry-entry.mjs uninstall')
  })

  it('defaults telemetry on and accepts an explicit false', () => {
    expect(plugin.resolveConfig().telemetry).toBe(true)
    expect(plugin.resolveConfig({ telemetry: false }).telemetry).toBe(false)
  })

  // Every build hardcodes the live proxy address; anything else in build-info means the
  // constant drifted without review and releases would ship silent.
  it('pins the live endpoint and the package version in build-info', async () => {
    const buildInfo = JSON.parse(await readFile(repoPath('lib', 'build-info.json'), 'utf8'))
    expect(buildInfo.telemetryEndpoint).toBe('https://univer.ai/api/telemetry/cli')
    expect(buildInfo.version).toBe(manifest.version)
    expect(existsSync(repoPath('lib', 'telemetry-entry.js'))).toBe(true)
  })
})

describe('delivery', () => {
  const requests: Array<{ body: any; url: string | undefined }> = []
  let server: Server
  let endpoint: string
  let home: string
  let entryEnvironment: NodeJS.ProcessEnv
  const entryPath = repoPath('lib', 'telemetry-entry.js')
  const statePath = (dshHome: string) =>
    plugin.resolveTelemetryStatePath({ env: { DSH_HOME: dshHome } })
  // Asynchronous spawn: the proxy double lives in this process, so a synchronous wait would
  // block the event loop and starve the child's fetch.
  const runProcess = (file: string, args: string[], env: NodeJS.ProcessEnv) =>
    new Promise<number | null>((resolve) => {
      const child = spawn(process.execPath, [file, ...args], { env, stdio: 'ignore' })
      child.on('close', (code) => resolve(code))
    })
  const captureUninstall = (env: NodeJS.ProcessEnv) =>
    runProcess(entryPath, ['capture', 'dsh_plugin_uninstall_hook'], env)

  beforeAll(async () => {
    server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk) => chunks.push(chunk))
      request.on('end', () => {
        requests.push({
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
          url: request.url
        })
        response.writeHead(204, { 'cache-control': 'no-store' })
        response.end()
      })
    })
    endpoint = `http://127.0.0.1:${await listen(server)}/api/telemetry/cli`
    home = await mkdtemp(join(tmpdir(), 'dsh-univer-telemetry-'))
    entryEnvironment = { ...process.env, DSH_HOME: home, UNIVER_TELEMETRY_ENDPOINT: endpoint }
  })

  afterAll(async () => {
    if (server !== undefined) await closeServer(server)
    await rm(home, { force: true, recursive: true })
  })

  it('never deduplicates the uninstall hook', async () => {
    await captureUninstall(entryEnvironment)
    await captureUninstall(entryEnvironment)
    expect(requests).toHaveLength(2)
    expect(requests[1]!.body).toMatchObject({
      event: 'dsh_plugin_uninstall_hook',
      properties: { event_source: 'uninstall-hook' }
    })
    expectPayloadShape(requests[0]!.body)
    plugin.parseTelemetryState(await readFile(statePath(home), 'utf8'))
  })

  it('suppresses sends and state creation under DO_NOT_TRACK', async () => {
    const dntHome = `${home}-dnt`
    await captureUninstall({ ...entryEnvironment, DSH_HOME: dntHome, DO_NOT_TRACK: '1' })
    expect(requests).toHaveLength(2)
    expect(existsSync(statePath(dntHome))).toBe(false)
  })

  // An explicitly empty endpoint override stays fully inert even when the build pins the live
  // proxy (incident kill-switch and CI test isolation).
  it('stays inert with an explicitly empty endpoint override', async () => {
    const inertHome = `${home}-inert`
    await captureUninstall({ ...process.env, DSH_HOME: inertHome, UNIVER_TELEMETRY_ENDPOINT: '' })
    expect(requests).toHaveLength(2)
    expect(existsSync(statePath(inertHome))).toBe(false)
  })

  it('gates hook sends on a disabled state that Host activation clears', async () => {
    const disabledHome = `${home}-disabled`
    const disabledPath = statePath(disabledHome)
    await mkdir(join(disabledPath, '..'), { recursive: true })
    await writeFile(
      disabledPath,
      `${JSON.stringify({ anonymousInstallId: crypto.randomUUID(), disabled: true, version: 1 }, null, 2)}\n`
    )
    await captureUninstall({ ...entryEnvironment, DSH_HOME: disabledHome })
    expect(requests).toHaveLength(2)

    const sent: unknown[] = []
    await plugin.runHostTelemetry({
      buildInfo: { telemetryEndpoint: endpoint, ...BUILD_INFO },
      env: { ...process.env, DSH_HOME: disabledHome },
      statePath: disabledPath,
      transport: async ({ body }: { body: unknown }) => sent.push(body),
      telemetryEnabled: true
    })
    expect(sent).toHaveLength(2)
    expect(plugin.parseTelemetryState(await readFile(disabledPath, 'utf8')).disabled).not.toBe(true)
  })

  describe('Host activation', () => {
    const hostHome = () => `${home}-host`
    const sent: any[] = []
    const run = () =>
      plugin.runHostTelemetry({
        buildInfo: { telemetryEndpoint: endpoint, ...BUILD_INFO },
        env: { ...process.env, DSH_HOME: hostHome() },
        statePath: statePath(hostHome()),
        transport: async ({ body }: { body: unknown }) => sent.push(body),
        telemetryEnabled: true
      })

    it('reports activated once, then daily active', async () => {
      await run()
      expect(sent.map((body) => body.event)).toEqual([
        'dsh_plugin_activated',
        'dsh_plugin_daily_active'
      ])
      expectPayloadShape(sent[0])
      const state = plugin.parseTelemetryState(await readFile(statePath(hostHome()), 'utf8'))
      expect(state.activatedAttemptedAt).toBeDefined()
      expect(state.dailyActiveSentDate).toBe(localDate(new Date()))
    })

    it('does not resend after a same-day restart', async () => {
      await run()
      expect(sent).toHaveLength(2)
    })
  })

  it('persists the disabled flag and sends nothing when configured off', async () => {
    const offHome = `${home}-off`
    const sent: unknown[] = []
    await plugin.runHostTelemetry({
      buildInfo: { telemetryEndpoint: endpoint, version: '9.9.9' },
      env: { ...process.env, DSH_HOME: offHome },
      statePath: statePath(offHome),
      transport: async ({ body }: { body: unknown }) => sent.push(body),
      telemetryEnabled: false
    })
    expect(sent).toEqual([])
    expect(plugin.parseTelemetryState(await readFile(statePath(offHome), 'utf8')).disabled).toBe(
      true
    )
  })

  it('fails closed when the state cannot be written', async () => {
    const sent: unknown[] = []
    const blocked = await plugin.captureTelemetry({
      buildInfo: { telemetryEndpoint: endpoint, ...BUILD_INFO },
      endpoint,
      event: 'dsh_plugin_activated',
      source: 'host-activate',
      stateIo: {
        mkdir: async () => {
          throw new Error('state directory denied')
        }
      },
      statePath: statePath(`${home}-blocked`),
      transport: async ({ body }: { body: unknown }) => sent.push(body)
    })
    expect(blocked).toMatchObject({ status: 'skipped', reason: 'state-unavailable' })
    expect(sent).toEqual([])
  })

  // Concurrent first starts race the state read; the documented outcome is a possible double
  // send with a parseable final state, never corruption.
  it('keeps a parseable state across concurrent first starts', async () => {
    const raceHome = `${home}-race`
    const sent: string[] = []
    const options = {
      buildInfo: { telemetryEndpoint: endpoint, ...BUILD_INFO },
      env: { ...process.env, DSH_HOME: raceHome },
      stateIo: {
        readFile: async (file: string, encoding: BufferEncoding) => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return readFile(file, encoding)
        }
      },
      statePath: statePath(raceHome),
      transport: async ({ body }: { body: { event: string } }) => sent.push(body.event),
      telemetryEnabled: true
    }
    await Promise.all([plugin.runHostTelemetry(options), plugin.runHostTelemetry(options)])
    expect(sent.length).toBeGreaterThanOrEqual(2)
    plugin.parseTelemetryState(await readFile(statePath(raceHome), 'utf8'))
  })

  it('exits the package uninstall script immediately and delivers detached', async () => {
    const before = requests.length
    const status = await runProcess(repoPath('scripts', 'telemetry-entry.mjs'), ['uninstall'], {
      ...entryEnvironment,
      DSH_HOME: `${home}-shim`
    })
    expect(status).toBe(0)
    await vi.waitFor(() => expect(requests.length).toBeGreaterThan(before), { timeout: 10_000 })
    expect(requests.at(-1)!.body.event).toBe('dsh_plugin_uninstall_hook')
  })
})

function expectPayloadShape(body: any): void {
  expect(body.distinctId).toMatch(UUID_PATTERN)
  expect(Object.keys(body.properties).toSorted()).toEqual(EXPECTED_PROPERTIES)
  expect(body.properties.package_name).toBe('dsh-univer-office')
  expect(['9.9.9', manifest.version]).toContain(body.properties.package_version)
  expect(body.properties.telemetry_state_version).toBe(1)
}

function localDate(date: Date): string {
  const pad = (value: number) => `${value}`.padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
