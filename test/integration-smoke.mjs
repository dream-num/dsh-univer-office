import { createHash } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { launch } from 'puppeteer-core'

const { Context } = await import('@deepseek-ai/cordis')
const { resolveUniverRenderBrowser } = await import('@univer-cli/univer-render-runtime')
const packageRoot = process.env.UNIVER_PLUGIN_ROOT
if (packageRoot !== undefined && !isAbsolute(packageRoot))
  throw new Error('UNIVER_PLUGIN_ROOT must be absolute')
const manifestPath =
  packageRoot === undefined
    ? new URL('../package.json', import.meta.url)
    : join(packageRoot, 'package.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const gatewayArtifact =
  packageRoot === undefined
    ? new URL('../artifacts/gateway.cjs', import.meta.url)
    : join(packageRoot, 'artifacts', 'gateway.cjs')
if ((await readFile(gatewayArtifact, 'utf8')).includes('require("@univerjs-pro/exchange-node")')) {
  throw new Error('bundled Gateway must not require @univerjs-pro/exchange-node at runtime')
}
// Release manifest gate: the repository manifests never declare the native
// bindings (their wrappers own the versions); the published dist manifest
// receives them at packaging time from scripts/inject-runtime-bindings.mjs.
// Verifying against an installed package therefore asserts the opposite — the
// published manifest must install the bindings as direct dependencies, because
// pnpm consumers cannot resolve transitive dependencies from the plugin bundles.
{
  const bindingNames = [
    '@univerjs-pro/engine-formula-rust-binding',
    '@univerjs-pro/exchange-node-binding'
  ]
  const declaredBindings = bindingNames.filter(
    (binding) =>
      manifest.dependencies?.[binding] !== undefined ||
      manifest.devDependencies?.[binding] !== undefined ||
      manifest.peerDependencies?.[binding] !== undefined
  )
  if (packageRoot === undefined && declaredBindings.length > 0) {
    throw new Error(
      `transitive bindings must not be declared in the repository manifest: ${declaredBindings.join(', ')}`
    )
  }
  if (packageRoot !== undefined && declaredBindings.length !== bindingNames.length) {
    throw new Error(
      `published manifest must install the native bindings as direct dependencies: ${bindingNames.join(', ')}`
    )
  }
  const { createRequire } = await import('node:module')
  const repoRequire = createRequire(manifestPath)
  for (const binding of bindingNames) {
    let cursor = dirname(repoRequire.resolve(binding))
    let installed
    for (;;) {
      try {
        installed = JSON.parse(await readFile(join(cursor, 'package.json'), 'utf8'))
        break
      } catch {
        const parent = dirname(cursor)
        if (parent === cursor) throw new Error(`package manifest not found for ${binding}`)
        cursor = parent
      }
    }
    if (
      installed.name !== binding ||
      !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(installed.version ?? '')
    ) {
      throw new Error(
        `resolved ${binding} to an unexpected package: ${installed.name}@${installed.version}`
      )
    }
  }
}
const entry =
  packageRoot === undefined
    ? new URL('../lib/index.js', import.meta.url).href
    : pathToFileURL(join(packageRoot, 'lib', 'index.js')).href
const univerPlugin = await import(entry)
const { GatewayUniverService, resolveConfig } = univerPlugin
const scratch = await mkdtemp(join(tmpdir(), 'dsh-univer-integration-smoke-'))
const workspace = await realpath(scratch)
const file = join(workspace, 'smoke.univer')
const source = join(workspace, 'import.csv')
const svgSource = join(workspace, 'slide.svg')
const exported = join(workspace, 'smoke.xlsx')
const screenshotOutput = join(workspace, 'screenshots')
const printedPdf = join(workspace, 'rendered.pdf')
const resourceOutput = join(workspace, 'resources')
await writeFile(source, 'name,value\nalpha,1\nbeta,2\n')
await writeFile(
  svgSource,
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540"><rect width="960" height="540" fill="#f7f8fb"/><text x="80" y="160" font-family="Arial" font-size="54" fill="#182230">Bundled SVG</text></svg>'
)

const { foreign, occupiedPort, availablePort } = await occupyPortWithFreeSuccessor()
const origin = `http://127.0.0.1:${availablePort}`
const service = new GatewayUniverService(
  new Context(),
  resolveConfig({ gatewayPort: occupiedPort, tools: false })
)
const scoped = { workspace, file }

try {
  const [started, joinedStart] = await Promise.all([
    service.ensureGateway(),
    service.ensureGateway()
  ])
  if (!started.ok || started.gateway !== origin || started.reused !== false) {
    throw new Error(`plugin failed to start bundled Gateway: ${JSON.stringify(started)}`)
  }
  if (!joinedStart.ok || joinedStart.gateway !== origin || joinedStart.reused !== false) {
    throw new Error(
      `concurrent callers did not join the same Gateway startup: ${JSON.stringify(joinedStart)}`
    )
  }
  const foreignResponse = await fetch(`http://127.0.0.1:${occupiedPort}`)
  if ((await foreignResponse.text()) !== 'not a Univer Gateway') {
    throw new Error('plugin must not reuse or terminate the service occupying its initial port')
  }
  const reused = await service.ensureGateway()
  if (!reused.ok || reused.gateway !== origin || reused.reused !== true) {
    throw new Error(`plugin failed to reuse its own Gateway: ${JSON.stringify(reused)}`)
  }
  const viewer = await fetch(`${origin}/`)
  if (!viewer.ok || !(await viewer.text()).includes('<html')) {
    throw new Error('bundled Viewer index was not served')
  }

  const created = await service.newFile(scoped)
  if (!created.ok || created.operation !== 'new' || created.result?.created !== true) {
    throw new Error(`new Univer file failed: ${JSON.stringify(created)}`)
  }
  const empty = await service.status(scoped)
  if (empty.result?.trunk?.units?.length !== 0)
    throw new Error(`new file must be empty: ${JSON.stringify(empty)}`)

  const worktreeOperation = await service.worktree({
    ...scoped,
    action: 'create',
    name: 'integration smoke'
  })
  const worktree = worktreeOperation.result
  if (
    worktree === null ||
    typeof worktree !== 'object' ||
    Array.isArray(worktree) ||
    typeof worktree.worktreeId !== 'string' ||
    worktree.status !== 'draft'
  ) {
    throw new Error(`create worktree failed: ${JSON.stringify(worktree)}`)
  }
  const worktreeId = worktree.worktreeId
  const projected = await service.fileState(scoped)
  const projectedWorktree = projected.worktrees.find((entry) => entry.worktreeId === worktreeId)
  const viewerFileKey = encodeURIComponent(Buffer.from(file).toString('base64url'))
  if (
    projected.gateway !== origin ||
    projected.viewerUrl !== `/univer-viewer/?file=${viewerFileKey}` ||
    projectedWorktree?.openUrl !==
      `/univer-viewer/?file=${viewerFileKey}&worktree=${encodeURIComponent(worktreeId)}` ||
    !projectedWorktree?.worktreeUrl?.startsWith('/univer-viewer/?')
  ) {
    throw new Error(`Viewer targets were not projected same-origin: ${JSON.stringify(projected)}`)
  }

  const createdUnit = await service.unit({
    ...scoped,
    action: 'create',
    worktreeId,
    kind: 'sheet',
    name: 'Smoke'
  })
  const unitId = createdUnit.result?.unitId
  if (typeof unitId !== 'string')
    throw new Error(`create Unit failed: ${JSON.stringify(createdUnit)}`)

  // ---- same-origin Viewer proxy (docs/viewer-same-origin-deployment.md) ----
  const PROXY_SESSION = 'integration-smoke-session'
  const proxyFileKey = Buffer.from(file).toString('base64url')
  let gateRejection
  const proxy = univerPlugin.createViewerProxy({
    gatewayOrigin: async () => {
      const started = await service.ensureGateway()
      if (!started.ok) throw new Error(started.reason)
      return started.gateway
    },
    sessions: {
      get: (id) => (id === PROXY_SESSION ? { header: { cwd: workspace } } : undefined)
    },
    connection: { requestRejection: () => gateRejection }
  })
  const proxyServer = createHttpServer((req, res) => void proxy.httpHandler(req, res))
  proxyServer.on('upgrade', proxy.upgradeHandler)
  await new Promise((resolve, reject) => {
    proxyServer.once('error', reject)
    proxyServer.listen(0, '127.0.0.1', resolve)
  })
  const proxyOrigin = `http://127.0.0.1:${proxyServer.address().port}`
  try {
    const viewerMount = await fetch(`${origin}/univer-viewer/`)
    if (!viewerMount.ok || !(await viewerMount.text()).includes('<html')) {
      throw new Error('Gateway must mount the Viewer under the shared base for direct access')
    }

    gateRejection = 401
    const gatedDocument = await fetch(
      `${proxyOrigin}/univer-viewer/?file=${proxyFileKey}&sessionId=${PROXY_SESSION}`
    )
    if (gatedDocument.status !== 401) {
      throw new Error(`connection fence must gate the Viewer proxy: ${gatedDocument.status}`)
    }
    gateRejection = undefined

    const unscopedDocument = await fetch(`${proxyOrigin}/univer-viewer/?file=${proxyFileKey}`)
    if (unscopedDocument.status !== 403) {
      throw new Error(
        `Viewer document without a session must be refused: ${unscopedDocument.status}`
      )
    }
    const foreignDocument = await fetch(
      `${proxyOrigin}/univer-viewer/?file=${proxyFileKey}&sessionId=foreign-session`
    )
    if (foreignDocument.status !== 403) {
      throw new Error(
        `Viewer document outside the session scope must be refused: ${foreignDocument.status}`
      )
    }

    const document = await fetch(
      `${proxyOrigin}/univer-viewer/?file=${proxyFileKey}&sessionId=${PROXY_SESSION}`
    )
    const documentHtml = await document.text()
    if (!document.ok || !documentHtml.includes('<html')) {
      throw new Error(`scoped Viewer document was not proxied: ${document.status}`)
    }
    const scopeCookie = (document.headers.get('set-cookie') ?? '').split(';')[0]
    if (!scopeCookie.startsWith('univer-viewer-sessions=')) {
      throw new Error(
        `Viewer document did not bind the session scope: ${document.headers.get('set-cookie')}`
      )
    }
    const scopedAsset = documentHtml.match(/\/univer-viewer\/assets\/[^"']+\.css/u)?.[0]
    if (scopedAsset === undefined) {
      throw new Error(
        `built Viewer must reference assets under the shared base: ${documentHtml.slice(0, 400)}`
      )
    }
    const assetResponse = await fetch(`${proxyOrigin}${scopedAsset}`)
    if (!assetResponse.ok) {
      throw new Error(`Viewer assets were not proxied under the base: ${scopedAsset}`)
    }

    const ufBase = `${proxyOrigin}/uf/${proxyFileKey}`
    const unscopedApi = await fetch(`${ufBase}/worktrees`)
    if (unscopedApi.status !== 403) {
      throw new Error(`/uf without a bound session must be refused: ${unscopedApi.status}`)
    }
    const foreignApi = await fetch(`${ufBase}/worktrees`, {
      headers: { cookie: 'univer-viewer-sessions=foreign-session' }
    })
    if (foreignApi.status !== 403) {
      throw new Error(`/uf outside the bound session scope must be refused: ${foreignApi.status}`)
    }
    const malformedApi = await fetch(`${ufBase}/worktrees`, {
      headers: { cookie: 'univer-viewer-sessions=%zz' }
    })
    if (malformedApi.status !== 403) {
      throw new Error(`malformed scope cookie must fail closed: ${malformedApi.status}`)
    }
    const scopedApi = await fetch(`${ufBase}/worktrees`, { headers: { cookie: scopeCookie } })
    if (!scopedApi.ok) {
      throw new Error(`scoped /uf request failed: ${scopedApi.status} ${await scopedApi.text()}`)
    }

    const { WebSocket } = await import('ws')
    const tunnelFrame = await new Promise((resolve, reject) => {
      const client = new WebSocket(
        `${proxyOrigin}/univer-viewer/ws?target=${encodeURIComponent(`/uf/${proxyFileKey}/events`)}`,
        { headers: { cookie: scopeCookie } }
      )
      const timer = setTimeout(() => {
        client.terminate()
        reject(new Error('tunneled lifecycle events channel never opened'))
      }, 10_000)
      client.on('unexpected-response', (_req, response) => {
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
          service
            .worktree({ ...scoped, action: 'create', name: 'proxy event smoke' })
            .then(() => undefined)
            .catch((error) => {
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
    const tunneledWorktreeId = tunnelFrame.worktree?.worktreeId
    if (typeof tunneledWorktreeId !== 'string') {
      throw new Error(`tunneled lifecycle frame was malformed: ${JSON.stringify(tunnelFrame)}`)
    }
    const refusedTunnel = await new Promise((resolve) => {
      const client = new WebSocket(
        `${proxyOrigin}/univer-viewer/ws?target=${encodeURIComponent(`/uf/${proxyFileKey}/events`)}`
      )
      client.on('unexpected-response', (_req, response) => {
        resolve(response.statusCode)
      })
      client.on('open', () => {
        client.terminate()
        resolve('opened')
      })
      client.on('error', () => resolve('error'))
    })
    if (refusedTunnel !== 403) {
      throw new Error(`tunnel without a bound session must be refused: ${String(refusedTunnel)}`)
    }
    const malformedTunnel = await new Promise((resolve) => {
      const client = new WebSocket(
        `${proxyOrigin}/univer-viewer/ws?target=${encodeURIComponent(`/uf/${proxyFileKey}/events`)}`,
        { headers: { cookie: 'univer-viewer-sessions=%zz' } }
      )
      client.on('unexpected-response', (_req, response) => resolve(response.statusCode))
      client.on('open', () => {
        client.terminate()
        resolve('opened')
      })
      client.on('error', () => resolve('error'))
    })
    if (malformedTunnel !== 403) {
      throw new Error(`tunnel with a malformed cookie must fail closed: ${String(malformedTunnel)}`)
    }

    // The comb endpoint authenticates each upgrade with a one-time query parameter the client
    // appends to the tunneled URL, then speaks TEXT frames; the tunnel must relay endpoint
    // parameters upstream and preserve the frame opcode, or every collab socket dies right
    // after opening (issue #76). A full HELLO round trip proves both, and the same upgrade
    // without the parameter is the differential control.
    const ticketResponse = await fetch(
      `${ufBase}/worktrees/${tunneledWorktreeId}/universer-api/user/session-ticket`,
      { headers: { cookie: scopeCookie } }
    )
    if (!ticketResponse.ok) {
      throw new Error(`session ticket request failed: ${ticketResponse.status}`)
    }
    const ticketBody = await ticketResponse.json()
    if (typeof ticketBody.ticket !== 'string' || ticketBody.ticket.length === 0) {
      throw new Error(`session ticket response carried no ticket: ${JSON.stringify(ticketBody)}`)
    }
    const combTunnelBase =
      `${proxyOrigin}/univer-viewer/ws?target=` +
      encodeURIComponent(
        `/uf/${proxyFileKey}/worktrees/${tunneledWorktreeId}/universer-api/comb/connect`
      )
    const memberID = await new Promise((resolve, reject) => {
      const client = new WebSocket(
        `${combTunnelBase}&sessionTicket=${encodeURIComponent(ticketBody.ticket)}`,
        { headers: { cookie: scopeCookie } }
      )
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
    if (typeof memberID !== 'string' || memberID.length === 0) {
      throw new Error(`comb HELLO through the tunnel carried no memberID: ${String(memberID)}`)
    }
    const anonymousHold = await new Promise((resolve) => {
      const client = new WebSocket(combTunnelBase, { headers: { cookie: scopeCookie } })
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
    if (anonymousHold === 'held open') {
      throw new Error('comb upgrade without a session ticket must not hold the socket open')
    }

    const disposedClosed = await new Promise((resolve, reject) => {
      const client = new WebSocket(
        `${proxyOrigin}/univer-viewer/ws?target=${encodeURIComponent(`/uf/${proxyFileKey}/events`)}`,
        { headers: { cookie: scopeCookie } }
      )
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
    if (disposedClosed !== 'closed') {
      throw new Error(`dispose did not close live bridges: ${String(disposedClosed)}`)
    }
    await service.worktreeAction({
      ...scoped,
      action: 'discard',
      worktreeId: tunneledWorktreeId
    })
  } finally {
    proxy.dispose()
    await closeServer(proxyServer)
  }

  const beforeUnsupportedRemoval = await service.status({ ...scoped, worktreeId })
  await Promise.all(
    [true, false].map(async (removed) => {
      const response = await fetch(
        `${origin}/uf/${Buffer.from(file).toString('base64url')}/universer-api/worktrees/${encodeURIComponent(worktreeId)}/units/${encodeURIComponent(unitId)}/removal`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ removed })
        }
      )
      const body = await response.json()
      if (
        response.status !== 400 ||
        body.error?.code !== 'INVALID_REQUEST' ||
        body.error?.message !== 'Reversible Worktree Unit removal is not supported by Univerfile'
      ) {
        throw new Error(`unsupported removal must reject explicitly: ${JSON.stringify(body)}`)
      }
    })
  )
  const afterUnsupportedRemoval = await service.status({ ...scoped, worktreeId })
  if (
    JSON.stringify(afterUnsupportedRemoval.result) !==
    JSON.stringify(beforeUnsupportedRemoval.result)
  ) {
    throw new Error('unsupported removal must preserve existing Worktree state')
  }

  const temporary = await service.unit({
    ...scoped,
    action: 'create',
    worktreeId,
    kind: 'doc',
    name: 'Temporary'
  })
  if (typeof temporary.result?.unitId !== 'string')
    throw new Error(`temporary Unit failed: ${JSON.stringify(temporary)}`)
  const removed = await service.unit({
    ...scoped,
    action: 'remove',
    worktreeId,
    unitId: temporary.result.unitId
  })
  if (removed.result?.removed !== true)
    throw new Error(`remove Unit failed: ${JSON.stringify(removed)}`)
  const doc = await service.unit({
    ...scoped,
    action: 'create',
    worktreeId,
    kind: 'doc',
    name: 'History Document'
  })
  const docUnitId = doc.result?.unitId
  if (typeof docUnitId !== 'string') throw new Error(`Doc Unit failed: ${JSON.stringify(doc)}`)

  const slide = await service.unit({
    ...scoped,
    action: 'create',
    worktreeId,
    kind: 'slide',
    name: 'Rendered'
  })
  const slideUnitId = slide.result?.unitId
  if (typeof slideUnitId !== 'string')
    throw new Error(`Slide Unit failed: ${JSON.stringify(slide)}`)
  const base = await service.unit({
    ...scoped,
    action: 'create',
    worktreeId,
    kind: 'base',
    name: 'Tasks'
  })
  const baseUnitId = base.result?.unitId
  if (typeof baseUnitId !== 'string') throw new Error(`Base Unit failed: ${JSON.stringify(base)}`)
  const board = await service.unit({
    ...scoped,
    action: 'create',
    worktreeId,
    kind: 'board',
    name: 'Planning Board'
  })
  const boardUnitId = board.result?.unitId
  if (typeof boardUnitId !== 'string')
    throw new Error(`Board Unit failed: ${JSON.stringify(board)}`)
  const compiledSvg = await service.compileSvg({
    ...scoped,
    source: svgSource,
    sourceWorkspace: workspace,
    worktreeId,
    unitId: slideUnitId,
    page: 1
  })
  if (
    compiledSvg.operation !== 'compile-svg' ||
    compiledSvg.result?.execution?.committed !== true
  ) {
    throw new Error(`SVG compile/apply failed: ${JSON.stringify(compiledSvg)}`)
  }
  const layout = await service.lintUnitLayout({ ...scoped, worktreeId, unitId: slideUnitId })
  if (
    layout.operation !== 'lint' ||
    layout.result?.kind !== 'unit-layout-lint' ||
    layout.result?.coverage?.pages?.length !== 1 ||
    !Array.isArray(layout.result?.findings)
  ) {
    throw new Error(`Slide layout lint failed: ${JSON.stringify(layout)}`)
  }
  const screenshot = await service.screenshotUnit({
    ...scoped,
    worktreeId,
    unitId: slideUnitId,
    output: screenshotOutput,
    outputWorkspace: workspace,
    target: { kind: 'paged-unit', pages: [1], contactSheet: {}, scale: 1 }
  })
  if (
    screenshot.operation !== 'screenshot' ||
    screenshot.result.images.length !== 2 ||
    screenshot.result.images.some(
      (image) => image.mediaType !== 'image/png' || image.data.length === 0
    )
  ) {
    throw new Error(`Slide screenshot failed: ${JSON.stringify(screenshot)}`)
  }
  for (const image of screenshot.result.images) {
    if ((await stat(image.path)).size === 0)
      throw new Error(`screenshot produced an empty file: ${image.path}`)
  }

  // Config override: browserExecutablePath must reach the render runtime, so an
  // explicitly configured browser captures exactly like auto-detection (issue #64).
  const explicitBrowser = await resolveUniverRenderBrowser()
  if (explicitBrowser.status !== 'found') {
    throw new Error(
      `explicit-browser screenshot had no browser: ${JSON.stringify(explicitBrowser)}`
    )
  }
  const explicitService = new GatewayUniverService(
    new Context(),
    resolveConfig({
      gatewayPort: occupiedPort,
      tools: false,
      browserExecutablePath: explicitBrowser.executablePath
    })
  )
  const explicitFile = join(workspace, 'explicit-browser.univer')
  try {
    const explicitCreated = await explicitService.newFile({ workspace, file: explicitFile })
    if (!explicitCreated.ok || explicitCreated.result?.created !== true) {
      throw new Error(`explicit-browser file creation failed: ${JSON.stringify(explicitCreated)}`)
    }
    const explicitWorktree = await explicitService.worktree({
      workspace,
      file: explicitFile,
      action: 'create',
      name: 'explicit browser'
    })
    const explicitWorktreeId = explicitWorktree.result?.worktreeId
    if (typeof explicitWorktreeId !== 'string') {
      throw new Error(`explicit-browser worktree failed: ${JSON.stringify(explicitWorktree)}`)
    }
    const explicitUnit = await explicitService.unit({
      workspace,
      file: explicitFile,
      action: 'create',
      worktreeId: explicitWorktreeId,
      kind: 'sheet',
      name: 'Explicit'
    })
    const explicitUnitId = explicitUnit.result?.unitId
    if (typeof explicitUnitId !== 'string') {
      throw new Error(`explicit-browser Unit failed: ${JSON.stringify(explicitUnit)}`)
    }
    const explicitScreenshot = await explicitService.screenshotUnit({
      workspace,
      file: explicitFile,
      worktreeId: explicitWorktreeId,
      unitId: explicitUnitId,
      output: join(workspace, 'explicit-screenshots'),
      outputWorkspace: workspace,
      target: { kind: 'unit-viewport', scale: 1 }
    })
    if (
      explicitScreenshot.operation !== 'screenshot' ||
      explicitScreenshot.result.images.length < 1 ||
      explicitScreenshot.result.images.some(
        (image) => image.mediaType !== 'image/png' || image.data.length === 0
      )
    ) {
      throw new Error(`explicit-browser screenshot failed: ${JSON.stringify(explicitScreenshot)}`)
    }
    for (const image of explicitScreenshot.result.images) {
      if ((await stat(image.path)).size === 0)
        throw new Error(`explicit-browser screenshot produced an empty file: ${image.path}`)
    }
  } finally {
    await explicitService.dispose()
  }

  // Tool-level screenshot: the durable attachment ref must describe the stored
  // object. A normalizing attachment store re-encodes the renderer's PNG, so
  // every field of `image` must come from the store's reference — a ref that
  // claims the renderer's mediaType makes session replay fail permanently
  // with ATTACHMENT_CORRUPT (issue #67).
  const attachmentRefs = []
  const screenshotToolContext = new Context()
  try {
    const { ToolCallId } = await import('@deepseek-ai/dsh-llm/brand')
    const [{ default: SystemPrompt }, { default: ToolRuntime }] = await Promise.all([
      import('@deepseek-ai/dsh-system-prompt'),
      import('@deepseek-ai/dsh-tools')
    ])
    await screenshotToolContext.plugin(SystemPrompt)
    await screenshotToolContext.plugin(ToolRuntime)
    screenshotToolContext.provide('attachments', {
      imageLimits: {
        mediaTypes: ['image/png'],
        maxImageBytes: 64 * 1024 * 1024,
        maxMessageImageBytes: 128 * 1024 * 1024
      },
      // Simulate a normalizing store: the durable object is re-encoded, so the
      // reference describes a WebP object with store-probed dimensions that
      // differ from the renderer's declared PNG facts.
      async saveImages(inputs) {
        return inputs.map((input) => {
          const ref = {
            attachmentId: `sha256:${createHash('sha256').update(input.data).digest('hex')}`,
            mediaType: 'image/webp',
            bytes: input.data.byteLength,
            width: 1234,
            height: 567,
            name: input.name
          }
          attachmentRefs.push(ref)
          return ref
        })
      }
    })
    screenshotToolContext.provide('llm', {
      async resolveModelInfo() {
        return { inputModalities: ['image'] }
      }
    })
    await screenshotToolContext.plugin(univerPlugin, {
      gatewayPort: availablePort,
      skills: false
    })
    const screenshotOwner = {
      ctx: screenshotToolContext,
      options: { provider: 'integration-smoke', model: 'vision' },
      session: {
        header: { cwd: workspace },
        requestHeader() {
          return { config: { provider: 'integration-smoke', model: 'vision' } }
        }
      }
    }
    const toolScreenshot = await screenshotToolContext.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('integration-smoke-screenshot'),
      name: 'univer_screenshot',
      arguments: {
        file,
        unitId: slideUnitId,
        worktreeId,
        output: 'screenshots-tool',
        pages: [1]
      },
      agent: screenshotOwner
    })
    if (toolScreenshot.isError) {
      throw new Error(`tool-level screenshot failed: ${JSON.stringify(toolScreenshot)}`)
    }
    const payload = JSON.parse(
      toolScreenshot.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('')
    )
    const imageBlocks = toolScreenshot.content.filter((block) => block.type === 'image')
    const [toolImage, ref] = [payload.result.images[0], attachmentRefs[0]]
    const sameRef = (candidate) =>
      candidate !== undefined &&
      candidate.attachmentId === ref.attachmentId &&
      candidate.mediaType === ref.mediaType &&
      candidate.bytes === ref.bytes &&
      candidate.width === ref.width &&
      candidate.height === ref.height &&
      candidate.name === ref.name
    if (toolImage === undefined || ref === undefined || !sameRef(toolImage.image)) {
      throw new Error(
        `screenshot tool must persist the attachment reference verbatim: ${JSON.stringify({ toolImage, ref })}`
      )
    }
    if (toolImage.mediaType !== 'image/png') {
      throw new Error(
        `outer screenshot facts must stay the renderer's declaration: ${JSON.stringify(toolImage)}`
      )
    }
    if (
      imageBlocks.length !== payload.result.images.length ||
      imageBlocks.some((block) => !sameRef(block.attachment))
    ) {
      throw new Error(
        `model-visible image blocks must carry the same durable reference: ${JSON.stringify(imageBlocks)}`
      )
    }
  } finally {
    await screenshotToolContext.fiber.dispose()
  }

  const printed = await service.printUnitPdf({
    ...scoped,
    worktreeId,
    unitId: slideUnitId,
    output: printedPdf,
    outputWorkspace: workspace
  })
  if (
    printed.operation !== 'print-pdf' ||
    printed.result?.unitId !== slideUnitId ||
    printed.result?.unitType !== 'slide' ||
    printed.result?.pageCount !== 1 ||
    printed.result?.output !== printedPdf
  ) {
    throw new Error(`Slide PDF print failed: ${JSON.stringify(printed)}`)
  }
  const pdfBytes = await readFile(printedPdf)
  if (pdfBytes.byteLength === 0 || pdfBytes.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('Slide PDF print did not produce a real PDF file')
  }
  try {
    await service.printUnitPdf({
      ...scoped,
      worktreeId,
      unitId: baseUnitId,
      output: join(workspace, 'base.pdf'),
      outputWorkspace: workspace
    })
    throw new Error('Base PDF printing must be rejected')
  } catch (error) {
    if (error?.code !== 'UNIT_PRINT_PDF_TYPE_UNSUPPORTED') throw error
  }

  const executed = await service.executeUnitContent({
    ...scoped,
    worktreeId,
    unitId,
    code: 'workbook.getActiveSheet().getRange("A1").setValue("bundled"); return "ok";'
  })
  if (executed.result?.committed !== true || executed.result?.value !== 'ok') {
    throw new Error(`package-local execute failed: ${JSON.stringify(executed)}`)
  }
  const [leftExecution, rightExecution] = await Promise.all([
    service.executeUnitContent({
      ...scoped,
      worktreeId,
      unitId,
      code: 'workbook.getActiveSheet().getRange("A2").setValue("left"); return "left";'
    }),
    service.executeUnitContent({
      ...scoped,
      worktreeId,
      unitId,
      code: 'workbook.getActiveSheet().getRange("B2").setValue("right"); return "right";'
    })
  ])
  if (
    leftExecution.result?.committed !== true ||
    leftExecution.result?.value !== 'left' ||
    rightExecution.result?.committed !== true ||
    rightExecution.result?.value !== 'right'
  ) {
    throw new Error(
      `concurrent Collaboration SDK execution failed: ${JSON.stringify({ leftExecution, rightExecution })}`
    )
  }
  const boardExecution = await service.executeUnitContent({
    ...scoped,
    worktreeId,
    unitId: boardUnitId,
    code: 'const review = board.insertShape({ shapeType: api.Enum.ShapeTypeEnum.RoundRect, transform: { left: 80, top: 80, width: 180, height: 100 } }); const approve = board.insertShape({ shapeType: api.Enum.ShapeTypeEnum.RoundRect, transform: { left: 320, top: 80, width: 180, height: 100 } }); if (!review || !approve) throw new Error("Cannot insert Board shapes"); review.getText().setText("Review"); approve.getText().setText("Approve"); return [review.getId(), approve.getId()];'
  })
  const boardElementIds = boardExecution.result?.value
  if (
    boardExecution.result?.committed !== true ||
    !Array.isArray(boardElementIds) ||
    boardElementIds.length !== 2 ||
    boardElementIds.some((id) => typeof id !== 'string')
  ) {
    throw new Error(`Board execution failed: ${JSON.stringify(boardExecution)}`)
  }

  const imported = await service.importUnitContent({
    ...scoped,
    source,
    sourceWorkspace: workspace,
    worktreeId,
    name: 'Imported'
  })
  const importedUnitId = imported.result?.unitId
  if (typeof importedUnitId !== 'string' || imported.result?.kind !== 'sheet') {
    throw new Error(`import Unit failed: ${JSON.stringify(imported)}`)
  }

  const selected = await service.status({ ...scoped, worktreeId })
  if (selected.result?.selectedWorktree?.units?.length !== 6) {
    throw new Error(`worktree status did not return explicit Units: ${JSON.stringify(selected)}`)
  }
  const inspected = await service.inspectUnitContent({
    ...scoped,
    worktreeId,
    unitId,
    range: 'A1:B2'
  })
  const values = inspected.result?.ranges?.[0]?.displayValues
  if (
    values?.[0]?.[0] !== 'bundled' ||
    values?.[1]?.[0] !== 'left' ||
    values?.[1]?.[1] !== 'right'
  ) {
    throw new Error(`package-local inspect failed: ${JSON.stringify(inspected)}`)
  }
  const inspectedImport = await service.inspectUnitContent({
    ...scoped,
    worktreeId,
    unitId: importedUnitId,
    range: 'A1:B3'
  })
  if (inspectedImport.result?.ranges?.[0]?.displayValues?.[1]?.[0] !== 'alpha') {
    throw new Error(`import readback failed: ${JSON.stringify(inspectedImport)}`)
  }
  const inspectedBase = await service.inspectUnitContent({
    ...scoped,
    worktreeId,
    unitId: baseUnitId
  })
  if (
    inspectedBase.result?.kind !== 'base' ||
    inspectedBase.result?.tables?.[0]?.name !== 'Table 1' ||
    inspectedBase.result?.tables?.[0]?.fields?.[0]?.name !== 'Name'
  ) {
    throw new Error(`Base overview inspection failed: ${JSON.stringify(inspectedBase)}`)
  }
  const inspectedBoard = await service.inspectUnitContent({
    ...scoped,
    worktreeId,
    unitId: boardUnitId
  })
  if (
    inspectedBoard.result?.kind !== 'board' ||
    !inspectedBoard.result?.elements?.some(
      (element) => element.id === boardElementIds[0] && element.text === 'Review'
    ) ||
    !inspectedBoard.result?.elements?.some(
      (element) => element.id === boardElementIds[1] && element.text === 'Approve'
    )
  ) {
    throw new Error(`Board overview inspection failed: ${JSON.stringify(inspectedBoard)}`)
  }
  const inspectedBoardElements = await service.inspectUnitContent({
    ...scoped,
    worktreeId,
    unitId: boardUnitId,
    elementIds: boardElementIds
  })
  if (
    inspectedBoardElements.result?.kind !== 'board-element' ||
    inspectedBoardElements.result?.elements?.length !== 2 ||
    inspectedBoardElements.result?.elements?.some(
      (element, index) => element.id !== boardElementIds[index] || element.type !== 'shape'
    )
  ) {
    throw new Error(`Board element inspection failed: ${JSON.stringify(inspectedBoardElements)}`)
  }

  const found = await service.apiReference({
    action: 'find',
    queries: ['setValue'],
    unit: 'sheet',
    limit: 3
  })
  if (found.result?.[0]?.matches?.[0]?.label !== 'FRange.setValue')
    throw new Error(`API find failed: ${JSON.stringify(found)}`)
  const boardFound = await service.apiReference({
    action: 'find',
    queries: ['insertImage'],
    unit: 'board',
    limit: 3
  })
  if (boardFound.result?.[0]?.matches?.[0]?.label !== 'FBoard.insertImage') {
    throw new Error(`Board API find failed: ${JSON.stringify(boardFound)}`)
  }
  const baseFound = await service.apiReference({
    action: 'find',
    queries: ['getSchema'],
    unit: 'base',
    limit: 3
  })
  if (baseFound.result?.[0]?.matches?.[0]?.label !== 'FBase.getSchema') {
    throw new Error(`Base API find failed: ${JSON.stringify(baseFound)}`)
  }
  const reference = await service.apiReference({ action: 'show', queries: ['FRange.setValue'] })
  if (reference.result?.[0]?.status !== 'found')
    throw new Error(`API reference failed: ${JSON.stringify(reference)}`)

  const registries = await service.resources({ action: 'registries' })
  if (!Array.isArray(registries.result?.registries) || registries.result.registries.length === 0) {
    throw new Error(`resource registries failed: ${JSON.stringify(registries)}`)
  }
  const resources = await service.resources({ action: 'find', queries: ['plausible'], limit: 1 })
  const handle = resources.result?.resources?.[0]?.handle
  if (typeof handle !== 'string')
    throw new Error(`resource find failed: ${JSON.stringify(resources)}`)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('https://')) {
      return new Response(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>',
        {
          status: 200,
          headers: { 'content-type': 'image/svg+xml; charset=utf-8' }
        }
      )
    }
    return originalFetch(input, init)
  }
  try {
    const readResource = await service.resources({ action: 'read', handle })
    if (typeof readResource.result?.svg !== 'string' || !readResource.result.svg.includes('<svg')) {
      throw new Error(`resource read failed: ${JSON.stringify(readResource)}`)
    }
    const exportedResource = await service.resources({
      action: 'export',
      handles: [handle],
      output: resourceOutput,
      outputWorkspace: workspace
    })
    const resourcePath = exportedResource.result?.exported?.[0]?.path
    if (typeof resourcePath !== 'string' || (await stat(resourcePath)).size === 0) {
      throw new Error(`resource export failed: ${JSON.stringify(exportedResource)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }

  await service.exportUnitContent({
    ...scoped,
    worktreeId,
    unitId,
    output: exported,
    outputWorkspace: workspace
  })
  if ((await stat(exported)).size === 0)
    throw new Error('package-local export produced an empty file')

  await expectTransition(worktreeId, 'ready', 'ready')
  await expectTransition(worktreeId, 'reopen', 'draft')
  await expectTransition(worktreeId, 'ready', 'ready')
  await expectTransition(worktreeId, 'merge', 'merged')
  const merged = await service.status(scoped)
  if (merged.result?.trunk?.units?.length !== 6)
    throw new Error(`merge did not publish Units: ${JSON.stringify(merged)}`)

  const gatewayKey = Buffer.from(file).toString('base64url')
  const exchangeBase = `${origin}/uf/${gatewayKey}/universer-api`
  await verifyAllowAllAuthz(exchangeBase, boardUnitId)
  for (const [kind, historyUnitId] of [
    ['Sheet', unitId],
    ['Doc', docUnitId],
    ['Slide', slideUnitId],
    ['Base', baseUnitId],
    ['Board', boardUnitId]
  ]) {
    const history = await waitForHistory(exchangeBase, historyUnitId)
    const historyId = history.historyIds?.[0]
    const historyEntry =
      typeof historyId === 'string' ? history.entities?.datas?.[historyId] : undefined
    if (
      history.error?.code !== 1 ||
      typeof historyId !== 'string' ||
      historyEntry?.unitId !== historyUnitId
    ) {
      throw new Error(`trunk ${kind} History was not indexed: ${JSON.stringify(history)}`)
    }
    const changesets = await fetchHistoryChangesets(
      exchangeBase,
      historyUnitId,
      historyEntry.startRevision,
      historyEntry.endRevision
    )
    if (changesets.error?.code !== 1 || !Array.isArray(changesets.changesets)) {
      throw new Error(
        `trunk ${kind} History changesets were not readable: ${JSON.stringify(changesets)}`
      )
    }
  }
  const comparisonWorktree = await service.worktree({
    ...scoped,
    action: 'create',
    name: 'compare worktree'
  })
  const comparisonWorktreeId = comparisonWorktree.result?.worktreeId
  if (typeof comparisonWorktreeId !== 'string') {
    throw new Error(`comparison worktree failed: ${JSON.stringify(comparisonWorktree)}`)
  }
  const landscapeDocx = buildLandscapeDocx()
  const landscapeDocxSource = join(workspace, 'landscape-src.docx')
  await writeFile(landscapeDocxSource, landscapeDocx)
  const importedDocx = await service.importUnitContent({
    ...scoped,
    source: landscapeDocxSource,
    sourceWorkspace: workspace,
    worktreeId: comparisonWorktreeId,
    name: 'Imported Doc'
  })
  const importedDocxUnitId = importedDocx.result?.unitId
  if (typeof importedDocxUnitId !== 'string' || importedDocx.result?.kind !== 'doc') {
    throw new Error(`docx import failed: ${JSON.stringify(importedDocx)}`)
  }
  const docxLayout = await service.executeUnitContent({
    ...scoped,
    worktreeId: comparisonWorktreeId,
    unitId: importedDocxUnitId,
    code: 'return { flavor: doc.getDocumentFlavor(), traditional: doc.isTraditional(), sections: doc.getSections().length };'
  })
  const docxLayoutState = docxLayout.result?.value
  if (
    docxLayoutState?.flavor !== 1 ||
    docxLayoutState?.traditional !== true ||
    docxLayoutState?.sections !== 1
  ) {
    throw new Error(`docx import lost the source page layout: ${JSON.stringify(docxLayout)}`)
  }
  const docxRoundtripPath = join(workspace, 'landscape-roundtrip.docx')
  await service.exportUnitContent({
    ...scoped,
    worktreeId: comparisonWorktreeId,
    unitId: importedDocxUnitId,
    output: docxRoundtripPath,
    outputWorkspace: workspace
  })
  if ((await stat(docxRoundtripPath)).size === 0) {
    throw new Error('docx export produced an empty file')
  }
  const importedRoundtrip = await service.importUnitContent({
    ...scoped,
    source: docxRoundtripPath,
    sourceWorkspace: workspace,
    worktreeId: comparisonWorktreeId,
    name: 'Imported Roundtrip'
  })
  const roundtripUnitId = importedRoundtrip.result?.unitId
  if (typeof roundtripUnitId !== 'string' || importedRoundtrip.result?.kind !== 'doc') {
    throw new Error(`docx roundtrip import failed: ${JSON.stringify(importedRoundtrip)}`)
  }
  const roundtripLayout = await service.executeUnitContent({
    ...scoped,
    worktreeId: comparisonWorktreeId,
    unitId: roundtripUnitId,
    code: 'const section = doc.getSections()[0]; const page = section ? section.getEffectivePageSetup() : undefined; return { flavor: doc.getDocumentFlavor(), traditional: doc.isTraditional(), sections: doc.getSections().length, page: page === undefined ? null : page };'
  })
  const roundtripState = roundtripLayout.result?.value
  if (
    roundtripState?.flavor !== 1 ||
    roundtripState?.traditional !== true ||
    roundtripState?.sections !== 1 ||
    !within(roundtripState?.page?.pageSize?.width, 1122.6) ||
    !within(roundtripState?.page?.pageSize?.height, 793.8) ||
    !within(roundtripState?.page?.margins?.top, 120) ||
    !within(roundtripState?.page?.margins?.left, 96) ||
    roundtripState?.page?.pageOrient !== 1
  ) {
    throw new Error(
      `docx export roundtrip lost the page layout: ${JSON.stringify(roundtripLayout)}`
    )
  }
  const importedModernDocx = await service.importUnitContent({
    ...scoped,
    source: landscapeDocxSource,
    sourceWorkspace: workspace,
    worktreeId: comparisonWorktreeId,
    name: 'Imported Modern Doc',
    docType: 'modern'
  })
  const importedModernDocxUnitId = importedModernDocx.result?.unitId
  if (typeof importedModernDocxUnitId !== 'string' || importedModernDocx.result?.kind !== 'doc') {
    throw new Error(`modern docx import failed: ${JSON.stringify(importedModernDocx)}`)
  }
  const modernDocxLayout = await service.executeUnitContent({
    ...scoped,
    worktreeId: comparisonWorktreeId,
    unitId: importedModernDocxUnitId,
    code: 'return { flavor: doc.getDocumentFlavor(), traditional: doc.isTraditional() };'
  })
  const modernDocxLayoutState = modernDocxLayout.result?.value
  if (modernDocxLayoutState?.flavor !== 2 || modernDocxLayoutState?.traditional !== false) {
    throw new Error(
      `modern docx import did not produce a Modern document: ${JSON.stringify(modernDocxLayout)}`
    )
  }
  let misflaggedDocTypeRejected = false
  try {
    await service.importUnitContent({
      ...scoped,
      source,
      sourceWorkspace: workspace,
      worktreeId: comparisonWorktreeId,
      name: 'Misflagged Doc',
      docType: 'modern'
    })
  } catch (error) {
    misflaggedDocTypeRejected = error instanceof Error && error.code === 'INVALID_REQUEST'
  }
  if (!misflaggedDocTypeRejected) {
    throw new Error('docType on a non-docx import must be rejected with INVALID_REQUEST')
  }
  const comparisonEdit = await service.executeUnitContent({
    ...scoped,
    worktreeId: comparisonWorktreeId,
    unitId,
    code: 'workbook.getActiveSheet().getRange("C3").setValue("worktree diff"); return "compared";'
  })
  if (comparisonEdit.result?.committed !== true || comparisonEdit.result?.value !== 'compared') {
    throw new Error(`comparison edit failed: ${JSON.stringify(comparisonEdit)}`)
  }
  await assertMaterializedPreview(origin, gatewayKey, comparisonWorktreeId, unitId, {
    label: 'Sheet merge preview',
    blocks: 'required',
    text: 'worktree diff'
  })
  const baseEdit = await service.executeUnitContent({
    ...scoped,
    worktreeId: comparisonWorktreeId,
    unitId: baseUnitId,
    code: 'const table = base.getTableById("table-1"); if (!table) throw new Error("missing table"); const records = table.addRecords([{ values: { [table.getPrimaryFieldId()]: "preview record" } }]); return records.length;'
  })
  if (baseEdit.result?.committed !== true || baseEdit.result?.value !== 1) {
    throw new Error(`base preview edit failed: ${JSON.stringify(baseEdit)}`)
  }
  await assertMaterializedPreview(origin, gatewayKey, comparisonWorktreeId, baseUnitId, {
    label: 'Base merge preview',
    blocks: 'required',
    text: 'preview record'
  })
  await assertMaterializedPreview(origin, gatewayKey, comparisonWorktreeId, docUnitId, {
    label: 'Doc merge preview',
    blocks: 'absent'
  })
  const pinnedComparison = await verifyWorktreeComparison(
    origin,
    gatewayKey,
    comparisonWorktreeId,
    unitId
  )
  const laterComparisonEdit = await service.executeUnitContent({
    ...scoped,
    worktreeId: comparisonWorktreeId,
    unitId,
    code: 'workbook.getActiveSheet().getRange("D4").setValue("after pin"); return "advanced";'
  })
  if (
    laterComparisonEdit.result?.committed !== true ||
    laterComparisonEdit.result?.value !== 'advanced'
  ) {
    throw new Error(`post-pin comparison edit failed: ${JSON.stringify(laterComparisonEdit)}`)
  }
  await verifyPinnedComparisonStale(
    origin,
    gatewayKey,
    comparisonWorktreeId,
    unitId,
    pinnedComparison
  )
  await verifyViewerHistoryMenus(
    origin,
    gatewayKey,
    [
      ['Sheet', unitId, 'Edit History', null],
      ['Doc', docUnitId, 'Version history', 'docs-history-ui.operation.open'],
      ['Slide', slideUnitId, 'Version history', 'slides-history-ui.operation.open'],
      ['Base', baseUnitId, 'Version history', 'bases-history-ui.operation.open'],
      ['Board', boardUnitId, null, 'boards-history-ui.operation.open']
    ],
    { worktreeId: comparisonWorktreeId, unitId }
  )
  const exchangeCsv = Buffer.from('name,value\nserver,7\n', 'utf8')
  const exchangeForm = new FormData()
  exchangeForm.append('file', new Blob([exchangeCsv], { type: 'text/csv' }), '服务端.csv')
  const uploadedExchange = await fetch(
    `${exchangeBase}/stream/file/upload?size=${exchangeCsv.byteLength}&source=1&flate=false`,
    { method: 'POST', body: exchangeForm }
  )
  if (uploadedExchange.status !== 201)
    throw new Error(`exchange upload failed: ${await uploadedExchange.text()}`)
  const uploadedExchangeBody = await uploadedExchange.json()
  const importTask = await postJson(`${exchangeBase}/exchange/2/import`, {
    fileID: uploadedExchangeBody.FileId,
    outputType: 1,
    options: {}
  })
  const importedExchange = await waitForExchangeTask(exchangeBase, importTask.taskID)
  const exchangedUnitId = importedExchange.import?.unitID
  if (typeof exchangedUnitId !== 'string' || importedExchange.status !== 'done') {
    throw new Error(`server exchange import failed: ${JSON.stringify(importedExchange)}`)
  }
  const exportTask = await postJson(`${exchangeBase}/exchange/2/export`, {
    unitID: exchangedUnitId,
    format: 'xlsx',
    options: {}
  })
  const exportedExchange = await waitForExchangeTask(exchangeBase, exportTask.taskID)
  const exchangedFileId = exportedExchange.export?.fileID
  if (typeof exchangedFileId !== 'string') {
    throw new Error(`server exchange export failed: ${JSON.stringify(exportedExchange)}`)
  }
  const signedExchange = await (
    await fetch(`${exchangeBase}/file/${exchangedFileId}/sign-url`)
  ).json()
  const exchangedDownload = await fetch(`${origin}${signedExchange.url}`)
  if (!exchangedDownload.ok || (await exchangedDownload.arrayBuffer()).byteLength === 0) {
    throw new Error('server exchange download failed')
  }

  const docxForm = new FormData()
  docxForm.append(
    'file',
    new Blob([landscapeDocx], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }),
    'landscape-src.docx'
  )
  const uploadedDocx = await fetch(
    `${exchangeBase}/stream/file/upload?size=${landscapeDocx.byteLength}&source=1&flate=false`,
    { method: 'POST', body: docxForm }
  )
  if (uploadedDocx.status !== 201)
    throw new Error(`docx exchange upload failed: ${await uploadedDocx.text()}`)
  const uploadedDocxBody = await uploadedDocx.json()
  const docxImportTask = await postJson(`${exchangeBase}/exchange/1/import`, {
    fileID: uploadedDocxBody.FileId,
    outputType: 2,
    options: {}
  })
  const docxImported = await waitForExchangeTask(exchangeBase, docxImportTask.taskID)
  const docxJsonId = docxImported.import?.jsonID
  if (typeof docxJsonId !== 'string' || docxImported.status !== 'done') {
    throw new Error(`docx exchange import failed: ${JSON.stringify(docxImported)}`)
  }
  const docxJsonSigned = await (await fetch(`${exchangeBase}/file/${docxJsonId}/sign-url`)).json()
  const docxJsonDownload = await fetch(`${origin}${docxJsonSigned.url}`)
  if (!docxJsonDownload.ok) throw new Error('docx exchange snapshot download failed')
  const docxJson = await docxJsonDownload.json()
  const docxSnapshot = docxJson.snapshot?.doc
  const docPayload = JSON.parse(
    Buffer.from(String(docxSnapshot?.originalMeta ?? ''), 'base64').toString('utf8')
  )
  const docxSection = docPayload.body?.sectionBreaks?.[0]
  if (
    docPayload.documentStyle?.documentFlavor !== 1 ||
    !within(docxSection?.pageSize?.width, 1122.6) ||
    !within(docxSection?.pageSize?.height, 793.8) ||
    !within(docxSection?.marginTop, 120) ||
    !within(docxSection?.marginLeft, 96)
  ) {
    throw new Error(
      `docx exchange import lost the source page setup: ${JSON.stringify({
        flavor: docPayload.documentStyle?.documentFlavor,
        section: docxSection
      })}`
    )
  }

  const discarded = await service.worktreeAction({
    ...scoped,
    action: 'discard',
    worktreeId: comparisonWorktreeId
  })
  if (
    !discarded.ok ||
    discarded.state.worktrees.find((entry) => entry.worktreeId === comparisonWorktreeId)?.status !==
      'discarded'
  ) {
    throw new Error(`discard transition failed: ${JSON.stringify(discarded)}`)
  }

  console.log(
    'integration smoke OK (new/status/Unit/import/API/execute/5-Unit History/worktree diff/Sheet/Base/Board inspect/export/lint/compile-svg/screenshot/print-pdf/resources/Worktree lifecycle, no global CLI)'
  )
} finally {
  await service.dispose()
  const releasedPort = createNetServer()
  await new Promise((resolve, reject) => {
    releasedPort.once('error', reject)
    releasedPort.listen(availablePort, '127.0.0.1', resolve)
  })
  await closeServer(releasedPort)
  await new Promise((resolve, reject) =>
    foreign.close((error) => (error === undefined ? resolve() : reject(error)))
  )
  await rm(scratch, { recursive: true, force: true })
}

async function occupyPortWithFreeSuccessor() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const foreign = createHttpServer((_request, response) => response.end('not a Univer Gateway'))
    await new Promise((resolve, reject) => {
      foreign.once('error', reject)
      foreign.listen(0, '127.0.0.1', resolve)
    })
    const address = foreign.address()
    if (address === null || typeof address === 'string')
      throw new Error('foreign server did not receive a TCP port')
    if (address.port === 65_535) {
      await closeServer(foreign)
      continue
    }

    const successor = createNetServer()
    try {
      await new Promise((resolve, reject) => {
        successor.once('error', reject)
        successor.listen(address.port + 1, '127.0.0.1', resolve)
      })
      await closeServer(successor)
      return { foreign, occupiedPort: address.port, availablePort: address.port + 1 }
    } catch {
      // Another process owns the immediate successor; retry with a fresh dynamic pair.
      await closeServer(foreign)
    }
  }
  throw new Error('failed to reserve adjacent dynamic Gateway ports')
}

async function closeServer(server) {
  if (!server.listening) return
  await new Promise((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error)))
  )
}

/** A4 landscape one-paragraph docx with the page setup the import must preserve. */
function buildLandscapeDocx() {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t>landscape probe</w:t></w:r></w:p>
<w:sectPr>
<w:pgSz w:w="16839" w:h="11907" w:orient="landscape"/>
<w:pgMar w:top="1800" w:right="1440" w:bottom="1800" w:left="1440" w:header="851" w:footer="992" w:gutter="0"/>
</w:sectPr>
</w:body>
</w:document>`
  return storeZip([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rels],
    ['word/document.xml', document]
  ])
}

/** Stored-entry ZIP writer (method 0); OOXML readers accept uncompressed parts. */
function storeZip(entries) {
  const chunks = []
  const central = []
  let offset = 0
  for (const [name, content] of entries) {
    const nameBytes = Buffer.from(name, 'utf8')
    const data = Buffer.from(content, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    chunks.push(local, nameBytes, data)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt32LE(crc, 16)
    entry.writeUInt32LE(data.length, 20)
    entry.writeUInt32LE(data.length, 24)
    entry.writeUInt16LE(nameBytes.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, nameBytes)
    offset += local.length + nameBytes.length + data.length
  }
  const centralStart = offset
  const centralBytes = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBytes.length, 12)
  end.writeUInt32LE(centralStart, 16)
  return Buffer.concat([Buffer.concat(chunks), centralBytes, end])
}

function crc32(bytes) {
  let table = crc32.table
  if (table === undefined) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  let crc = -1
  for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff]
  return (crc ^ -1) >>> 0
}

/** Twip-derived geometry survives as floating-point pixels; compare with slack. */
function within(value, expected) {
  return typeof value === 'number' && Math.abs(value - expected) < 0.05
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) throw new Error(`POST ${url} failed: ${await response.text()}`)
  return response.json()
}

async function waitForExchangeTask(exchangeBase, taskId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${exchangeBase}/exchange/task/${encodeURIComponent(taskId)}`)
    if (!response.ok) throw new Error(`exchange task polling failed: ${await response.text()}`)
    const task = await response.json()
    if (task.status !== 'pending') return task
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`exchange task ${taskId} did not settle`)
}

async function waitForHistory(exchangeBase, unitId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(
      `${exchangeBase}/history/${encodeURIComponent(unitId)}/list?length=20`
    )
    if (!response.ok) throw new Error(`History request failed: ${await response.text()}`)
    const history = await response.json()
    if (Array.isArray(history.historyIds) && history.historyIds.length > 0) return history
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`History for ${unitId} was not indexed`)
}

async function fetchHistoryChangesets(exchangeBase, unitId, startRevision, endRevision) {
  const response = await fetch(
    `${exchangeBase}/history/${encodeURIComponent(unitId)}/cs?startRevision=${startRevision}&endRevision=${endRevision}`
  )
  if (!response.ok) throw new Error(`History changeset request failed: ${await response.text()}`)
  return response.json()
}

async function assertMaterializedPreview(origin, gatewayKey, worktreeId, unitId, expectation) {
  const response = await fetch(
    `${origin}/uf/${gatewayKey}/worktrees/${encodeURIComponent(worktreeId)}/preview/units/${encodeURIComponent(unitId)}`
  )
  const preview = await response.json()
  const referenced = referencedSheetBlockIds(preview.snapshot)
  const returned = new Set(
    Array.isArray(preview.sheetBlocks) ? preview.sheetBlocks.map((block) => block?.id) : []
  )
  const missing = referenced.filter((id) => !returned.has(id))
  const blocks = preview.sheetBlocks
  if (
    preview.error?.code !== 1 ||
    preview.snapshot?.unitID !== unitId ||
    'changesets' in preview ||
    missing.length > 0 ||
    (expectation.blocks === 'required' && (!Array.isArray(blocks) || blocks.length === 0)) ||
    (expectation.blocks === 'absent' && blocks !== undefined) ||
    (expectation.text !== undefined && !JSON.stringify(blocks).includes(expectation.text))
  ) {
    throw new Error(
      `${expectation.label} did not return the materialized head: ${JSON.stringify(preview)}`
    )
  }
}

function referencedSheetBlockIds(snapshot) {
  const blockMeta = snapshot?.workbook?.blockMeta
  if (blockMeta === null || typeof blockMeta !== 'object') return []
  return Object.values(blockMeta).flatMap((meta) =>
    Array.isArray(meta?.blocks) ? meta.blocks : []
  )
}

async function verifyWorktreeComparison(viewerOrigin, gatewayKey, worktreeId, unitId) {
  const comparisonBase = `${viewerOrigin}/uf/${gatewayKey}/worktrees/${encodeURIComponent(worktreeId)}/comparisons`
  const session = await postJson(comparisonBase, { left: { kind: 'trunk' } })
  const unit = session.units?.find((candidate) => candidate.unitId === unitId)
  if (
    session.error?.code !== 1 ||
    typeof session.comparisonId !== 'string' ||
    session.left?.kind !== 'trunk' ||
    session.right?.worktreeId !== worktreeId ||
    unit?.presence !== 'paired'
  ) {
    throw new Error(`worktree comparison session failed: ${JSON.stringify(session)}`)
  }
  const unitEndpoint = `${comparisonBase}/${encodeURIComponent(session.comparisonId)}/units/${encodeURIComponent(unitId)}`
  const response = await fetch(unitEndpoint)
  const comparison = await response.json()
  if (
    !response.ok ||
    comparison.error?.code !== 1 ||
    comparison.fidelity !== 'history' ||
    comparison.left?.present !== true ||
    comparison.right?.present !== true ||
    typeof comparison.right?.revision !== 'number' ||
    comparison.stale !== false
  ) {
    throw new Error(`pinned Unit comparison failed: ${JSON.stringify(comparison)}`)
  }
  const contextResponse = await fetch(
    `${unitEndpoint}/diff?entityType=cell&detail=changes&limit=10`
  )
  const contextBody = await contextResponse.json()
  const context = contextBody.context
  if (
    !contextResponse.ok ||
    contextBody.error?.code !== 1 ||
    context?.schemaVersion !== 1 ||
    context?.comparisonId !== session.comparisonId ||
    context?.fidelity !== 'history' ||
    context?.detail !== 'changes' ||
    context?.diagnostics?.readiness !== 'ready' ||
    typeof context?.summary?.total !== 'number' ||
    context.summary.total < 1 ||
    !context.items?.some((item) => item.entityType === 'cell')
  ) {
    throw new Error(`semantic worktree diff failed: ${JSON.stringify(contextBody)}`)
  }
  return { comparisonId: session.comparisonId, rightRevision: comparison.right.revision }
}

async function verifyPinnedComparisonStale(viewerOrigin, gatewayKey, worktreeId, unitId, pinned) {
  const response = await fetch(
    `${viewerOrigin}/uf/${gatewayKey}/worktrees/${encodeURIComponent(worktreeId)}/comparisons/${encodeURIComponent(pinned.comparisonId)}/units/${encodeURIComponent(unitId)}`
  )
  const comparison = await response.json()
  if (
    !response.ok ||
    comparison.error?.code !== 1 ||
    comparison.stale !== true ||
    comparison.right?.revision !== pinned.rightRevision
  ) {
    throw new Error(`pinned comparison did not become stale: ${JSON.stringify(comparison)}`)
  }
}

async function verifyViewerHistoryMenus(viewerOrigin, gatewayKey, units, comparisonTarget) {
  const browserResolution = await resolveUniverRenderBrowser()
  if (browserResolution.status !== 'found') {
    throw new Error(`Viewer History browser was not found: ${JSON.stringify(browserResolution)}`)
  }
  const browser = await launch({
    executablePath: browserResolution.executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  })
  try {
    for (const [kind, unitId, label, openOperation] of units) {
      const page = await browser.newPage()
      const browserMessages = []
      page.on('console', (message) => browserMessages.push(`${message.type()}: ${message.text()}`))
      page.on('pageerror', (error) => browserMessages.push(`pageerror: ${String(error)}`))
      try {
        page.setDefaultTimeout(20_000)
        await page.goto(
          `${viewerOrigin}/?file=${encodeURIComponent(gatewayKey)}&mode=embedded&scope=trunk&unit=${encodeURIComponent(unitId)}&editable=false&lang=en-US`,
          { waitUntil: 'domcontentloaded' }
        )
        if (openOperation === null) {
          if (label === null) {
            await page.waitForFunction(() =>
              [...document.querySelectorAll('div')].some(
                (element) => element.style.zIndex === '49' && element.style.display === 'block'
              )
            )
          } else {
            await page.waitForFunction(
              (expectedLabel) => document.documentElement.innerHTML.includes(expectedLabel),
              {},
              label
            )
          }
        } else {
          await page.waitForFunction(() => window.univerAPI !== undefined)
          const opened = await page.evaluate(
            (operation) => window.univerAPI?.executeCommand(operation),
            openOperation
          )
          if (opened !== true) throw new Error(`${openOperation} was not accepted`)
          if (label === null) {
            await page.waitForFunction(() =>
              [...document.querySelectorAll('div')].some(
                (element) => element.style.zIndex === '49' && element.style.display === 'block'
              )
            )
          } else {
            await page.waitForFunction(
              (expectedLabel) => document.documentElement.innerHTML.includes(expectedLabel),
              {},
              label
            )
          }
        }
      } catch (error) {
        const overlays = await page.evaluate(() =>
          [...document.querySelectorAll('div')]
            .filter((element) => element.style.zIndex !== '' || element.style.display !== '')
            .map((element) => ({ display: element.style.display, zIndex: element.style.zIndex }))
        )
        throw new Error(
          `${kind} Viewer did not expose History UI: ${String(error)}; messages=${JSON.stringify(browserMessages)}; overlays=${JSON.stringify(overlays)}`,
          { cause: error }
        )
      } finally {
        await page.close()
      }
    }
    await verifyViewerWorktreeComparison(browser, viewerOrigin, gatewayKey, comparisonTarget)
  } finally {
    await browser.close()
  }
}

async function verifyViewerWorktreeComparison(browser, viewerOrigin, gatewayKey, target) {
  const page = await browser.newPage()
  const browserMessages = []
  page.on('console', (message) => browserMessages.push(`${message.type()}: ${message.text()}`))
  page.on('pageerror', (error) => browserMessages.push(`pageerror: ${String(error)}`))
  page.on('response', (response) => {
    if (response.status() >= 400) {
      browserMessages.push(`response: ${response.status()} ${response.url()}`)
    }
  })
  try {
    page.setDefaultTimeout(20_000)
    await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 })
    await page.goto(
      `${viewerOrigin}/?file=${encodeURIComponent(gatewayKey)}&worktree=${encodeURIComponent(target.worktreeId)}&unit=${encodeURIComponent(target.unitId)}&sidebar=collapsed&lang=en-US`,
      { waitUntil: 'domcontentloaded' }
    )
    const compareToggle = '[data-testid="view-diff-center"] [aria-label="Compare"]'
    await page.waitForSelector(compareToggle)
    await page.waitForFunction(
      () =>
        window.univerAPI !== undefined &&
        [...document.querySelectorAll('.overlay')].every(
          (element) => getComputedStyle(element).display === 'none'
        )
    )
    for (const width of [1440, 1130, 960, 800, 680, 560, 480]) {
      await page.setViewport({ width, height: 720, deviceScaleFactor: 1 })
      const layout = await measureWorktreeTopbar(page, width)
      if (
        layout.overflow ||
        layout.overlap ||
        layout.previewAboveView ||
        layout.switcherWidth > 220
      ) {
        throw new Error(
          `${width}px worktree topbar lost its unified flow: ${JSON.stringify(layout)}`
        )
      }
      if (width === 1440 && (layout.height > 64 || Math.abs(layout.centerOffset) > 1)) {
        throw new Error(`wide worktree topbar was not centered: ${JSON.stringify(layout)}`)
      }
    }
    await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 })
    await page.click(compareToggle)
    await page.waitForSelector('[data-unit-comparison-viewer="true"]')
    await page.waitForSelector('[data-testid="comparison-source-title"]')
  } catch (error) {
    const state = await page.evaluate(() => ({
      bodyText: document.body.innerText.slice(0, 2_000),
      comparePressed: document
        .querySelector('[data-testid="view-diff-center"] [aria-label="Compare"]')
        ?.getAttribute('data-pressed'),
      sourceVisible: document.querySelector('[data-testid="comparison-source-title"]') !== null
    }))
    throw new Error(
      `Viewer did not expose worktree Compare: ${String(error)}; messages=${JSON.stringify(browserMessages)}; state=${JSON.stringify(state)}`,
      { cause: error }
    )
  } finally {
    await page.close()
  }
}

async function measureWorktreeTopbar(page, width) {
  return page.evaluate(async (width) => {
    const measure = () => {
      const topbar = document.querySelector('.topbar')
      const title = document.querySelector('[data-testid="worktree-title"]')
      const switcher = document.querySelector('[data-testid="view-diff-center"]')
      const actions = document.querySelector('[data-testid="worktree-actions"]')
      if (topbar === null || title === null || switcher === null || actions === null) {
        throw new Error('worktree topbar controls are missing')
      }
      const topbarRect = topbar.getBoundingClientRect()
      const titleRect = title.getBoundingClientRect()
      const switcherRect = switcher.getBoundingClientRect()
      const actionsRect = actions.getBoundingClientRect()
      const outside = (rect) => rect.left < topbarRect.left - 1 || rect.right > topbarRect.right + 1
      const controls = [...topbar.querySelectorAll('button')].map((element) =>
        element.getBoundingClientRect()
      )
      const preview = topbar.querySelector('[data-header-preview]')?.getBoundingClientRect()
      return {
        centerOffset:
          switcherRect.left + switcherRect.width / 2 - topbarRect.left - topbarRect.width / 2,
        previewAboveView:
          preview !== undefined &&
          preview.top + preview.height / 2 < switcherRect.top + switcherRect.height / 2 - 1,
        overlap: controls.some((a, i) =>
          controls
            .slice(i + 1)
            .some(
              (b) =>
                Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
            )
        ),
        actionsHeight: actionsRect.height,
        actionsTop: actionsRect.top,
        height: topbarRect.height,
        overflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth ||
          [titleRect, switcherRect, actionsRect, ...controls].some(outside),
        switcherHeight: switcherRect.height,
        switcherTop: switcherRect.top,
        switcherWidth: switcherRect.width,
        titleTop: titleRect.top,
        width: topbarRect.width
      }
    }
    let stableFrames = 0
    let layout
    // ResizeObserver and React may commit the new header mode after the viewport changes.
    for (let frame = 0; frame < 120; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      layout = measure()
      const fits =
        !layout.overflow &&
        !layout.overlap &&
        !layout.previewAboveView &&
        layout.switcherWidth <= 220 &&
        (width !== 1440 || (layout.height <= 64 && Math.abs(layout.centerOffset) <= 1))
      stableFrames = fits ? stableFrames + 1 : 0
      if (stableFrames >= 3) return layout
    }
    return layout
  }, width)
}

async function verifyAllowAllAuthz(exchangeBase, unitId) {
  const actions = [44, 43]
  const direct = await postJson(
    `${exchangeBase}/authz/7/object/${encodeURIComponent(unitId)}/allowed`,
    {
      unitID: unitId,
      objectID: unitId,
      objectType: 7,
      actions
    }
  )
  if (
    JSON.stringify(direct.actions) !==
    JSON.stringify(actions.map((action) => ({ action, allowed: true })))
  ) {
    throw new Error(`direct authz did not allow Board History actions: ${JSON.stringify(direct)}`)
  }
  const batch = await postJson(`${exchangeBase}/authz/-/object/-/batch_allowed`, {
    requests: [{ unitID: unitId, objectID: unitId, objectType: 7, actions }]
  })
  const expected = [
    {
      unitID: unitId,
      objectID: unitId,
      actions: actions.map((action) => ({ action, allowed: true }))
    }
  ]
  if (JSON.stringify(batch.objectActions) !== JSON.stringify(expected)) {
    throw new Error(`batch authz did not allow Board History actions: ${JSON.stringify(batch)}`)
  }
}

async function expectTransition(worktreeId, action, expectedStatus) {
  const result = await service.worktree({ ...scoped, action, worktreeId })
  const status = await service.status({ ...scoped, worktreeId })
  if (!result.ok || status.result?.selectedWorktree?.status !== expectedStatus) {
    throw new Error(`${action} transition failed: ${JSON.stringify({ result, status })}`)
  }
}
