// Client-half smoke (dock float + merge panel): jsdom + real React + mock ctx
// + a fake /univer-api HTTP server. Covers: target discovery from the
// conversation snapshot → polling → draft floating window (live iframe deep
// link) → click-to-maximize / fold / drag / dismiss → ready + session end
// closes the window and embeds the merge panel → merged panel shows trunk.
//
//   node test/client-smoke.mjs
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = process.env.UNIVER_PLUGIN_ROOT
if (packageRoot !== undefined && !isAbsolute(packageRoot))
  throw new Error('UNIVER_PLUGIN_ROOT must be absolute')
const root = packageRoot ?? dirname(here)
// jsdom/react/react-dom come from this repo's devDependencies.
const repoRequire = createRequire(import.meta.url)
const { JSDOM } = repoRequire('jsdom')

// ---- fake loopback API (node half's /univer-api) ----
const DEMO_FILE = join(tmpdir(), 'dsh-univer-client-smoke', 'demo.univer')
const SECOND_FILE = join(tmpdir(), 'dsh-univer-client-smoke', 'second.univer')
const WORKTREE = 'wt-msvqmweb-47hcdg'
const OPEN_URL = 'http://127.0.0.1:9123/?file=KEY&worktree=wt-msvqmweb-47hcdg'
const VIEW_URL =
  'http://127.0.0.1:9123/?file=KEY&worktree=wt-msvqmweb-47hcdg&mode=embedded&scope=worktree'
const MERGE_URL =
  'http://127.0.0.1:9123/?file=KEY&worktree=wt-msvqmweb-47hcdg&mode=embedded&scope=mergePreview'
const TRUNK_URL = 'http://127.0.0.1:9123/?file=KEY'
const withLang = (url, lang) => {
  const target = new URL(url)
  target.searchParams.set('lang', lang)
  return target.toString()
}
const asReviewPage = (url) => {
  const target = new URL(url)
  target.searchParams.delete('mode')
  target.searchParams.set('sidebar', 'collapsed')
  return target.toString()
}
const UNITS = [
  {
    unitId: 'u-msvo3wpe-p4pqi4',
    name: '销售',
    type: 2,
    kind: 'modified',
    worktreeUrl: VIEW_URL + '&unit=u-msvo3wpe-p4pqi4',
    mergeUrl: MERGE_URL + '&unit=u-msvo3wpe-p4pqi4'
  },
  {
    unitId: 'u-msvy1lry-dv3hia',
    name: '班级成绩汇报',
    type: 3,
    kind: 'added',
    worktreeUrl: VIEW_URL + '&unit=u-msvy1lry-dv3hia',
    mergeUrl: MERGE_URL + '&unit=u-msvy1lry-dv3hia'
  },
  {
    unitId: 'u-gone-000001',
    name: '',
    type: 2,
    kind: 'deleted',
    worktreeUrl: VIEW_URL + '&unit=u-gone-000001',
    mergeUrl: MERGE_URL + '&unit=u-gone-000001'
  }
]
const DEFAULT_UNIT_URL = VIEW_URL + '&unit=' + encodeURIComponent(UNITS[0].unitId)
const SLIDE_UNIT_URL = VIEW_URL + '&unit=' + encodeURIComponent(UNITS[1].unitId)
const DEFAULT_MERGE_URL = MERGE_URL + '&unit=' + encodeURIComponent(UNITS[0].unitId)
const ZH_DEFAULT_UNIT_URL = withLang(DEFAULT_UNIT_URL, 'zh-CN')
const ZH_SLIDE_UNIT_URL = withLang(SLIDE_UNIT_URL, 'zh-CN')
const EN_SLIDE_UNIT_URL = withLang(SLIDE_UNIT_URL, 'en-US')
const ZH_FULL_DEFAULT_UNIT_URL = withLang(asReviewPage(DEFAULT_UNIT_URL), 'zh-CN')
const EN_FULL_DEFAULT_UNIT_URL = withLang(asReviewPage(DEFAULT_UNIT_URL), 'en-US')
const ZH_FULL_DEFAULT_MERGE_URL = withLang(asReviewPage(DEFAULT_MERGE_URL), 'zh-CN')
const ZH_TRUNK_URL = withLang(asReviewPage(TRUNK_URL), 'zh-CN')
const ZH_LIVE_TRUNK_URL = withLang(TRUNK_URL, 'zh-CN')
let worktrees = []
const missingFiles = new Set()
const wt = (status, worktreeId = WORKTREE) => ({
  worktreeId,
  name: worktreeId === WORKTREE ? 'v3smoke' : 'other',
  status,
  units: status === 'draft' || status === 'ready' ? UNITS : [],
  ...(status === 'draft' || status === 'ready' ? { openUrl: OPEN_URL, worktreeUrl: VIEW_URL } : {}),
  ...(status === 'ready' ? { mergeUrl: MERGE_URL } : {})
})
const currentState = () => ({
  ok: true,
  file: DEMO_FILE,
  gateway: 'http://127.0.0.1:9123',
  gatewayRunning: true,
  viewerUrl: TRUNK_URL,
  worktrees
})
const stateRequests = []
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (req.method === 'GET' && url.pathname === '/univer-api/status') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        gateway: {
          phase: gatewayPhase,
          gateway: gatewayPhase === 'running' ? 'http://127.0.0.1:9123' : null,
          owned: false
        },
        unitContent: 'bundled'
      })
    )
    return
  }
  if (req.method === 'GET' && url.pathname === '/univer-api/state') {
    const file = url.searchParams.get('file')
    if (url.searchParams.get('sessionId') !== 'test-session-id') {
      res.writeHead(400).end()
      return
    }
    stateRequests.push(file)
    if (gatewayPhase !== 'running') {
      res.writeHead(503, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, code: 'GATEWAY_UNAVAILABLE', message: 'no gateway' }))
      return
    }
    if (file !== null && missingFiles.has(file)) {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({ ok: false, code: 'INVALID_FILE_PATH', message: 'path does not exist' })
      )
      return
    }
    if (file !== DEMO_FILE && file !== REL_DEMO_FILE && file !== SECOND_FILE) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(currentState()))
    return
  }
  if (req.method === 'POST' && url.pathname === '/univer-api/worktree-action') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (body.sessionId !== 'test-session-id') {
      res.writeHead(400).end()
      return
    }
    const next =
      body.action === 'merge'
        ? 'merged'
        : body.action === 'discard'
          ? 'discarded'
          : body.action === 'reopen'
            ? 'draft'
            : body.action === 'ready'
              ? 'ready'
              : null
    worktrees = worktrees.map((item) =>
      item.worktreeId === body.worktreeId && next !== null ? wt(next) : item
    )
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        action: body.action,
        worktreeId: body.worktreeId,
        state: currentState()
      })
    )
    return
  }
  res.writeHead(404).end()
})
await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise))
const origin = `http://127.0.0.1:${server.address().port}`

// ---- jsdom + module loading ----
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: origin + '/'
})
// jsdom does not implement PointerEvent; the dock drag simulation needs it.
if (dom.window.PointerEvent === undefined) {
  dom.window.PointerEvent = class PointerEvent extends dom.window.MouseEvent {
    constructor(type, params = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
      this.pointerType = params.pointerType ?? 'mouse'
      this.isPrimary = params.isPrimary ?? true
    }
  }
}
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
Object.defineProperty(dom.window, 'innerWidth', { value: 1440, writable: true, configurable: true })
Object.defineProperty(dom.window, 'innerHeight', {
  value: 1000,
  writable: true,
  configurable: true
})

const React = repoRequire('react')
const jsxRuntime = repoRequire('react/jsx-runtime')
const { createRoot } = repoRequire('react-dom/client')

let pluginExports = null
dom.window.__ModuleLoader__ = {
  load({ factory }) {
    const requireMock = (spec) => {
      if (spec === 'react') return React
      if (spec === 'react/jsx-runtime') return jsxRuntime
      throw new Error(`unexpected require("${spec}")`)
    }
    pluginExports = factory(requireMock)
  }
}
const source = readFileSync(join(root, 'lib/client.js'), 'utf8')
new Function('window', `${source}\n//# sourceURL=lib/client.js`)(dom.window)
if (pluginExports === null)
  throw new Error('client module did not register via __ModuleLoader__.load')
if (typeof pluginExports.apply !== 'function') throw new Error('client module exports no apply')

