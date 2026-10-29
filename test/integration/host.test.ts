// Host browser protocol and tools over the built Host bundle: a real node:http server around the
// generated router, with a deterministic service double. No global CLI or existing demo file.
import { createServer, type Server } from 'node:http'
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeServer, listen, listenOrAcceptOccupied } from '../support/net.ts'
import { importHostBundle, repoPath } from '../support/paths.ts'

let plugin: any

beforeAll(async () => {
  plugin = await importHostBundle()
})

describe('resolved configuration', () => {
  it('uses the documented defaults', () => {
    const config = plugin.resolveConfig()
    expect(config).toMatchObject({
      gatewayPort: 9080,
      screenshotMaxPages: 30,
      screenshotMaxPixels: 16_777_216,
      printPdfOperationTimeoutMs: 120_000,
      unitContentRuntimeMaxEntries: 20,
      unitContentRuntimeIdleTtlMs: 300_000
    })
    expect(config.resourceCacheRoot.endsWith(join('cache', 'dsh-univer-office', 'resources'))).toBe(
      true
    )
    // The Viewer is served on the DSH origin through the same-origin proxy.
    expect(config).not.toHaveProperty('viewerBaseUrl')
    // Unset so the render runtime auto-detects a browser.
    expect(config).not.toHaveProperty('browserExecutablePath')
  })

  it('keeps unitContentRuntimeMaxEntries 0 available to disable pooling', () => {
    expect(
      plugin.resolveConfig({ unitContentRuntimeMaxEntries: 0 }).unitContentRuntimeMaxEntries
    ).toBe(0)
  })

  it.each([
    { gatewayPort: 0 },
    { screenshotMaxPages: 0 },
    { printPdfOperationTimeoutMs: 0 },
    { unitContentRuntimeMaxEntries: -1 },
    { unitContentRuntimeIdleTtlMs: 0 },
    { resourceCacheRoot: 'relative/cache' },
    { browserExecutablePath: 'msedge.exe' },
    { browserExecutablePath: '  ' }
  ])('rejects %o naming the invalid key', (invalid) => {
    expect(() => plugin.resolveConfig(invalid)).toThrow(Object.keys(invalid)[0])
  })

  it('passes an absolute browserExecutablePath through', () => {
    const path = join(tmpdir(), 'msedge.exe')
    expect(plugin.resolveConfig({ browserExecutablePath: path }).browserExecutablePath).toBe(path)
  })
})

// The Windows Edge fallback is unreachable on other platforms, so its candidate list is asserted
// directly: per-machine installs first, a per-user install only when the profile is known.
describe('Edge browser candidates', () => {
  const edge = (root: string) => join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')

  it('lists per-machine installs by default', () => {
    expect(plugin.edgeBrowserCandidatePaths({})).toEqual([
      edge('C:\\Program Files (x86)'),
      edge('C:\\Program Files')
    ])
  })

  it('adds a per-user install after the per-machine ones', () => {
    const localAppData = 'C:\\Users\\tester\\AppData\\Local'
    expect(
      plugin.edgeBrowserCandidatePaths({
        ProgramFiles: 'D:\\Program Files',
        'ProgramFiles(x86)': 'D:\\Program Files (x86)',
        LOCALAPPDATA: localAppData
      })
    ).toEqual([edge('D:\\Program Files (x86)'), edge('D:\\Program Files'), edge(localAppData)])
  })

  it('ignores a blank LOCALAPPDATA', () => {
    expect(plugin.edgeBrowserCandidatePaths({ LOCALAPPDATA: '  ' })).toHaveLength(2)
  })
})

describe('built Host bundle', () => {
  it('runs bundled Gateway and Worker entries as plain Node inside an Electron host', async () => {
    expect(await readFile(repoPath('lib', 'index.js'), 'utf8')).toContain('ELECTRON_RUN_AS_NODE')
  })

  it('ships the runtime pool bootstrap beside the Host bundle', async () => {
    await expect(readFile(repoPath('lib', 'worker-child.mjs'), 'utf8')).resolves.toBeTruthy()
    await expect(
      readFile(repoPath('artifacts', 'collaboration-runtime-worker.mjs'), 'utf8')
    ).resolves.toBeTruthy()
  })

  it('does not import the settingsNamespace export removed in DSH 0.1.2-alpha.2', async () => {
    expect(await readFile(repoPath('lib', 'index.js'), 'utf8')).not.toContain('settingsNamespace')
  })
})

