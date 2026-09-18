// Host browser-protocol smoke: real node:http server over the generated router,
// with a deterministic service double. No global CLI or existing demo file.
import { createServer } from 'node:http'
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as UniverPlugin from '../lib/index.js'

const { createUniverRouter, edgeBrowserCandidatePaths, resolveConfig } = UniverPlugin

const defaultConfig = resolveConfig()
if (defaultConfig.gatewayPort !== 9080)
  throw new Error(`default Gateway port must be 9080: ${JSON.stringify(defaultConfig)}`)
if ('viewerBaseUrl' in defaultConfig) {
  throw new Error(
    'viewerBaseUrl was removed: the Viewer is served on the DSH origin (same-origin proxy)'
  )
}
if (defaultConfig.screenshotMaxPages !== 30 || defaultConfig.screenshotMaxPixels !== 16_777_216) {
  throw new Error(`default screenshot limits drifted: ${JSON.stringify(defaultConfig)}`)
}
if (defaultConfig.printPdfOperationTimeoutMs !== 120_000) {
  throw new Error(`default PDF print timeout drifted: ${JSON.stringify(defaultConfig)}`)
}
if (!defaultConfig.resourceCacheRoot.endsWith(join('cache', 'dsh-univer-office', 'resources'))) {
  throw new Error(`default resource cache root drifted: ${defaultConfig.resourceCacheRoot}`)
}
if ('browserExecutablePath' in defaultConfig) {
  throw new Error('browserExecutablePath must stay unset so the render runtime auto-detects')
}
const hostBundle = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8')
if (!hostBundle.includes('ELECTRON_RUN_AS_NODE')) {
  throw new Error(
    'Host bundle must set ELECTRON_RUN_AS_NODE so bundled Gateway/Worker entry scripts run as plain Node inside an Electron Desktop host'
  )
}
if (hostBundle.includes('settingsNamespace')) {
  throw new Error(
    'Host bundle must not import the settingsNamespace export removed in DSH 0.1.2-alpha.2'
  )
}
try {
  resolveConfig({ gatewayPort: 0 })
  throw new Error('zero Gateway port must be rejected')
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('gatewayPort')) throw error
}
for (const invalid of [
  { screenshotMaxPages: 0 },
  { printPdfOperationTimeoutMs: 0 },
  { resourceCacheRoot: 'relative/cache' },
  { browserExecutablePath: 'msedge.exe' },
  { browserExecutablePath: '  ' }
]) {
  try {
    resolveConfig(invalid)
    throw new Error(`invalid config must be rejected: ${JSON.stringify(invalid)}`)
  } catch (error) {
    const key = Object.keys(invalid)[0]
    if (!(error instanceof Error) || !error.message.includes(key)) throw error
  }
}
const configuredBrowserPath = join(tmpdir(), 'msedge.exe')
if (
  resolveConfig({ browserExecutablePath: configuredBrowserPath }).browserExecutablePath !==
  configuredBrowserPath
) {
  throw new Error('browserExecutablePath must pass through to the resolved config')
}
// The Windows Edge fallback is unreachable on this platform, so its candidate
// list is asserted directly: per-machine installs first, a per-user install
// only when the profile directory is known.
const defaultEdgeCandidates = [
  join('C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  join('C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
]
if (edgeBrowserCandidatePaths({}).join('|') !== defaultEdgeCandidates.join('|')) {
  throw new Error(
    `default Edge candidates drifted: ${JSON.stringify(edgeBrowserCandidatePaths({}))}`
  )
}
const localAppData = 'C:\\Users\\tester\\AppData\\Local'
const perUserEdge = join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
const edgeCandidates = edgeBrowserCandidatePaths({
  ProgramFiles: 'D:\\Program Files',
  'ProgramFiles(x86)': 'D:\\Program Files (x86)',
  LOCALAPPDATA: localAppData
})
if (
  edgeCandidates.length !== 3 ||
  edgeCandidates[0] !==
    join('D:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe') ||
  edgeCandidates[1] !==
    join('D:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe') ||
  edgeCandidates[2] !== perUserEdge
) {
  throw new Error(
    `per-user Edge candidate missing or out of order: ${JSON.stringify(edgeCandidates)}`
  )
}
if (edgeBrowserCandidatePaths({ LOCALAPPDATA: '  ' }).length !== 2) {
  throw new Error('a blank LOCALAPPDATA must not add a per-user Edge candidate')
}

class MemorySettings extends SettingsProvider {
  writable = true
  storedDocument = {}
  async load() {
    return this.storedDocument
  }
  async persist(namespace, section) {
    this.storedDocument = { ...this.storedDocument, [namespace]: section }
  }
}

const settingsContext = new Context()
try {
  await settingsContext.plugin(MemorySettings)
  await settingsContext.plugin(UniverPlugin, { tools: false, skills: false })
  const descriptor = settingsContext.settings
    .describe()
    .find((entry) => entry.ns === 'univer-office')
  if (
    descriptor?.value?.autoOpenLivePreview !== true ||
    descriptor?.value?.conversationReviewCards !== true ||
    descriptor.applies !== 'live'
  ) {
    throw new Error(`Univer Settings default missing: ${JSON.stringify(descriptor)}`)
  }
  await settingsContext.settings.update('univer-office', {
    autoOpenLivePreview: false,
    conversationReviewCards: false
  })
  const updated = settingsContext.settings.describe().find((entry) => entry.ns === 'univer-office')
  if (
    updated?.value?.autoOpenLivePreview !== false ||
    updated?.value?.conversationReviewCards !== false
  )
    throw new Error(`Univer Settings update failed: ${JSON.stringify(updated)}`)
} finally {
  await settingsContext.fiber.dispose()
}

const WORKSPACE = await mkdtemp(join(tmpdir(), 'dsh-univer-host-smoke-'))
const FILE = join(WORKSPACE, 'smoke.univer')
const CODE_FILE = join(WORKSPACE, 'facade-program.js')
await writeFile(FILE, '')
await writeFile(CODE_FILE, 'return { ok: true }\n')
const REAL_FILE = await realpath(FILE)
const LOCKED_DIRECTORY = join(WORKSPACE, 'locked')
const LOCKED_FILE = join(LOCKED_DIRECTORY, 'locked.univer')
// Root bypasses DAC checks, so a chmod(0) directory cannot deny anything.
const canEnforcePermissionDenied = process.platform !== 'win32' && (process.getuid?.() ?? 0) !== 0
await mkdir(LOCKED_DIRECTORY)
await writeFile(LOCKED_FILE, '')
if (canEnforcePermissionDenied) await chmod(LOCKED_DIRECTORY, 0)
const SESSION = 'host-smoke-session'
const WORKTREE = 'wt-host-smoke'
const calls = []
const state = {
  ok: true,
  file: FILE,
  gateway: 'http://127.0.0.1:9123',
  gatewayRunning: true,
  viewerUrl: '/univer-viewer/?file=KEY',
  worktrees: [
    {
      worktreeId: WORKTREE,
      name: 'host smoke',
      status: 'ready',
      units: [{ unitId: 'unit-1', name: 'Sheet 1', type: 'sheet', kind: 'modified' }],
      openUrl: '/univer-viewer/?file=KEY&worktree=wt-host-smoke',
      worktreeUrl: '/univer-viewer/?file=KEY&worktree=wt-host-smoke&mode=embedded&scope=worktree',
      mergeUrl: '/univer-viewer/?file=KEY&worktree=wt-host-smoke&mode=embedded&scope=mergePreview'
    }
  ]
}
let gateRejection
const connection = {
  requestRejection() {
    return gateRejection
  }
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
  async fileState(request) {
    calls.push(['fileState', request])
    return state
  },
  async worktreeAction(request) {
    calls.push(['worktreeAction', request])
    return { ok: true, action: request.action, worktreeId: request.worktreeId, state }
  }
}
const sessions = {
  get(id) {
    return id === SESSION ? { header: { cwd: WORKSPACE } } : undefined
  }
}

const server = createServer(createUniverRouter(service, sessions, connection))
await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
const address = server.address()
if (address === null || typeof address === 'string')
  throw new Error('host smoke did not receive a TCP port')
const origin = `http://127.0.0.1:${address.port}`
const gatewayBlocker = createServer((_request, response) => {
  response.writeHead(404)
  response.end()
})
const ownsGatewayBlocker = await listenOrAcceptOccupied(gatewayBlocker, 65_535)
const toolContext = new Context()

try {
  const status = await json('/univer-api/status')
  if (
    status.response.status !== 200 ||
    status.body.gateway?.phase !== 'stopped' ||
    status.body.unitContent !== 'bundled'
  ) {
    throw new Error(`status route failed: ${JSON.stringify(status.body)}`)
  }

  const start = await json('/univer-api/gateway/start', { method: 'POST' })
  if (
    start.response.status !== 200 ||
    start.body.ok !== true ||
    calls[0]?.[0] !== 'ensureGateway'
  ) {
    throw new Error(`Gateway start route failed: ${JSON.stringify(start.body)}`)
  }

  const fileState = await json(
    `/univer-api/state?file=${encodeURIComponent(FILE)}&sessionId=${SESSION}`
  )
  if (
    fileState.response.status !== 200 ||
    fileState.body.viewerUrl !== `${state.viewerUrl}&sessionId=${SESSION}` ||
    fileState.body.worktrees?.[0]?.openUrl !== `${state.worktrees[0].openUrl}&sessionId=${SESSION}`
  ) {
    throw new Error(`state route failed to scope projected URLs: ${JSON.stringify(fileState.body)}`)
  }

  gateRejection = 401
  const gated = await json('/univer-api/status')
  if (gated.response.status !== 401 || gated.body.code !== 'UNAUTHORIZED')
    throw new Error(`connection trust fence must gate /univer-api: ${JSON.stringify(gated.body)}`)
  gateRejection = 403
  const forbidden = await json('/univer-api/status')
  if (forbidden.response.status !== 403 || forbidden.body.code !== 'FORBIDDEN')
    throw new Error(`fence 403 must stay distinct from 401: ${JSON.stringify(forbidden.body)}`)
  gateRejection = undefined
  if (calls[1]?.[1]?.file !== REAL_FILE)
    throw new Error('state route did not pass the validated file')

  const action = await json('/univer-api/worktree-action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'merge', file: FILE, sessionId: SESSION, worktreeId: WORKTREE })
  })
  if (
    action.response.status !== 200 ||
    action.body.ok !== true ||
    calls[2]?.[1]?.worktreeId !== WORKTREE
  ) {
    throw new Error(`worktree action route failed: ${JSON.stringify(action.body)}`)
  }

  const missing = await json('/univer-api/state')
  if (missing.response.status !== 400 || missing.body.code !== 'INVALID_REQUEST')
    throw new Error('missing file must return INVALID_REQUEST')
  const relative = await json(`/univer-api/state?file=smoke.univer&sessionId=${SESSION}`)
  if (relative.response.status !== 200 || calls[3]?.[1]?.file !== REAL_FILE)
    throw new Error('relative file must resolve inside the session workspace')
  const missingSession = await json(`/univer-api/state?file=${encodeURIComponent(FILE)}`)
  if (missingSession.response.status !== 400 || missingSession.body.code !== 'INVALID_REQUEST')
    throw new Error('missing sessionId must return INVALID_REQUEST')
  const outside = await json(
    `/univer-api/state?file=${encodeURIComponent(import.meta.filename)}&sessionId=${SESSION}`
  )
  if (outside.response.status !== 403 || outside.body.code !== 'SESSION_SCOPE_DENIED')
    throw new Error('outside-workspace file must be denied')
  if (canEnforcePermissionDenied) {
    const permissionDenied = await json(
      `/univer-api/state?file=${encodeURIComponent(LOCKED_FILE)}&sessionId=${SESSION}`
    )
    if (
      permissionDenied.response.status !== 403 ||
      permissionDenied.body.code !== 'FILE_PERMISSION_DENIED'
    ) {
      throw new Error(
        `permission failure must stay distinct from a missing path: ${JSON.stringify(permissionDenied.body)}`
      )
    }
  }
  const invalidAction = await json('/univer-api/worktree-action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'destroy',
      file: FILE,
      sessionId: SESSION,
      worktreeId: WORKTREE
    })
  })
  if (invalidAction.response.status !== 400) throw new Error('invalid action must return 400')
  const unknown = await fetch(`${origin}/univer-api/unknown`)
  if (unknown.status !== 404) throw new Error('unknown route must return 404')

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
  await toolContext.plugin(UniverPlugin, {
    gatewayPort: 65_535,
    gatewayStartupTimeoutMs: 50,
    gatewayRequestTimeoutMs: 50,
    skills: false
  })
  const apiDefinition = toolContext.tools.get('univer_api')
  if (
    !apiDefinition?.description.includes('Use find when no relevant class or API label is known') ||
    !apiDefinition.description.includes('show the class itself') ||
    !apiDefinition.description.includes('Each query runs independently') ||
    !apiDefinition.description.includes('find does not interpret intent')
  ) {
    throw new Error(
      `univer_api must distinguish unknown-name find from known-name show: ${apiDefinition?.description ?? 'missing'}`
    )
  }
  const inspectDefinition = toolContext.tools.get('univer_inspect')
  if (
    !inspectDefinition?.description.includes('Base and Board default to selector-free overviews') ||
    !inspectDefinition.description.includes('elementIds reads one or more Board elements')
  ) {
    throw new Error(
      `univer_inspect must expose Base and Board inspection: ${inspectDefinition?.description ?? 'missing'}`
    )
  }
  const executeDefinition = toolContext.tools.get('univer_execute')
  if (
    !executeDefinition?.description.includes('Explicitly return readback values') ||
    !executeDefinition.description.includes(
      'bare expressions and console.log do not populate value'
    )
  ) {
    throw new Error(
      `univer_execute must document returned values: ${executeDefinition?.description ?? 'missing'}`
    )
  }
  const owner = {
    ctx: toolContext,
    options: { provider: 'host-smoke', model: 'vision' },
    session: {
      header: { cwd: WORKSPACE },
      requestHeader() {
        return { config: { provider: 'host-smoke', model: 'vision' } }
      }
    }
  }
  const boardApiResult = await toolContext.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId('host-smoke-board-api'),
    name: 'univer_api',
    arguments: { action: 'find', queries: ['insertImage'], unit: 'board', limit: 3 },
    agent: owner
  })
  if (boardApiResult.isError || !toolText(boardApiResult).includes('FBoard.insertImage')) {
    throw new Error(
      `Board API reference must be accepted by the tool schema: ${JSON.stringify(boardApiResult)}`
    )
  }
  const baseApiResult = await toolContext.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId('host-smoke-base-api'),
    name: 'univer_api',
    arguments: { action: 'find', queries: ['getSchema'], unit: 'base', limit: 3 },
    agent: owner
  })
  if (baseApiResult.isError || !toolText(baseApiResult).includes('FBase.getSchema')) {
    throw new Error(
      `Base API reference must be accepted by the tool schema: ${JSON.stringify(baseApiResult)}`
    )
  }
  const resourcesResult = await toolContext.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId('host-smoke-resources'),
    name: 'univer_resources',
    arguments: { action: 'registries' },
    agent: owner
  })
  if (resourcesResult.isError || !toolText(resourcesResult).includes('"operation":"resources"')) {
    throw new Error(
      `resource registries must be available without Gateway: ${JSON.stringify(resourcesResult)}`
    )
  }

  const codeFileResult = await toolContext.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId('host-smoke-execute-code-file'),
    name: 'univer_execute',
    arguments: { file: FILE, codeFile: CODE_FILE, unitId: 'unit-1', worktreeId: WORKTREE },
    agent: owner
  })
  assertToolError(codeFileResult, 'GATEWAY_UNAVAILABLE')

  const ambiguousCodeResult = await toolContext.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId('host-smoke-execute-ambiguous-code'),
    name: 'univer_execute',
    arguments: {
      file: FILE,
      code: 'return true',
      codeFile: CODE_FILE,
      unitId: 'unit-1',
      worktreeId: WORKTREE
    },
    agent: owner
  })
  assertToolError(ambiguousCodeResult, 'INVALID_EXECUTION_SOURCE')

  const ambiguousInspectResult = await toolContext.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId('host-smoke-inspect-ambiguous-selector'),
    name: 'univer_inspect',
    arguments: { file: FILE, unitId: 'unit-1', range: 'A1:B2', elementIds: ['shape-1'] },
    agent: owner
  })
  assertToolError(ambiguousInspectResult, 'INSPECTION_INPUT_INVALID')

  const emptyElementIdsResult = await toolContext.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId('host-smoke-inspect-empty-element-ids'),
    name: 'univer_inspect',
    arguments: { file: FILE, unitId: 'unit-1', elementIds: [] },
    agent: owner
  })
  assertToolError(emptyElementIdsResult, 'INSPECTION_INPUT_INVALID')

  const screenshotResult = await toolContext.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId('host-smoke-screenshot'),
    name: 'univer_screenshot',
    arguments: { file: FILE, unitId: 'unit-1', output: 'screenshots', pages: [1] },
    agent: owner
  })
  assertToolError(screenshotResult, 'GATEWAY_UNAVAILABLE')

  const printPdfResult = await toolContext.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId('host-smoke-print-pdf'),
    name: 'univer_print_pdf',
    arguments: { file: FILE, unitId: 'unit-1', output: 'report.pdf' },
    agent: owner
  })
  assertToolError(printPdfResult, 'GATEWAY_UNAVAILABLE')

  const missingToolResult = await toolContext.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId('host-smoke-missing-path'),
    name: 'univer_status',
    arguments: { file: 'missing.univer' },
    agent: owner
  })
  assertToolError(missingToolResult, 'INVALID_FILE_PATH')

  if (canEnforcePermissionDenied) {
    const permissionToolResult = await toolContext.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('host-smoke-permission'),
      name: 'univer_status',
      arguments: { file: LOCKED_FILE },
      agent: owner
    })
    assertToolError(permissionToolResult, 'FILE_PERMISSION_DENIED')
  }

  const gatewayToolResult = await toolContext.tools.execute({
    signal: new AbortController().signal,
    callId: ToolCallId('host-smoke-gateway'),
    name: 'univer_status',
    arguments: { file: FILE },
    agent: owner
  })
  assertToolError(gatewayToolResult, 'GATEWAY_UNAVAILABLE')
} finally {
  await toolContext.fiber.dispose()
  if (ownsGatewayBlocker) {
    await new Promise((resolve, reject) =>
      gatewayBlocker.close((error) => (error === undefined ? resolve() : reject(error)))
    )
  }
  await new Promise((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error)))
  )
  if (canEnforcePermissionDenied) await chmod(LOCKED_DIRECTORY, 0o700)
  await rm(WORKSPACE, { recursive: true, force: true })
}

console.log(
  'host smoke OK (Gateway errors, structured tool failures, permissions, state, user review action)'
)

async function json(path, init) {
  const response = await fetch(`${origin}${path}`, init)
  return { response, body: await response.json() }
}

function assertToolError(result, code) {
  if (
    !result.isError ||
    result.error.info?.name !== 'UniverError' ||
    result.error.info.code !== code
  ) {
    throw new Error(`tool failure must retain ${code}: ${JSON.stringify(result)}`)
  }
  const content = toolText(result)
  if (!content.startsWith(`Error [${code}]: `)) {
    throw new Error(
      `model-facing tool failure must include ${code}: ${JSON.stringify(result.content)}`
    )
  }
}

function toolText(result) {
  return result.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
}

async function listenOrAcceptOccupied(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', (error) => {
      if (error?.code === 'EADDRINUSE') resolve(false)
      else reject(error)
    })
    server.listen(port, '127.0.0.1', () => resolve(true))
  })
}