// ---- mock ctx mount ----
const slotEntries = []
let localeDicts = null
let conversationDefinition = null
let activeLocale = 'zh'
let localeRevision = 0
const localeListeners = new Set()
/** Switch the active locale the way the runtime does: bump the revision and notify. */
function setActiveLocale(next) {
  activeLocale = next
  localeRevision += 1
  for (const listener of localeListeners) listener()
}
/** File viewers the client half registered with the optional sidebar service. */
const sidebarViewers = []
/** Native right-Sidebar tab types the client half registered. */
const nativeTabTypes = []
/** Gateway phase the fake host reports; a stopped Gateway cannot project Viewer URLs. */
let gatewayPhase = 'running'
const SETTINGS_DEFAULTS = { autoOpenLivePreview: true, conversationReviewCards: true }
let settingsRevision = 0
let settingsValue = { ...SETTINGS_DEFAULTS }
let settingsUser = {}
const settingsListeners = new Set()
const makeSettingsSnapshot = () => ({
  status: 'ready',
  value: { ...settingsValue },
  base: { ...SETTINGS_DEFAULTS },
  user: settingsUser,
  revision: settingsRevision,
  writable: true,
  mode: 'host'
})
let settingsSnapshot = makeSettingsSnapshot()
const settingsScope = {
  getSnapshot() {
    if (this !== settingsScope) throw new Error('SettingsScope.getSnapshot lost its receiver')
    return settingsSnapshot
  },
  subscribe(listener) {
    if (this !== settingsScope) throw new Error('SettingsScope.subscribe lost its receiver')
    settingsListeners.add(listener)
    return () => settingsListeners.delete(listener)
  },
  async set(field, value) {
    if (!Object.hasOwn(SETTINGS_DEFAULTS, field) || typeof value !== 'boolean')
      throw new Error(`unexpected settings write: ${field}`)
    settingsValue = { ...settingsValue, [field]: value }
    settingsUser = { ...settingsUser, [field]: value }
    settingsRevision += 1
    settingsSnapshot = makeSettingsSnapshot()
    for (const listener of settingsListeners) listener()
  },
  async unset(field) {
    if (!Object.hasOwn(SETTINGS_DEFAULTS, field))
      throw new Error(`unexpected settings reset: ${field}`)
    settingsValue = { ...settingsValue, [field]: SETTINGS_DEFAULTS[field] }
    const nextUser = { ...settingsUser }
    delete nextUser[field]
    settingsUser = nextUser
    settingsRevision += 1
    settingsSnapshot = makeSettingsSnapshot()
    for (const listener of settingsListeners) listener()
  }
}
const conversationEventRegistry = {
  register(definition) {
    conversationDefinition = definition
    return () => {}
  }
}
const fakeCtx = {
  inject(services, callback) {
    const key = services.join(',')
    if (key !== 'settingsScope' && key !== 'betterSidebar' && key !== 'sidebarRightTabs')
      throw new Error(`unexpected ctx.inject(${JSON.stringify(services)})`)
    return callback(fakeCtx)
  },
  effect(fn) {
    const disposer = fn()
    return () => {
      if (typeof disposer === 'function') disposer()
    }
  },
  slots: {
    register(options, Component) {
      slotEntries.push({ options, Component })
      return () => {}
    },
    inject(key, callback) {
      if (
        key !== 'conversation.input.dock' &&
        key !== 'conversation.chat.turnTail' &&
        key !== 'plugins.bundle.config' &&
        key !== 'settings.plugin.item' &&
        key !== 'sidebar.right.pane.tab'
      )
        throw new Error(`unexpected slots.inject("${key}")`)
      return callback()
    }
  },
  settingsScope: {
    bind(spec) {
      if (spec.namespace !== 'univer-office')
        throw new Error(`unexpected settings namespace ${spec.namespace}`)
      return settingsScope
    }
  },
  locale: {
    register(ns, dicts) {
      localeDicts = { ns, dicts }
      return () => {}
    },
    bind() {
      return (key) => localeDicts?.dicts[activeLocale][key] ?? key
    },
    getSnapshot() {
      return { active: activeLocale, revision: localeRevision }
    },
    subscribe(listener) {
      localeListeners.add(listener)
      return () => localeListeners.delete(listener)
    }
  },
  get(name) {
    if (name === 'uiConversation') return { events: conversationEventRegistry }
    if (name === 'sidebarRightTabs')
      return {
        register(definition) {
          nativeTabTypes.push(definition)
          return () => {}
        }
      }
    if (name === 'betterSidebar')
      return {
        registerFileViewer(descriptor) {
          sidebarViewers.push(descriptor)
          return () => {}
        }
      }
    throw new Error(`unexpected ctx.get("${name}")`)
  }
}
pluginExports.apply(fakeCtx)
const dockEntry = slotEntries.find(
  (entry) => entry.options.name === 'conversation.input.dock' && entry.options.id === 'univer-dock'
)
const tailEntry = slotEntries.find(
  (entry) =>
    entry.options.name === 'conversation.chat.turnTail' &&
    entry.options.id === 'univer-turn-preview'
)
const settingsEntry = slotEntries.find(
  (entry) =>
    entry.options.name === 'plugins.bundle.config' && entry.options.key === 'dsh-univer-office'
)
if (dockEntry === undefined)
  throw new Error(
    'dock entry missing: ' + slotEntries.map((e) => e.options.name + '/' + e.options.id).join(',')
  )
if (tailEntry === undefined)
  throw new Error('turn-tail entry missing (existing preview card must stay registered)')
if (settingsEntry === undefined) throw new Error('Univer settings card missing')
if (tailEntry.options.id !== 'univer-turn-preview')
  throw new Error(
    'turnTail is a list slot since DSH 0.1.6-alpha.2: entries must declare a stable id'
  )
if (typeof tailEntry.options.select === 'function')
  throw new Error('list-slot entries must not declare a chain selector')
if (localeDicts === null || localeDicts.ns !== 'univer')
  throw new Error('locale dictionaries not registered')
if (conversationDefinition === null || conversationDefinition.kind !== 'univerTurn')
  throw new Error('Conversation definition not registered')
if (pluginExports.inject.join(',') !== 'slots,locale,conversation')
  throw new Error('Client must depend only on Conversation services of the supported DSH line')
if (
  dockEntry.options.locale !== 'univer' ||
  tailEntry.options.locale !== 'univer' ||
  settingsEntry.options.locale !== 'univer'
)
  throw new Error('all UI entries must declare the Univer locale namespace')
const dockInjected = dockEntry.options.inject()
const tailInjected = tailEntry.options.inject()
const settingsInjected = settingsEntry.options.inject()
if (
  typeof dockInjected.getViewerLocale !== 'function' ||
  typeof tailInjected.getViewerLocale !== 'function'
)
  throw new Error('Viewer locale getter missing')
if (dockInjected.preferences === undefined || settingsInjected.settings !== settingsScope)
  throw new Error('Settings preference injection missing')

// ---- on-demand `.univer` file viewer registration ----
// A click on the file in the DSH file tree must reach the Viewer with no agent
// write, so the client half registers a previewer for the `.univer` extension.
if (sidebarViewers.length !== 1)
  throw new Error(`expected exactly one sidebar file viewer, got ${sidebarViewers.length}`)
const fileViewer = sidebarViewers[0]
if (fileViewer.id !== 'univer-office:univer')
  throw new Error(`unexpected file viewer id: ${fileViewer.id}`)
if (fileViewer.exts.join(',') !== 'univer')
  throw new Error(`file viewer must claim the .univer extension, got ${fileViewer.exts.join(',')}`)
if (!(fileViewer.priority > 0))
  throw new Error('file viewer must outrank the sidebar catch-all viewer')
if (fileViewer.fetchStrategy !== 'none')
  throw new Error(
    '.univer is a binary container: a byte-reading strategy would render the download pane instead'
  )
if (typeof fileViewer.component !== 'function') throw new Error('file viewer component missing')

// ---- on-demand `.univer` preview as a NATIVE right-Sidebar tab type ----
// dsh-better-sidebar wins the address claim whenever it is installed, so the
// registration above only covers hosts that have it. This one covers the rest:
// without it, a host on DSH's own file tree has no `.univer` preview at all.
if (nativeTabTypes.length !== 1)
  throw new Error(`expected exactly one native sidebar tab type, got ${nativeTabTypes.length}`)
const nativeTab = nativeTabTypes[0]
if (nativeTab.id !== 'dsh-univer-office') throw new Error(`unexpected tab id: ${nativeTab.id}`)
if (nativeTab.kind !== 'univer')
  throw new Error(`the tab kind must be this plugin's own, got ${nativeTab.kind}`)