// DSH 0.1.7+ derives settings forms from the root plugin's live Config; a real Profile covers that
// path in host-settings-profile.test.ts. The registry below stands in for DSH 0.1.6 and earlier,
// whose Settings provider no longer ships in the current DSH dev cohort.
describe('Settings', () => {
  it('registers live defaults with a legacy Settings registry', async () => {
    const context = new Context()
    const registrations: unknown[][] = []
    try {
      context.provide('settings', {
        register: (...args: unknown[]) => {
          registrations.push(args)
        }
      })
      await context.plugin(plugin, { tools: false, skills: false })
      expect(registrations).toHaveLength(1)
      const [namespace, schema, options] = registrations[0]!
      expect(namespace).toBe('univer-office')
      expect((schema as (value: unknown) => unknown)({})).toEqual({
        autoOpenLivePreview: true,
        conversationReviewCards: true
      })
      expect(options).toEqual({
        base: { autoOpenLivePreview: true, conversationReviewCards: true },
        applies: 'live'
      })
    } finally {
      await context.fiber.dispose()
    }
  })
})

describe('browser routes and tools', () => {
  const SESSION = 'host-session'
  const WORKTREE = 'wt-host'
  // Root bypasses DAC checks, so a chmod(0) directory cannot deny anything.
  const canEnforcePermissionDenied = process.platform !== 'win32' && (process.getuid?.() ?? 0) !== 0
  let workspace: string
  let file: string
  let realFile: string
  let codeFile: string
  let lockedDirectory: string
  let lockedFile: string
  let server: Server
  let origin: string
  let gatewayBlocker: Server
  let ownsGatewayBlocker: boolean
  let gateRejection: number | undefined
  let toolContext: Context
  let owner: any
  const calls: Array<[string, Record<string, unknown>?]> = []

  let state: any

  const json = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${origin}${path}`, init)
    return { status: response.status, body: await response.json() }
  }
  const execute = (name: string, args: Record<string, unknown>) =>
    toolContext.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId(`host-${name}-${calls.length}-${Math.random()}`),
      name,
      arguments: args,
      agent: owner
    })

  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'dsh-univer-host-'))
    file = join(workspace, 'smoke.univer')
    codeFile = join(workspace, 'facade-program.js')
    await writeFile(file, '')
    await writeFile(codeFile, 'return { ok: true }\n')
    realFile = await realpath(file)
    lockedDirectory = join(workspace, 'locked')
    lockedFile = join(lockedDirectory, 'locked.univer')
    await mkdir(lockedDirectory)
    await writeFile(lockedFile, '')
    if (canEnforcePermissionDenied) await chmod(lockedDirectory, 0)

    state = {
      ok: true,
      file,
      gateway: 'http://127.0.0.1:9123',
      gatewayRunning: true,
      viewerUrl: '/univer-viewer/?file=KEY',
      worktrees: [
        {
          worktreeId: WORKTREE,
          name: 'host smoke',
          status: 'ready',
          units: [{ unitId: 'unit-1', name: 'Sheet 1', type: 'sheet', kind: 'modified' }],
          openUrl: `/univer-viewer/?file=KEY&worktree=${WORKTREE}`,
          worktreeUrl: `/univer-viewer/?file=KEY&worktree=${WORKTREE}&mode=embedded&scope=worktree`,
          mergeUrl: `/univer-viewer/?file=KEY&worktree=${WORKTREE}&mode=embedded&scope=mergePreview`
        }
      ]
    }
    const service = {
      async gatewayStatus() {
        return { phase: 'stopped', gateway: null, owned: false }
      },
      async unitContentStatus() {
        return 'bundled'
      },
      async ensureGateway() {
        calls.push(['ensureGateway'])
        return { ok: true, gateway: 'http://127.0.0.1:9123', reused: false }
      },
      async fileState(request: Record<string, unknown>) {
        calls.push(['fileState', request])
        return state
      },
      async worktreeAction(request: Record<string, unknown>) {
        calls.push(['worktreeAction', request])
        return { ok: true, action: request.action, worktreeId: request.worktreeId, state }
      }
    }
    const sessions = {
      get: (id: string) => (id === SESSION ? { header: { cwd: workspace } } : undefined)
    }
    const connection = { requestRejection: () => gateRejection }
    server = createServer(plugin.createUniverRouter(service, sessions, connection))
    origin = `http://127.0.0.1:${await listen(server)}`
    // Tools point at port 65535; keep it closed so every Gateway call fails fast.
    gatewayBlocker = createServer((_request, response) => {
      response.writeHead(404)
      response.end()
    })
    ownsGatewayBlocker = await listenOrAcceptOccupied(gatewayBlocker, 65_535)

    toolContext = new Context()
    await toolContext.plugin(SystemPrompt)
    await toolContext.plugin(ToolRuntime)
    toolContext.provide('attachments', {
      imageLimits: {
        mediaTypes: ['image/png'],
        maxImageBytes: 10_000_000,
        maxMessageImageBytes: 20_000_000
      },
      async saveImage() {
        throw new Error('screenshot must not reach attachment persistence in this test')
      }
    })
    toolContext.provide('llm', {
      async resolveModelInfo() {
        return { inputModalities: ['image'] }
      }
    })
    await toolContext.plugin(plugin, {
      gatewayPort: 65_535,
      gatewayStartupTimeoutMs: 50,
      gatewayRequestTimeoutMs: 50,
      skills: false
    })
    owner = {
      ctx: toolContext,
      options: { provider: 'host', model: 'vision' },
      session: {
        header: { cwd: workspace },
        requestHeader() {
          return { config: { provider: 'host', model: 'vision' } }
        }
      }
    }
  })

  afterAll(async () => {
    await toolContext?.fiber.dispose()
    if (ownsGatewayBlocker) await closeServer(gatewayBlocker)
    if (server !== undefined) await closeServer(server)
    if (canEnforcePermissionDenied) await chmod(lockedDirectory, 0o700)
    await rm(workspace, { recursive: true, force: true })
  })

  describe('/univer-api', () => {
    it('reports Gateway and Unit Content status', async () => {
      expect(await json('/univer-api/status')).toMatchObject({
        status: 200,
        body: { gateway: { phase: 'stopped' }, unitContent: 'bundled' }
      })
    })

    it('starts the Gateway', async () => {
      expect(await json('/univer-api/gateway/start', { method: 'POST' })).toMatchObject({
        status: 200,
        body: { ok: true }
      })
      expect(calls.at(-1)?.[0]).toBe('ensureGateway')
    })

    it('scopes projected Viewer URLs to the session and validates the file', async () => {
      const response = await json(
        `/univer-api/state?file=${encodeURIComponent(file)}&sessionId=${SESSION}`
      )
      expect(response.status).toBe(200)
      expect(response.body.viewerUrl).toBe(`${state.viewerUrl}&sessionId=${SESSION}`)
      expect(response.body.worktrees?.[0]?.openUrl).toBe(
        `${state.worktrees[0].openUrl}&sessionId=${SESSION}`
      )
      expect(calls.at(-1)?.[1]?.file).toBe(realFile)
    })

    it.each([
      [401, 'UNAUTHORIZED'],
      [403, 'FORBIDDEN']
    ])('gates every route behind the connection fence (%i)', async (rejection, code) => {
      gateRejection = rejection
      try {
        expect(await json('/univer-api/status')).toMatchObject({
          status: rejection,
          body: { code }
        })
      } finally {
        gateRejection = undefined
      }
    })

    it('runs a user review action', async () => {
      const response = await json('/univer-api/worktree-action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'merge', file, sessionId: SESSION, worktreeId: WORKTREE })
      })
      expect(response).toMatchObject({ status: 200, body: { ok: true } })
      expect(calls.at(-1)?.[1]?.worktreeId).toBe(WORKTREE)
    })

    it('rejects missing, unscoped, and outside-workspace files', async () => {
      expect(await json('/univer-api/state')).toMatchObject({
        status: 400,
        body: { code: 'INVALID_REQUEST' }
      })
      expect(await json(`/univer-api/state?file=${encodeURIComponent(file)}`)).toMatchObject({
        status: 400,
        body: { code: 'INVALID_REQUEST' }
      })
      expect(
        await json(
          `/univer-api/state?file=${encodeURIComponent(import.meta.filename)}&sessionId=${SESSION}`
        )
      ).toMatchObject({ status: 403, body: { code: 'SESSION_SCOPE_DENIED' } })
    })

    it('resolves a relative file inside the session workspace', async () => {
      const response = await json(`/univer-api/state?file=smoke.univer&sessionId=${SESSION}`)
      expect(response.status).toBe(200)
      expect(calls.at(-1)?.[1]?.file).toBe(realFile)
    })

    it.runIf(canEnforcePermissionDenied)(
      'keeps a permission failure distinct from a missing path',
      async () => {
        expect(
          await json(
            `/univer-api/state?file=${encodeURIComponent(lockedFile)}&sessionId=${SESSION}`
          )
        ).toMatchObject({ status: 403, body: { code: 'FILE_PERMISSION_DENIED' } })
      }
    )

    it('rejects an unknown action and an unknown route', async () => {
      const invalid = await fetch(`${origin}/univer-api/worktree-action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'destroy', file, sessionId: SESSION, worktreeId: WORKTREE })
      })
      expect(invalid.status).toBe(400)
      expect((await fetch(`${origin}/univer-api/unknown`)).status).toBe(404)
    })
  })

  describe('tool definitions', () => {
    it('distinguishes unknown-name find from known-name show in univer_api', () => {
      const description = toolContext.tools.get('univer_api')?.description
      expect(description).toContain('Use find when no relevant class or API label is known')
      expect(description).toContain('show the class itself')
      expect(description).toContain('Each query runs independently')
      expect(description).toContain('find does not interpret intent')
    })

    it('exposes Base and Board inspection in univer_inspect', () => {
      const description = toolContext.tools.get('univer_inspect')?.description
      expect(description).toContain('Base and Board default to selector-free overviews')
      expect(description).toContain('elementIds reads one or more Board elements')
    })

    it('documents returned values in univer_execute', () => {
      const description = toolContext.tools.get('univer_execute')?.description
      expect(description).toContain('Explicitly return readback values')
      expect(description).toContain('bare expressions and console.log do not populate value')
    })
  })

  describe('tools without a Gateway', () => {
    it.each([
      [{ action: 'find', queries: ['insertImage'], unit: 'board', limit: 3 }, 'FBoard.insertImage'],
      [{ action: 'find', queries: ['getSchema'], unit: 'base', limit: 3 }, 'FBase.getSchema']
    ])('answers univer_api %o', async (args, label) => {
      const result = await execute('univer_api', args)
      expect(result.isError).toBe(false)
      expect(toolText(result)).toContain(label)
    })

    it('lists resource registries', async () => {
      const result = await execute('univer_resources', { action: 'registries' })
      expect(result.isError).toBe(false)
      expect(toolText(result)).toContain('"operation":"resources"')
    })
  })

  describe('structured tool failures', () => {
    it.each([
      [
        'univer_execute',
        () => ({ file, codeFile, unitId: 'unit-1', worktreeId: WORKTREE }),
        'GATEWAY_UNAVAILABLE'
      ],
      [
        'univer_execute',
        () => ({ file, code: 'return true', codeFile, unitId: 'unit-1', worktreeId: WORKTREE }),
        'INVALID_EXECUTION_SOURCE'
      ],
      [
        'univer_inspect',
        () => ({ file, unitId: 'unit-1', range: 'A1:B2', elementIds: ['shape-1'] }),
        'INSPECTION_INPUT_INVALID'
      ],
      [
        'univer_inspect',
        () => ({ file, unitId: 'unit-1', elementIds: [] }),
        'INSPECTION_INPUT_INVALID'
      ],
      [
        'univer_screenshot',
        () => ({ file, unitId: 'unit-1', output: 'screenshots', pages: [1] }),
        'GATEWAY_UNAVAILABLE'
      ],
      [
        'univer_print_pdf',
        () => ({ file, unitId: 'unit-1', output: 'report.pdf' }),
        'GATEWAY_UNAVAILABLE'
      ],
      ['univer_status', () => ({ file: 'missing.univer' }), 'INVALID_FILE_PATH'],
      ['univer_status', () => ({ file }), 'GATEWAY_UNAVAILABLE']
    ] as const)('%s fails with %s', async (name, args, code) => {
      expectToolError(await execute(name, args()), code)
    })

    it.runIf(canEnforcePermissionDenied)(
      'univer_status reports FILE_PERMISSION_DENIED',
      async () => {
        expectToolError(
          await execute('univer_status', { file: lockedFile }),
          'FILE_PERMISSION_DENIED'
        )
      }
    )
  })
})

function toolText(result: any): string {
  return result.content.map((block: any) => (block.type === 'text' ? block.text : '')).join('')
}

// The structured error keeps its code for replay, and the model-facing text leads with it.
function expectToolError(result: any, code: string): void {
  expect(result.isError).toBe(true)
  expect(result.error.info).toMatchObject({ name: 'UniverError', code })
  expect(toolText(result).startsWith(`Error [${code}]: `)).toBe(true)
}