if (nativeTab.patterns.join(',') !== '*.univer')
  throw new Error(`tab type must claim .univer, got ${nativeTab.patterns.join(',')}`)
if (nativeTab.priority !== 'extension')
  throw new Error('a third-party tab type claims addresses in the highest band')
const SESSION_ADDRESS = 'dsh-resource://file/session/test-session-id/预览演示/月度支出表.univer'
if (nativeTab.canOpen(SESSION_ADDRESS) !== true)
  throw new Error('a session-scoped file address must be claimable')
if (nativeTab.canOpen('dsh-resource://file/absolute/home/me/x.univer') !== false)
  throw new Error('the absolute scope carries no session, so the state route cannot authorize it')
if (nativeTab.canOpen('dsh-resource://note/session/s1/x.univer') !== false)
  throw new Error('only file addresses belong to this type')
if (nativeTab.title(SESSION_ADDRESS) !== '月度支出表.univer')
  throw new Error(
    `the chip title must be the decoded basename, got ${nativeTab.title(SESSION_ADDRESS)}`
  )
const nativeBodyEntry = slotEntries.find(
  (entry) => entry.options.name === 'sidebar.right.pane.tab' && entry.options.key === nativeTab.id
)
if (nativeBodyEntry === undefined)
  throw new Error('the native tab body must register under the type id')
if (typeof nativeBodyEntry.Component !== 'function')
  throw new Error('native tab body is not a component')

// The mirrored `dsh-resource://file/…` grammar, exercised through the two
// members the sidebar actually calls rather than by reaching into the parser.
for (const [address, claimable, title] of [
  ['dsh-resource://file/session/s1/src/a.univer', true, 'a.univer'],
  ['dsh-resource://file/session/s1/%E6%9C%88%E5%BA%A6.univer', true, '月度.univer'],
  ['dsh-resource://file/session/s1/a%20b.univer', true, 'a b.univer'],
  ['dsh-resource://file/session/s1/a.univer?line=3#frag', true, 'a.univer'],
  ['dsh-resource://file/session/s1/C:/dir/a.univer', true, 'a.univer'],
  ['dsh-resource://file/absolute/home/me/a.univer', false, undefined],
  ['dsh-resource://note/session/s1/a.univer', false, undefined],
  ['dsh-resource://file/session/s1/%ZZ.univer', false, undefined],
  ['sidebar://guide', false, undefined],
  ['/plain/path/a.univer', false, undefined]
]) {
  if (nativeTab.canOpen(address) !== claimable)
    throw new Error(`canOpen(${address}) must be ${claimable}`)
  if (title !== undefined && nativeTab.title(address) !== title)
    throw new Error(`title(${address}) must be ${title}, got ${nativeTab.title(address)}`)
}

// ---- definition pure-accumulator sanity: reads never erase a ready transition ----
{
  const def = conversationDefinition
  const mkContext = (state) => ({
    state,
    key: '',
    kind: 'univerTurn',
    id: '7',
    matches: [],
    start: undefined,
    current: new Map()
  })
  const startMatch = {
    id: '7',
    role: 'start',
    event: { type: 'turn/start', data: { turn: 7 } },
    location: { kind: 'turn', turn: 7 }
  }
  let state = def.start({ state: undefined }, startMatch, { previous: () => undefined })
  if (state.turn !== 7 || state.files.length !== 0) throw new Error('definition start state wrong')
  const readyCall = {
    id: '7',
    role: 'update',
    location: { kind: 'turn', turn: 7 },
    event: {
      type: 'tool/call',
      data: {
        turn: 7,
        step: 1,
        callId: 'call-ready',
        name: 'univer_worktree',
        arguments: JSON.stringify({
          action: 'ready',
          file: '/x/proj/notes/demo.univer',
          worktreeId: 'wt-abc12345'
        })
      }
    }
  }
  state = def.update(mkContext(state), readyCall)
  const readyResult = {
    id: '7',
    role: 'update',
    location: { kind: 'turn', turn: 7 },
    event: {
      type: 'tool/result',
      data: {
        turn: 7,
        step: 1,
        message: {
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-ready',
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    operation: 'worktree',
                    file: '/x/proj/notes/demo.univer',
                    result: { action: 'ready', worktreeId: 'wt-abc12345' }
                  })
                }
              ]
            }
          ]
        }
      }
    }
  }
  state = def.update(mkContext(state), readyResult)
  const laterStatus = {
    id: '7',
    role: 'update',
    location: { kind: 'turn', turn: 7 },
    event: {
      type: 'tool/call',
      data: {
        turn: 7,
        step: 1,
        callId: 'call-status',
        name: 'univer_status',
        arguments: JSON.stringify({ file: '/x/proj/notes/demo.univer' })
      }
    }
  }
  state = def.update(mkContext(state), laterStatus)
  const screenshotCall = {
    id: '7',
    role: 'update',
    location: { kind: 'turn', turn: 7 },
    event: {
      type: 'tool/call',
      data: {
        turn: 7,
        step: 1,
        callId: 'call-screenshot',
        name: 'univer_screenshot',
        arguments: JSON.stringify({
          file: '/x/proj/notes/demo.univer',
          worktreeId: 'wt-abc12345',
          unitId: 'unit-1',
          output: 'shots'
        })
      }
    }
  }
  state = def.update(mkContext(state), screenshotCall)
  const screenshotResult = {
    id: '7',
    role: 'update',
    location: { kind: 'turn', turn: 7 },
    event: {
      type: 'tool/result',
      data: {
        turn: 7,
        step: 1,
        message: {
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-screenshot',
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    operation: 'screenshot',
                    file: '/x/proj/notes/demo.univer',
                    result: { unitId: 'unit-1', images: [{ name: 'page-1.png' }] }
                  })
                },
                { type: 'image', attachment: { attachmentId: 'fixture-image' } }
              ]
            }
          ]
        }
      }
    }
  }
  state = def.update(mkContext(state), screenshotResult)
  if (
    state.files[0].operations.length !== 3 ||
    state.files[0].operations[0].action !== 'ready' ||
    state.files[0].operations[2].name !== 'screenshot'
  ) {
    throw new Error(
      'later status/screenshot reads must preserve ready operation semantics and structured screenshot replay'
    )
  }
  const locationData = def.buildLocationData(mkContext(state), 'turn')
  if (
    locationData === null ||
    locationData.key !== 'univerTurn' ||
    locationData.value.files.length !== 1
  )
    throw new Error('buildLocationData wrong')
}

// ---- render harness ----
const t = (key) => localeDicts.dicts[activeLocale][key] ?? key
let callSequence = 0
const operation = (name, worktreeId, action = null, unitId = null, phase = 'succeeded') => ({
  callId: `fixture-${++callSequence}`,
  name,
  action,
  file: DEMO_FILE,
  worktreeId,
  unitId,
  phase
})
const turnFile = (
  file,
  worktreeId = null,
  name = worktreeId === null ? 'status' : 'execute',
  action = null,
  phase = 'succeeded'
) => ({
  file,
  operations: [{ ...operation(name, worktreeId, action, null, phase), file }]
})
const sessionWithTargets = (targets, running) => ({
  sessionId: 'test-session-id',
  running,
  chat: {
    timeline: {
      turns: new Map([
        [
          3,
          {
            data: {
              get: (key) =>
                key === 'univerTurn'
                  ? { files: targets.map((target) => turnFile(target.file, target.worktreeId)) }
                  : undefined
            }
          }
        ]
      ])
    }
  }
})
const sessionWithFiles = (files, running, turns = new Map()) => ({
  sessionId: 'test-session-id',
  running,
  chat: {
    timeline: {
      turns: new Map([
        ...turns,
        [3, { data: { get: (key) => (key === 'univerTurn' ? { files } : undefined) } }]
      ])
    }
  }
})
const runtimeProps = (session) => ({
  session: { sessionId: session.sessionId, running: session.running },
  useSession: (selector) => selector({ sessionId: session.sessionId, running: session.running }),
  useChat: (selector) => selector(session.chat)
})
const rootEl = document.createElement('div')
document.body.appendChild(rootEl)
const reactRoot = createRoot(rootEl)
const reviewRootEl = document.createElement('div')
document.body.appendChild(reviewRootEl)
const reviewRoot = createRoot(reviewRootEl)
const SESSION_CWD = join(tmpdir(), 'dsh-univer-client-smoke', 'workdir')
const REL_DEMO_FILE = SESSION_CWD + '/work_班级成绩表/班级管理.univer'
const WINDOWS_CWD = 'C:\\Users\\17361\\Documents\\DSH'
const WINDOWS_FILE = WINDOWS_CWD + '\\学生成绩表.univer'
let scenario = 0
function render(session, remount = true, cwd = SESSION_CWD) {
  if (remount) scenario += 1
  reactRoot.render(
    React.createElement(dockEntry.Component, {
      key: 's' + scenario,
      ...runtimeProps(session),
      t,
      getViewerLocale: dockInjected.getViewerLocale,
      preferences: dockInjected.preferences,
      sessionId: 'test-session-id',
      useSessions: (selector) => selector({ byId: { 'test-session-id': { cwd } } })
    })
  )
  reviewRoot.render(
    React.createElement(tailEntry.Component, {
      key: 's' + scenario,
      // List-slot entries receive the owner props directly; the component
      // resolves its own match from turn.data.
      turn: {
        turn: 3,
        data: session.chat.timeline.turns.get(3)?.data ?? { get: () => undefined }
      },
      seq: 3,
      openFile: () => {},
      t,
      getViewerLocale: tailInjected.getViewerLocale,
      preferences: tailInjected.preferences,
      sessionId: 'test-session-id',
      ...runtimeProps(session),
      useSessions: (selector) => selector({ byId: { 'test-session-id': { cwd } } })
    })
  )
}
async function waitFor(description, predicate, timeoutMs = 5000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 80))
  }
  throw new Error(
    `timeout waiting for: ${description}\nhtml: ${document.body.innerHTML.slice(0, 1500)}`
  )
}
const q = (selector) => document.querySelector(selector)
const qa = (selector) => Array.from(document.querySelectorAll(selector))
/** Encode one `/`-separated path the way the file-resource grammar encodes it. */
const encodeAddressPath = (path) =>
  path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

// ---- turn-tail preview: full standalone Viewer, not embedded mode ----
// List-slot entries (DSH 0.1.6-alpha.2) receive the owner props and resolve
// their own match, so fixtures express a match as the Turn's univerTurn data.
const ownerProps = (turn, files, extra = {}) => ({
  turn: { turn, data: { get: (key) => (key === 'univerTurn' ? { files } : undefined) } },
  seq: turn,
  openFile: () => {},
  ...extra
})
const tailRootEl = document.createElement('div')
document.body.appendChild(tailRootEl)
const tailRoot = createRoot(tailRootEl)
worktrees = [wt('draft')]
const tailProps = {
  sessionId: 'test-session-id',
  t,
  getViewerLocale: tailInjected.getViewerLocale,
  preferences: tailInjected.preferences,
  ...runtimeProps(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], true)),
  useSessions: (selector) => selector({ byId: { 'test-session-id': { cwd: SESSION_CWD } } })
}
tailRoot.render(
  React.createElement(tailEntry.Component, {
    ...tailProps,
    ...ownerProps(3, [turnFile(DEMO_FILE, WORKTREE)])
  })
)
await waitFor('回合尾部统一卡片', () => tailRootEl.querySelector('.uvf_panel') !== null)
await waitFor(
  '卡片显示 worktree 名称',
  () => tailRootEl.querySelector('.uvf_panelWorktree')?.textContent === 'v3smoke'
)
await waitFor(
  '中文完整 Viewer 页面',
  () =>
    tailRootEl.querySelector('.uvf_panelFrame')?.getAttribute('src') === ZH_FULL_DEFAULT_UNIT_URL
)
const tailFrame = tailRootEl.querySelector('.uvf_panelFrame')
setActiveLocale('en')
tailRoot.render(
  React.createElement(tailEntry.Component, {
    ...tailProps,
    ...ownerProps(3, [turnFile(DEMO_FILE, WORKTREE)])
  })
)
await waitFor(
  '统一卡片切换英文',
  () =>
    tailRootEl.querySelector('.uvf_panelFrame')?.getAttribute('src') === EN_FULL_DEFAULT_UNIT_URL
)
if (tailRootEl.querySelector('.uvf_panelFrame') !== tailFrame)
  throw new Error('locale switch must update the existing Viewer iframe')
setActiveLocale('zh')
tailRoot.render(
  React.createElement(tailEntry.Component, {
    ...tailProps,
    ...ownerProps(3, [turnFile(DEMO_FILE, WORKTREE)])
  })
)
await waitFor(
  '统一卡片切回中文',
  () =>
    tailRootEl.querySelector('.uvf_panelFrame')?.getAttribute('src') === ZH_FULL_DEFAULT_UNIT_URL
)

// A relative tool-call path and the absolute tool-result path identify one file and one card.
tailRoot.render(
  React.createElement(tailEntry.Component, {
    ...tailProps,
    ...ownerProps(3, [
      turnFile('work_班级成绩表/班级管理.univer'),
      turnFile(REL_DEMO_FILE, WORKTREE)
    ])
  })
)
await waitFor(
  '相对路径和绝对路径去重为一张卡片',
  () =>
    tailRootEl.querySelectorAll('.uvf_panel').length === 1 &&
    tailRootEl.querySelector('.uvf_panelMeta')?.textContent === REL_DEMO_FILE
)

// Win32 call/result paths may use opposite separators but still identify one file.
tailRoot.render(
  React.createElement(tailEntry.Component, {
    ...tailProps,
    ...ownerProps(
      3,
      [turnFile('学生成绩表.univer'), turnFile(WINDOWS_FILE.replaceAll('\\', '/'), WORKTREE)],
      {
        useSessions: (selector) => selector({ byId: { 'test-session-id': { cwd: WINDOWS_CWD } } })
      }
    )
  })
)
await waitFor(
  'Windows 分隔符去重为一张卡片',
  () =>
    tailRootEl.querySelectorAll('.uvf_panel').length === 1 &&
    tailRootEl.querySelector('.uvf_panelMeta')?.textContent === WINDOWS_FILE
)

// Distinct files touched in one turn each receive their own card.
tailRoot.render(
  React.createElement(tailEntry.Component, {
    ...tailProps,
    ...ownerProps(3, [turnFile(DEMO_FILE, WORKTREE), turnFile(SECOND_FILE)])
  })
)
await waitFor(
  '同一回合的两个文件分别显示卡片',
  () => tailRootEl.querySelectorAll('.uvf_panel').length === 2
)
const previewPaths = Array.from(tailRootEl.querySelectorAll('.uvf_panelMeta')).map(
  (element) => element.textContent
)
if (previewPaths.join('|') !== `${DEMO_FILE}|${SECOND_FILE}`)
  throw new Error('preview cards must preserve file order: ' + previewPaths.join(','))

// A temporary Univer file deleted later in the same Turn must lose its card instead of loading forever.
missingFiles.add(SECOND_FILE)
await waitFor('回合结束前已删除的临时文件不显示卡片', () => {
  const panels = Array.from(tailRootEl.querySelectorAll('.uvf_panel'))
  return (
    panels.length === 1 && panels[0]?.querySelector('.uvf_panelMeta')?.textContent === DEMO_FILE
  )
})
missingFiles.delete(SECOND_FILE)

// A worktree touched again in a newer turn leaves the current review-card header behind.
const historicalSession = {
  sessionId: 'test-session-id',
  running: false,
  chat: {
    timeline: {
      turns: new Map([
        [
          3,
          {
            data: {
              get: (key) =>
                key === 'univerTurn' ? { files: [turnFile(DEMO_FILE, WORKTREE)] } : undefined
            }
          }
        ],
        [
          4,
          {
            data: {
              get: (key) =>
                key === 'univerTurn' ? { files: [turnFile(DEMO_FILE, WORKTREE)] } : undefined
            }
          }
        ]
      ])
    }
  }
}
tailRoot.render(
  React.createElement(tailEntry.Component, {
    ...tailProps,
    ...ownerProps(3, [turnFile(DEMO_FILE, WORKTREE)]),
    ...runtimeProps(historicalSession)
  })
)
await waitFor(
  '旧回合保留新版审阅 header',
  () => tailRootEl.querySelector('.uvf_panel_history') !== null
)
await waitFor(
  '历史 header 显示 worktree 名称',
  () => tailRootEl.querySelector('.uvf_panelWorktree')?.textContent === 'v3smoke'
)
if (tailRootEl.querySelector('.uvf_panelMeta')?.textContent !== DEMO_FILE)
  throw new Error('historical review header must show only the full file path')
tailRoot.unmount()
tailRootEl.remove()

// ---- scenario 0: no targets → no UI ----
worktrees = [wt('draft')]
render(sessionWithTargets([], false))
await waitFor('no UI without targets', () => q('.uvf_root') === null && q('.uvf_panel') === null)

// ---- scenario 0a: new opens a trunk window; reads alone do not open one ----
worktrees = []
render(sessionWithFiles([turnFile(DEMO_FILE, null, 'new')], true))
await waitFor(
  'new 主动拉起当前版本浮窗',
  () => q('.uvf_win') !== null && q('.uvf_frame')?.getAttribute('src') === ZH_LIVE_TRUNK_URL
)
if (q('.uvf_root')?.parentElement !== document.body)
  throw new Error('floating windows must portal outside the input dock')
if (q('.uvf_chip')?.getAttribute('data-status') !== 'trunk')
  throw new Error('new window must identify the current version')
render(sessionWithFiles([turnFile(DEMO_FILE, null, 'status')], true))
await waitFor('纯读取不主动拉起浮窗', () => q('.uvf_win') === null)

// ---- scenario 0aa: an open non-terminal worktree resumes in the next Turn ----
worktrees = [wt('draft')]
const persistentFiles = [turnFile(DEMO_FILE, WORKTREE, 'execute')]
const persistentRunning = sessionWithFiles(persistentFiles, true)
render(persistentRunning)
await waitFor('写入拉起浮窗', () => q('.uvf_win') !== null)
render({ ...persistentRunning, running: false }, false)
await waitFor('Turn 间暂时隐藏浮窗', () => q('.uvf_win') === null)
render({ ...persistentRunning, running: true }, false)
await waitFor('下一 Turn 延续非终态浮窗', () => q('.uvf_win') !== null)

// ---- scenario 0b: relative target resolves against the session cwd ----
worktrees = [wt('ready')]
render(
  sessionWithTargets([{ file: 'work_班级成绩表/班级管理.univer', worktreeId: WORKTREE }], false)
)
await waitFor('相对路径解析后出现审阅面板', () => q('.uvf_panel') !== null)
if (!reviewRootEl.contains(q('.uvf_panel')))
  throw new Error('review panel must render at the Turn tail, not in the input dock')
if (!stateRequests.includes(REL_DEMO_FILE))
  throw new Error('relative target must be polled as absolute: ' + stateRequests.join(', '))
await waitFor(
  '相对路径卡片状态完成切换',
  () =>
    q('.uvf_panelWorktree')?.textContent === 'v3smoke' &&
    q('.uvf_panelMeta')?.textContent === REL_DEMO_FILE
)

// ---- scenario 0c: Win32 separator variants identify one floating window ----
worktrees = [wt('ready')]
render(
  sessionWithFiles(
    [
      turnFile('学生成绩表.univer', WORKTREE),
      turnFile(WINDOWS_FILE.replaceAll('\\', '/'), WORKTREE)
    ],
    true
  ),
  true,
  WINDOWS_CWD
)
await waitFor('Windows 分隔符去重为一个浮窗', () => qa('.uvf_win').length === 1)
if (!stateRequests.includes(WINDOWS_FILE))
  throw new Error('Win32 target must be polled with native separators: ' + stateRequests.join(', '))

// ---- scenario 0d: later reads cannot erase a ready transition in the same Turn ----
worktrees = [wt('ready')]
const readyThenReads = turnFile(DEMO_FILE, WORKTREE, 'worktree', 'ready')
readyThenReads.operations.push(
  { ...operation('inspect', WORKTREE, null, UNITS[0].unitId), file: DEMO_FILE },
  { ...operation('status', null), file: DEMO_FILE }
)
render(sessionWithFiles([readyThenReads], false))
await waitFor(
  'ready 后读取仍展示合并预览',
  () => q('.uvf_panelFrame')?.getAttribute('src') === ZH_FULL_DEFAULT_MERGE_URL
)

// ---- scenario 1: draft → floating window with live iframe ----
worktrees = [wt('merged', 'wt-other-000001'), wt('draft')]
const liveDraftSession = sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], true)
render(liveDraftSession)
await waitFor('draft 浮窗出现', () => q('.uvf_win') !== null)
if (q('.uvf_frame')?.getAttribute('src') !== ZH_DEFAULT_UNIT_URL)
  throw new Error('window iframe must default to the changed unit in the DSH locale')
{
  const chips = Array.from(document.querySelectorAll('.uvf_win .uvf_unit'))
  if (chips.length !== 3) throw new Error('unit chips missing: ' + chips.length)
  if (
    (chips[2].textContent ?? '').includes('删') === false ||
    (chips[2].textContent ?? '').includes('u-gone')
  ) {
    throw new Error(
      'nameless deleted chip must show the kind label, not the unitId: ' + chips[2].textContent
    )
  }
  if (chips[0].className.includes('uvf_unit_on') === false)
    throw new Error('default chip must be the first changed unit')
  if (chips[0].getAttribute('data-kind') !== 'modified')
    throw new Error('chip must carry its change kind')
  if ((chips[0].textContent ?? '').includes('销售') === false)
    throw new Error('chip must name the unit')
  chips[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor(
    '切换 unit 后 iframe 跟随',
    () => q('.uvf_frame')?.getAttribute('src') === ZH_SLIDE_UNIT_URL
  )
}
if ((q('.uvf_windowTitle')?.textContent ?? '').includes('v3smoke') === false)
  throw new Error('title must name the draft worktree')
if (qa('.uvf_win').length !== 1)
  throw new Error('worktrees the session never mentioned must stay hidden')
if (q('.uvf_panel') === null)
  throw new Error('the unified Turn card must exist while the worktree is draft')

// ---- scenario 1a: Settings card disables and re-enables automatic live windows ----
{
  const settingsRootEl = document.createElement('section')
  document.body.appendChild(settingsRootEl)
  const settingsRoot = createRoot(settingsRootEl)
  settingsRoot.render(
    React.createElement(settingsEntry.Component, { t, ...settingsInjected, view: 'page' })
  )
  await waitFor(
    'Univer 设置卡片出现',
    () => settingsRootEl.querySelector('.uvf_settingsCard') !== null
  )
  await waitFor(
    '实时预览开关出现',
    () => settingsRootEl.querySelector('[role=switch]')?.getAttribute('aria-checked') === 'true'
  )
  settingsRootEl
    .querySelector('[role=switch]')
    .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor(
    '关闭设置进入待保存状态',
    () => settingsRootEl.querySelector('[role=switch]')?.getAttribute('aria-checked') === 'false'
  )
  settingsRootEl
    .querySelector('.uvf_settingsSave')
    .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor(
    '关闭设置后浮窗消失',
    () => settingsValue.autoOpenLivePreview === false && q('.uvf_win') === null
  )
  if (q('.uvf_panel') === null)
    throw new Error('disabling live windows must preserve conversation review cards')
  await waitFor(
    '保存后设置显示覆盖状态',
    () => settingsRootEl.querySelector('.uvf_settingsBadge')?.textContent === '已覆盖'
  )
  settingsRootEl
    .querySelector('[role=switch]')
    .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor(
    '重新开启设置进入待保存状态',
    () => settingsRootEl.querySelector('[role=switch]')?.getAttribute('aria-checked') === 'true'
  )
  settingsRootEl
    .querySelector('.uvf_settingsSave')
    .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor(
    '重新开启后当前修改恢复浮窗',
    () => settingsValue.autoOpenLivePreview === true && q('.uvf_win') !== null
  )
  document
    .querySelectorAll('.uvf_win .uvf_unit')[1]
    .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor(
    '重新开启后可恢复切换 unit',
    () => q('.uvf_frame')?.getAttribute('src') === ZH_SLIDE_UNIT_URL
  )
  settingsRoot.unmount()
  settingsRootEl.remove()
}

// ---- scenario 1a': Settings card hides conversation review cards independently ----
// The two switches are independent: hiding cards must leave the live window alone,
// and the on-demand file-tree preview is a separate surface entirely.
{
  const settingsRootEl = document.createElement('section')
  document.body.appendChild(settingsRootEl)
  const settingsRoot = createRoot(settingsRootEl)
  settingsRoot.render(
    React.createElement(settingsEntry.Component, { t, ...settingsInjected, view: 'page' })
  )
  await waitFor(
    '设置卡片同时提供两个开关',
    () => settingsRootEl.querySelectorAll('[role=switch]').length === 2
  )
  // Every interaction is scoped to the review-card row: scenario 1a left the
  // live-window field overridden too, so an unscoped query would hit its Reset.
  const reviewRow = () => settingsRootEl.querySelectorAll('.uvf_settingsField')[1]
  const reviewSwitch = () => reviewRow().querySelector('[role=switch]')
  const save = async (description, accepted) => {
    await waitFor(`${description}: Save 可用`, () => {
      const button = settingsRootEl.querySelector('.uvf_settingsSave')
      return button !== null && !button.disabled
    })
    settingsRootEl
      .querySelector('.uvf_settingsSave')
      .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    await waitFor(description, accepted)
  }
  if (
    settingsRootEl
      .querySelectorAll('.uvf_settingsField')[0]
      .querySelector('[role=switch]')
      ?.getAttribute('aria-label') !== t('settings.autoOpenLivePreview')
  )
    throw new Error('the live-window switch must stay first')
  if (reviewSwitch()?.getAttribute('aria-label') !== t('settings.conversationReviewCards'))
    throw new Error('the review-card switch must be the second row')
  if (q('.uvf_panel') === null) throw new Error('review cards must start visible')
  reviewSwitch().dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor(
    '关闭审阅卡片进入待保存状态',
    () => reviewSwitch().getAttribute('aria-checked') === 'false'
  )
  await save(
    '关闭审阅卡片后回合卡片消失',
    () => settingsValue.conversationReviewCards === false && q('.uvf_panel') === null
  )
  if (q('.uvf_win') === null)
    throw new Error('hiding review cards must leave the live window untouched')
  reviewRow()
    .querySelector('.uvf_settingsReset')
    .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await save(
    '恢复默认后审阅卡片回来',
    () => settingsValue.conversationReviewCards === true && q('.uvf_panel') !== null
  )
  settingsRoot.unmount()
  settingsRootEl.remove()
}

// ---- scenario 1a'': a Host settings schema older than this Client bundle ----
// The Host half resolves the settings document, so a Client that ships first
// (a rolling upgrade, or this session's HMR reload) reads a snapshot without
// the new field. An absent field must keep the surface at its product default
// instead of reading as "off" and hiding cards the user never turned off.
//
// The crafted snapshot keeps the shared field at its current value, so the
// correct projection is byte-identical to the previous one and nothing
// re-renders — which is why this settles instead of polling. With the bug the
// projection changes to `undefined`, the card re-renders and unmounts.
{
  settingsSnapshot = {
    ...settingsSnapshot,
    value: { autoOpenLivePreview: true },
    revision: settingsRevision + 1
  }
  for (const listener of settingsListeners) listener()
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
  if (q('.uvf_panel') === null) throw new Error('缺失的设置字段必须沿用产品默认值，而不是隐藏界面')
  settingsSnapshot = {
    ...settingsSnapshot,
    value: { ...settingsValue },
    revision: settingsRevision
  }
  for (const listener of settingsListeners) listener()
}

{
  const frame = q('.uvf_frame')
  setActiveLocale('en')
  render(liveDraftSession, false)
  await waitFor(
    '浮窗切换英文',
    () =>
      q('.uvf_chip')?.textContent === 'Editing' &&
      q('[data-window-action=close]')?.getAttribute('title') === 'Close'
  )
  if (q('.uvf_frame') !== frame)
    throw new Error('locale switch must preserve the live iframe element')
  if (q('.uvf_frame')?.getAttribute('src') !== EN_SLIDE_UNIT_URL)
    throw new Error('live Viewer must receive en-US after DSH switches to English')
  setActiveLocale('zh')
  render(liveDraftSession, false)
  await waitFor(
    '浮窗切回中文',
    () =>
      q('.uvf_chip')?.textContent === '修改中' &&
      q('.uvf_frame')?.getAttribute('src') === ZH_SLIDE_UNIT_URL
  )
}

// ---- scenario 2: window controls / drag / bounded eight-way resize ----
{
  const win = q('.uvf_win')
  const header = q('.uvf_windowHeader')
  const px = (property) => Number.parseFloat(win.style[property])
  if (px('width') !== 560 || px('height') !== 420)
    throw new Error('window must use the new default geometry')
  if (
    qa('.uvf_resizeHandle')
      .map((handle) => handle.getAttribute('data-direction'))
      .join(',') !== 'nw,n,ne,w,e,sw,s,se'
  ) {
    throw new Error('window must expose all eight resize directions')
  }
  // Double-clicking the title bar maximizes; the explicit control restores.
  header.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, button: 0 }))
  await waitFor('双击标题栏放大', () => win.className.includes('uvf_win_max'))
  q('[data-window-action=maximize]').dispatchEvent(
    new dom.window.MouseEvent('click', { bubbles: true })
  )
  await waitFor('还原', () => win.className.includes('uvf_win_max') === false)
  // Dragging updates viewport coordinates and never changes display mode.
  const dragStart = { left: px('left'), top: px('top') }
  header.dispatchEvent(
    new dom.window.PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      pointerId: 8,
      clientX: 100,
      clientY: 20
    })
  )
  header.dispatchEvent(
    new dom.window.PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 8,
      clientX: 60,
      clientY: 170
    })
  )
  header.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 8 }))
  await waitFor(
    '拖拽位移写入视口坐标',
    () => px('left') === dragStart.left - 40 && px('top') === dragStart.top + 150
  )
  if (win.className.includes('uvf_win_max')) throw new Error('drag must not maximize')
  // Fold hides the body without unmounting or reloading the Viewer iframe.
  const frameBeforeFold = q('.uvf_frame')
  q('[data-window-action=fold]').dispatchEvent(
    new dom.window.MouseEvent('click', { bubbles: true })
  )
  await waitFor(
    '折叠后只显示标题条',
    () =>
      q('.uvf_win') !== null &&
      q('.uvf_win').className.includes('uvf_win_folded') &&
      q('.uvf_windowBody')?.hidden === true
  )
  if (q('.uvf_frame') !== frameBeforeFold)
    throw new Error('fold must keep the Viewer iframe mounted')
  q('[data-window-action=fold]').dispatchEvent(
    new dom.window.MouseEvent('click', { bubbles: true })
  )
  await waitFor('展开后 Viewer 恢复', () => q('.uvf_windowBody')?.hidden === false)
  if (q('.uvf_frame') !== frameBeforeFold)
    throw new Error('expand must reuse the loaded Viewer iframe')
  // South-east grows both dimensions without moving the north-west corner.
  {
    const handle = q('[data-direction=se]')
    if (handle === null) throw new Error('se resize handle missing')
    const start = { left: px('left'), top: px('top'), width: px('width'), height: px('height') }
    handle.dispatchEvent(
      new dom.window.PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerId: 9,
        clientX: 500,
        clientY: 400
      })
    )
    handle.dispatchEvent(
      new dom.window.PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 9,
        clientX: 540,
        clientY: 480
      })
    )
    handle.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 9 }))
    await waitFor(
      '右下角缩放生效',
      () =>
        px('left') === start.left &&
        px('top') === start.top &&
        px('width') === start.width + 40 &&
        px('height') === start.height + 80
    )
  }
  // North-west moves the origin while keeping the opposite corner fixed.
  {
    const handle = q('[data-direction=nw]')
    if (handle === null) throw new Error('nw resize handle missing')
    const start = { left: px('left'), top: px('top'), width: px('width'), height: px('height') }
    handle.dispatchEvent(
      new dom.window.PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerId: 10,
        clientX: 100,
        clientY: 100
      })
    )
    handle.dispatchEvent(
      new dom.window.PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 10,
        clientX: 160,
        clientY: 140
      })
    )
    handle.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 10 }))
    await waitFor(
      '左上角缩放生效',
      () =>
        px('left') === start.left + 60 &&
        px('top') === start.top + 40 &&
        px('width') === start.width - 60 &&
        px('height') === start.height - 40
    )
  }
  // East and south edges resize independently.
  {
    const handle = q('[data-direction=e]')
    if (handle === null) throw new Error('east resize handle missing')
    const start = { left: px('left'), width: px('width') }
    handle.dispatchEvent(
      new dom.window.PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerId: 13,
        clientX: 200,
        clientY: 200
      })
    )
    handle.dispatchEvent(
      new dom.window.PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 13,
        clientX: 160,
        clientY: 200
      })
    )
    handle.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 13 }))
    await waitFor(
      '右边缘缩放生效',
      () => px('left') === start.left && px('width') === start.width - 40
    )
  }
  {
    const handle = q('[data-direction=s]')
    if (handle === null) throw new Error('south resize handle missing')
    const start = { width: px('width'), height: px('height') }
    handle.dispatchEvent(
      new dom.window.PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerId: 12,
        clientX: 200,
        clientY: 340
      })
    )
    handle.dispatchEvent(
      new dom.window.PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 12,
        clientX: 200,
        clientY: 380
      })
    )
    handle.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 12 }))
    await waitFor(
      '底边缘缩放生效',
      () => px('height') === start.height + 40 && px('width') === start.width
    )
  }
  // Dragging and resizing clamp to the viewport and react to viewport changes.
  header.dispatchEvent(
    new dom.window.PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      pointerId: 14,
      clientX: 100,
      clientY: 100
    })
  )
  header.dispatchEvent(
    new dom.window.PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 14,
      clientX: -10000,
      clientY: -10000
    })
  )
  header.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 14 }))
  await waitFor('拖拽夹紧到视口左上角', () => px('left') === 12 && px('top') === 12)
  {
    const handle = q('[data-direction=w]')
    handle.dispatchEvent(
      new dom.window.PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerId: 15,
        clientX: 0,
        clientY: 100
      })
    )
    handle.dispatchEvent(
      new dom.window.PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 15,
        clientX: 10000,
        clientY: 100
      })
    )
    handle.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 15 }))
    await waitFor('缩放夹紧到最小宽度', () => px('width') === 360)
  }
  dom.window.innerWidth = 700
  dom.window.innerHeight = 520
  dom.window.dispatchEvent(new dom.window.Event('resize'))
  await waitFor(
    '视口缩小后窗口仍可见',
    () =>
      px('left') >= 12 &&
      px('top') >= 12 &&
      px('left') + px('width') <= 688 &&
      px('top') + px('height') <= 508
  )
  dom.window.innerWidth = 1440
  dom.window.innerHeight = 1000
  dom.window.dispatchEvent(new dom.window.Event('resize'))
  // Dismiss removes the window while the status stays draft.
  q('[data-window-action=close]').dispatchEvent(
    new dom.window.MouseEvent('click', { bubbles: true })
  )
  await waitFor('关闭后浮窗消失', () => q('.uvf_win') === null)
}

// ---- scenario 3: ready + session running → window stays with ready chip ----
worktrees = [wt('ready')]
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], true))
await waitFor('ready 且运行中浮窗保留', () => q('.uvf_win') !== null)
if ((q('.uvf_chip')?.textContent ?? '') !== '待确认')
  throw new Error('ready chip must say 待确认 while running')
if (q('.uvf_panel') === null)
  throw new Error('the unified Turn card must exist while the session is running')

// ---- scenario 3b: draft + session end → review dock with mark-ready ----
worktrees = [wt('draft')]
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
await waitFor('draft 审阅面板出现（会话结束后）', () => q('.uvf_panel') !== null)
await waitFor('draft 会话结束后浮窗关闭', () => q('.uvf_win') === null)
if (q('.uvf_panelFrame')?.getAttribute('src') !== ZH_FULL_DEFAULT_UNIT_URL)
  throw new Error('draft card must embed the full localized worktree page at the changed unit')
if ((q('.uvf_panelChip')?.textContent ?? '') !== '修改中')
  throw new Error('draft panel chip must match the Viewer status wording')
if (q('.uvf_panelPageKind') !== null)
  throw new Error('review header must not repeat the embedded page type')
if (q('.uvf_panelWorktree')?.textContent !== 'v3smoke')
  throw new Error('draft panel must place the worktree name beside the file name')
if (q('.uvf_panelMeta')?.textContent !== DEMO_FILE)
  throw new Error('review header metadata must contain only the full file path')
if (q('.uvf_panelFoot') !== null || q('.uvf_action') !== null)
  throw new Error('card must defer lifecycle actions to the embedded Viewer')
q('[data-panel-action=fullscreen]').dispatchEvent(
  new dom.window.MouseEvent('click', { bubbles: true })
)
await waitFor(
  '审阅面板进入全屏',
  () => q('.uvf_panel')?.className.includes('uvf_panel_fullscreen') === true
)
if (q('[data-panel-action=fullscreen]')?.getAttribute('aria-label') !== '退出全屏')
  throw new Error('fullscreen control must expose its current action')
if (q('[data-panel-action=fold]') !== null)
  throw new Error('fullscreen review card must hide the fold control')
dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }))
await waitFor(
  'Escape 退出审阅全屏',
  () => q('.uvf_panel')?.className.includes('uvf_panel_fullscreen') === false
)
if (q('[data-panel-action=fold]') === null)
  throw new Error('fold control must return after exiting fullscreen')
{
  const frame = q('.uvf_panelFrame')
  q('[data-panel-action=fold]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor('审阅卡片折叠完整页面', () => q('.uvf_panelContent')?.hidden === true)
  if (q('[data-panel-action=fold]')?.getAttribute('aria-label') !== '展开')
    throw new Error('fold control must expose the expand action')
  if (q('.uvf_panelFrame') !== frame)
    throw new Error('folding must keep the full Univer page mounted')
  q('[data-panel-action=fold]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor('审阅卡片重新展开', () => q('.uvf_panelContent')?.hidden === false)
}
{
  const frame = q('.uvf_panelFrame')
  const reviewSession = sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false)
  setActiveLocale('en')
  render(reviewSession, false)
  await waitFor(
    '审阅卡片切换英文',
    () => q('.uvf_panelFrame')?.getAttribute('src') === EN_FULL_DEFAULT_UNIT_URL
  )
  if (
    q('.uvf_panelWorktree')?.textContent !== 'v3smoke' ||
    q('.uvf_panelMeta')?.textContent !== DEMO_FILE
  )
    throw new Error('locale switch must preserve the compact file and worktree header')
  if (q('.uvf_panelFrame') !== frame)
    throw new Error('locale switch must preserve the review iframe element')
  setActiveLocale('zh')
  render(reviewSession, false)
  await waitFor(
    '审阅卡片切回中文',
    () => q('.uvf_panelFrame')?.getAttribute('src') === ZH_FULL_DEFAULT_UNIT_URL
  )
}
// ---- scenario 4: ready + session end → window closes, merge panel embeds ----
worktrees = [wt('ready')]
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
await waitFor('会话结束后浮窗关闭', () => q('.uvf_win') === null)
await waitFor('合并预览面板出现', () => q('.uvf_panel') !== null)
await waitFor(
  '卡片嵌入完整合并页',
  () => q('.uvf_panelFrame')?.getAttribute('src') === ZH_FULL_DEFAULT_MERGE_URL
)
if (q('.uvf_panelWorktree')?.textContent !== 'v3smoke')
  throw new Error('card must place the ready worktree beside the file name')
if ((q('.uvf_panelChip')?.textContent ?? '') !== '待确认')
  throw new Error('panel chip must say 待确认')
if (q('.uvf_action') !== null)
  throw new Error('ready card must not duplicate the mergePreview page actions')

// ---- scenario 4b: Viewer merge result → terminal review card remains ----
worktrees = [wt('merged')]
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
await waitFor(
  'Viewer merge 后保留终态卡片',
  () => (q('.uvf_panelChip')?.textContent ?? '') === '已合入'
)
if (q('.uvf_panel')?.getAttribute('data-status') !== 'merged')
  throw new Error('merged review card must expose its terminal status')
if (q('.uvf_panelMeta')?.textContent !== DEMO_FILE)
  throw new Error('merged review card header metadata must remain the full file path')
if (q('.uvf_panelFrame')?.getAttribute('src') !== ZH_TRUNK_URL)
  throw new Error('merged review card must keep the full mainline page open')
if (q('.uvf_action') !== null || q('[data-panel-action=fullscreen]') === null)
  throw new Error('merged review card must remove actions but preserve fullscreen')
await new Promise((resolvePromise) => setTimeout(resolvePromise, 900))
if (q('.uvf_win') !== null) throw new Error('merged worktree must not open a window')

// ---- scenario 4c: Viewer discard result → terminal review card remains ----
worktrees = [wt('discarded')]
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
await waitFor(
  'Viewer discard 后保留终态卡片',
  () => (q('.uvf_panelChip')?.textContent ?? '') === '已丢弃'
)
if (q('.uvf_panel')?.getAttribute('data-status') !== 'discarded')
  throw new Error('discarded review card must expose its terminal status')
if (q('.uvf_panelFrame')?.getAttribute('src') !== ZH_TRUNK_URL || q('.uvf_action') !== null)
  throw new Error('discarded review card must show mainline without mutation actions')
await new Promise((resolvePromise) => setTimeout(resolvePromise, 900))
if (q('.uvf_win') !== null) throw new Error('discarded worktree must not open a window')

// ---- scenario 5: replayed merged worktree → terminal card ----
worktrees = [wt('merged')]
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
await waitFor(
  '历史 merged worktree 显示终态卡片',
  () => q('.uvf_panel')?.getAttribute('data-status') === 'merged'
)
if (q('.uvf_win') !== null || q('.uvf_panelFrame')?.getAttribute('src') !== ZH_TRUNK_URL)
  throw new Error('replayed merged card must open the full mainline page')

// ---- scenario 6: targets cleared → everything closes ----
render(sessionWithTargets([], false))
await waitFor('targets 清空后全部关闭', () => q('.uvf_win') === null && q('.uvf_panel') === null)

reactRoot.unmount()
reviewRoot.unmount()

// ---- legacy hosts (≤ 0.1.6-alpha.1): chain turnTail + settings.plugin.item ----
{
  const legacyEntries = []
  const legacyInjectKeys = []
  const legacyCtx = {
    ...fakeCtx,
    inject(services, callback) {
      const key = services.join(',')
      if (key !== 'settingsScope' && key !== 'betterSidebar' && key !== 'sidebarRightTabs')
        throw new Error(`unexpected ctx.inject(${JSON.stringify(services)})`)
      return callback(legacyCtx)
    },
    slots: {
      register(options, Component) {
        // Hosts up to 0.1.6-alpha.1 reject a chain-slot registration without a selector.
        if (options.name === 'conversation.chat.turnTail' && options.select === undefined)
          throw new Error('chain slot "conversation.chat.turnTail" requires options.select')
        legacyEntries.push({ options, Component })
        return () => {}
      },
      inject(key, callback) {
        legacyInjectKeys.push(key)
        if (
          key !== 'conversation.input.dock' &&
          key !== 'conversation.chat.turnTail' &&
          key !== 'plugins.bundle.config' &&
          key !== 'settings.plugin.item' &&
          key !== 'sidebar.right.pane.tab'
        )
          throw new Error(`unexpected slots.inject("${key}")`)
        return callback()
      }
    }
  }
  pluginExports.apply(legacyCtx)
  const legacyTail = legacyEntries.find(
    (entry) => entry.options.name === 'conversation.chat.turnTail'
  )
  if (
    legacyTail === undefined ||
    typeof legacyTail.options.select !== 'function' ||
    legacyTail.options.priority !== -10 ||
    'id' in legacyTail.options
  )
    throw new Error('legacy hosts must receive the chain-contract turnTail registration')
  const legacySettings = legacyEntries.find(
    (entry) => entry.options.name === 'settings.plugin.item'
  )
  if (legacySettings === undefined || legacySettings.options.key !== 'univer-office')
    throw new Error('legacy hosts must receive the settings.plugin.item registration')
  for (const key of ['plugins.bundle.config', 'settings.plugin.item']) {
    if (!legacyInjectKeys.includes(key))
      throw new Error(`legacy host must probe both settings slots: missing ${key}`)
  }
  // The chain host passes {...owner, matched}; the component resolves its own
  // match from the owner turn and must render the same review cards.
  const legacyRootEl = document.createElement('div')
  document.body.appendChild(legacyRootEl)
  const legacyRoot = createRoot(legacyRootEl)
  legacyRoot.render(
    React.createElement(legacyTail.Component, {
      key: 'legacy',
      ...tailProps,
      ...ownerProps(3, [turnFile(DEMO_FILE, WORKTREE)]),
      matched: { turn: 3, files: [turnFile(DEMO_FILE, WORKTREE)] }
    })
  )
  await waitFor(
    'chain 契约下预览卡片正常渲染',
    () => legacyRootEl.querySelector('.uvf_panel') !== null
  )
  legacyRoot.unmount()
  legacyRootEl.remove()
}

// ---- on-demand .univer file viewer: click-to-preview with no agent write ----
{
  const fileViewerRootEl = document.createElement('div')
  document.body.appendChild(fileViewerRootEl)
  const fileViewerRoot = createRoot(fileViewerRootEl)
  let fileViewerKey = 0
  const renderFileViewer = () =>
    fileViewerRoot.render(
      React.createElement(fileViewer.component, {
        key: 'fv' + ++fileViewerKey,
        ctx: fakeCtx,
        scope: { sessionId: 'test-session-id', cwd: SESSION_CWD },
        path: DEMO_FILE,
        title: 'demo.univer',
        viewerId: fileViewer.id
      })
    )
  const fileChips = () => Array.from(fileViewerRootEl.querySelectorAll('.uvf_unit'))
  const fileFrameSrc = () => fileViewerRootEl.querySelector('iframe.uvf_frame')?.getAttribute('src')
  const clickChip = (index) =>
    fileChips()[index].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))

  // Opening the file must reach the Viewer with no agent operation: the client
  // half resolves the Host-projected trunk target on its own.
  worktrees = [wt('draft')]
  renderFileViewer()
  await waitFor('点击文件即按需展示当前版本', () => fileFrameSrc() === withLang(TRUNK_URL, 'zh-CN'))
  if (fileChips().length !== 2)
    throw new Error(
      `an open worktree must be offered as an explicit switch, got ${fileChips().length} chips`
    )
  if (fileChips()[0].textContent !== t('dock.currentVersion'))
    throw new Error('the first scope chip must be the current version')
  if (fileChips()[1].textContent !== t('dock.draft'))
    throw new Error('the open worktree chip must carry its lifecycle label')

  // A file opened while an agent is still working must not hide that work.
  clickChip(1)
  await waitFor('切换到进行中的 worktree', () => fileFrameSrc() === withLang(VIEW_URL, 'zh-CN'))

  // Labels and the Viewer locale follow a language switch without a remount.
  setActiveLocale('en')
  await waitFor(
    '语言切换后预览标签与 Viewer locale 同步跟随',
    () =>
      fileFrameSrc() === withLang(VIEW_URL, 'en-US') &&
      fileChips()[0].textContent === 'Current version'
  )
  setActiveLocale('zh')

  // A ready worktree opens the merge preview, matching the review card's table.
  worktrees = [wt('ready')]
  renderFileViewer()
  await waitFor(
    'ready worktree 仍默认展示当前版本',
    () => fileFrameSrc() === withLang(TRUNK_URL, 'zh-CN')
  )
  clickChip(1)
  await waitFor(
    'ready worktree 使用合并预览',
    () => fileFrameSrc() === withLang(MERGE_URL, 'zh-CN')
  )

  // The Host may confirm the path is gone (an agent removed a temporary file).
  missingFiles.add(DEMO_FILE)
  renderFileViewer()
  await waitFor('文件已不在工作区时给出说明', () =>
    fileViewerRootEl.textContent.includes(t('viewer.missing'))
  )

  // A stopped Gateway must be actionable, not an endless load: the shared
  // Turn-preview poll swallows this failure, so the phase is reported separately.
  gatewayPhase = 'stopped'
  renderFileViewer()
  await waitFor('Gateway 停止时给出启动入口', () =>
    fileViewerRootEl.textContent.includes(t('dock.gatewayDown'))
  )
  const startButton = Array.from(fileViewerRootEl.querySelectorAll('button')).find(
    (button) => button.textContent === t('dock.startGateway')
  )
  if (startButton === undefined) throw new Error('stopped Gateway must offer a start action')
  gatewayPhase = 'running'
  missingFiles.delete(DEMO_FILE)

  fileViewerRoot.unmount()
  fileViewerRootEl.remove()
}

// ---- native right-Sidebar tab body: the host WITHOUT dsh-better-sidebar ----
// The seat hands a body nothing but the resource address, so the address has to
// carry both the session and the path; this proves the whole route works end to
// end against the same fake Host state API the other surfaces use.
{
  const nativeRootEl = document.createElement('div')
  document.body.appendChild(nativeRootEl)
  const nativeRoot = createRoot(nativeRootEl)
  const address = `dsh-resource://file/session/test-session-id/${encodeAddressPath(REL_DEMO_FILE)}`
  worktrees = []
  nativeRoot.render(
    React.createElement(nativeBodyEntry.Component, {
      ctx: fakeCtx,
      useTabInfo: () => ({ tab: { contentId: address } })
    })
  )
  await waitFor(
    '原生侧边栏标签按地址解析出文件与会话并渲染 Viewer',
    () =>
      nativeRootEl.querySelector('iframe.uvf_frame')?.getAttribute('src') ===
      withLang(TRUNK_URL, 'zh-CN')
  )
  if (nativeRootEl.querySelector('[data-surface=sidebar-right]') === null)
    throw new Error('the native tab body must report the surface it renders for')
  if (nativeRootEl.querySelector('.uvf_unit') !== null)
    throw new Error('a file without an open worktree must not offer a scope switch')
  nativeRoot.unmount()
  nativeRootEl.remove()
}

server.close()
console.log('client smoke OK (uiConversation Conversation API)')
