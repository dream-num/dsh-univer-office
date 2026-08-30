// Client-half smoke (dock float + merge panel): jsdom + real React + mock ctx
// + a fake /univer-api HTTP server. Covers: target discovery from the
// conversation snapshot → polling → draft floating window (live iframe deep
// link) → click-to-maximize / fold / drag / dismiss → ready + session end
// closes the window and embeds the merge panel → merged panel shows trunk.
//
//   node test/client-smoke.mjs combined
//   node test/client-smoke.mjs split
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = process.env.UNIVER_PLUGIN_ROOT
if (packageRoot !== undefined && !isAbsolute(packageRoot)) throw new Error('UNIVER_PLUGIN_ROOT must be absolute')
const root = packageRoot ?? dirname(here)
const conversationApi = process.argv[2] ?? 'combined'
if (conversationApi !== 'combined' && conversationApi !== 'split') {
  throw new Error(`expected Client conversation API "combined" or "split", received "${conversationApi}"`)
}
// jsdom/react/react-dom come from this repo's devDependencies.
const repoRequire = createRequire(import.meta.url)
const { JSDOM } = repoRequire('jsdom')

// ---- fake loopback API (node half's /univer-api) ----
const DEMO_FILE = join(tmpdir(), 'dsh-univer-client-smoke', 'demo.univer')
const SECOND_FILE = join(tmpdir(), 'dsh-univer-client-smoke', 'second.univer')
const WORKTREE = 'wt-msvqmweb-47hcdg'
const OPEN_URL = 'http://127.0.0.1:9123/?file=KEY&worktree=wt-msvqmweb-47hcdg'
const VIEW_URL = 'http://127.0.0.1:9123/?file=KEY&worktree=wt-msvqmweb-47hcdg&mode=embedded&scope=worktree'
const MERGE_URL = 'http://127.0.0.1:9123/?file=KEY&worktree=wt-msvqmweb-47hcdg&mode=embedded&scope=mergePreview'
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
  { unitId: 'u-msvo3wpe-p4pqi4', name: '销售', type: 2, kind: 'modified', worktreeUrl: VIEW_URL + '&unit=u-msvo3wpe-p4pqi4', mergeUrl: MERGE_URL + '&unit=u-msvo3wpe-p4pqi4' },
  { unitId: 'u-msvy1lry-dv3hia', name: '班级成绩汇报', type: 3, kind: 'added', worktreeUrl: VIEW_URL + '&unit=u-msvy1lry-dv3hia', mergeUrl: MERGE_URL + '&unit=u-msvy1lry-dv3hia' },
  { unitId: 'u-gone-000001', name: '', type: 2, kind: 'deleted', worktreeUrl: VIEW_URL + '&unit=u-gone-000001', mergeUrl: MERGE_URL + '&unit=u-gone-000001' },
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
  ...(status === 'ready' ? { mergeUrl: MERGE_URL } : {}),
})
const currentState = () => ({
  ok: true,
  file: DEMO_FILE,
  gateway: 'http://127.0.0.1:9123',
  gatewayRunning: true,
  viewerUrl: TRUNK_URL,
  worktrees,
})
const stateRequests = []
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (req.method === 'GET' && url.pathname === '/univer-api/state') {
    const file = url.searchParams.get('file')
    if (url.searchParams.get('sessionId') !== 'test-session-id') {
      res.writeHead(400).end()
      return
    }
    stateRequests.push(file)
    if (file !== null && missingFiles.has(file)) {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, code: 'INVALID_FILE_PATH', message: 'path does not exist' }))
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
    const next = body.action === 'merge' ? 'merged' : body.action === 'discard' ? 'discarded' : body.action === 'reopen' ? 'draft' : body.action === 'ready' ? 'ready' : null
    worktrees = worktrees.map((item) => (item.worktreeId === body.worktreeId && next !== null ? wt(next) : item))
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, action: body.action, worktreeId: body.worktreeId, state: currentState() }))
    return
  }
  res.writeHead(404).end()
})
await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise))
const origin = `http://127.0.0.1:${server.address().port}`

// ---- jsdom + module loading ----
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: origin + '/' })
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
Object.defineProperty(dom.window, 'innerHeight', { value: 1000, writable: true, configurable: true })

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
  },
}
const source = readFileSync(join(root, 'lib/client.js'), 'utf8')
new Function('window', `${source}\n//# sourceURL=lib/client.js`)(dom.window)
if (pluginExports === null) throw new Error('client module did not register via __ModuleLoader__.load')
if (typeof pluginExports.apply !== 'function') throw new Error('client module exports no apply')

// ---- mock ctx mount ----
const slotEntries = []
let localeDicts = null
let conversationDefinition = null
let activeLocale = 'zh'
let localeRevision = 0
const conversationEventRegistry = {
  register(definition) {
    conversationDefinition = definition
    return () => {}
  },
}
const fakeCtx = {
  effect(fn) {
    const disposer = fn()
    return () => { if (typeof disposer === 'function') disposer() }
  },
  slots: {
    register(options, Component) {
      slotEntries.push({ options, Component })
      return () => {}
    },
    inject(key, callback) {
      if (key !== 'conversation.input.dock' && key !== 'conversation.chat.turnTail') throw new Error(`unexpected slots.inject("${key}")`)
      return callback()
    },
  },
  locale: {
    register(ns, dicts) {
      localeDicts = { ns, dicts }
      return () => {}
    },
    bind() {
      return (key) => (localeDicts?.dicts[activeLocale][key] ?? key)
    },
    getSnapshot() {
      return { active: activeLocale, revision: localeRevision }
    },
  },
  get(name) {
    if (name === 'uiConversation') return conversationApi === 'split' ? { events: conversationEventRegistry } : undefined
    if (name === 'conversationEvents') return conversationApi === 'combined' ? conversationEventRegistry : undefined
    throw new Error(`unexpected ctx.get("${name}")`)
  },
}
pluginExports.apply(fakeCtx)
const dockEntry = slotEntries.find((entry) => entry.options.name === 'conversation.input.dock' && entry.options.id === 'univer-dock')
const tailEntry = slotEntries.find((entry) => entry.options.name === 'conversation.chat.turnTail' && entry.options.priority === -10)
if (dockEntry === undefined) throw new Error('dock entry missing: ' + slotEntries.map((e) => e.options.name + '/' + e.options.id).join(','))
if (tailEntry === undefined) throw new Error('turn-tail entry missing (existing preview card must stay registered)')
if ('id' in tailEntry.options) throw new Error('chain entries must not declare a list-slot id')
if (localeDicts === null || localeDicts.ns !== 'univer') throw new Error('locale dictionaries not registered')
if (conversationDefinition === null || conversationDefinition.kind !== 'univerTurn') throw new Error(`${conversationApi} Conversation definition not registered`)
if (pluginExports.inject.join(',') !== 'slots,locale,conversation') throw new Error('Client must depend only on Conversation services shared by DSH 0.1.1-rc.2 and 0.1.2-alpha.1')
if (dockEntry.options.locale !== 'univer' || tailEntry.options.locale !== 'univer') throw new Error('both UI entries must declare the Univer locale namespace')
const dockInjected = dockEntry.options.inject()
const tailInjected = tailEntry.options.inject()
if (typeof dockInjected.getViewerLocale !== 'function' || typeof tailInjected.getViewerLocale !== 'function') throw new Error('Viewer locale getter missing')
{
  const selected = tailEntry.options.select({ turn: { turn: 3, data: { get: () => ({ files: [{ file: '/tmp/demo.univer', operations: [] }] }) } } })
  if (selected?.turn !== 3 || selected.files.length !== 1) throw new Error('turn-tail selector must preserve the owning Turn for review placement')
}

// ---- definition pure-accumulator sanity: reads never erase a ready transition ----
{
  const def = conversationDefinition
  const mkContext = (state) => ({ state, key: '', kind: 'univerTurn', id: '7', matches: [], start: undefined, current: new Map() })
  const startMatch = { id: '7', role: 'start', event: { type: 'turn/start', data: { turn: 7 } }, location: { kind: 'turn', turn: 7 } }
  let state = def.start({ state: undefined }, startMatch, { previous: () => undefined })
  if (state.turn !== 7 || state.files.length !== 0) throw new Error('definition start state wrong')
  const readyCall = {
    id: '7', role: 'update', location: { kind: 'turn', turn: 7 },
    event: { type: 'tool/call', data: { turn: 7, step: 1, callId: 'call-ready', name: 'univer_worktree', arguments: JSON.stringify({ action: 'ready', file: '/x/proj/notes/demo.univer', worktreeId: 'wt-abc12345' }) } },
  }
  state = def.update(mkContext(state), readyCall)
  const readyResult = {
    id: '7', role: 'update', location: { kind: 'turn', turn: 7 },
    event: { type: 'tool/result', data: { turn: 7, step: 1, message: { content: [{ type: 'tool-result', toolCallId: 'call-ready', content: [{ type: 'text', text: JSON.stringify({ operation: 'worktree', file: '/x/proj/notes/demo.univer', result: { action: 'ready', worktreeId: 'wt-abc12345' } }) }] }] } } },
  }
  state = def.update(mkContext(state), readyResult)
  const laterStatus = {
    id: '7', role: 'update', location: { kind: 'turn', turn: 7 },
    event: { type: 'tool/call', data: { turn: 7, step: 1, callId: 'call-status', name: 'univer_status', arguments: JSON.stringify({ file: '/x/proj/notes/demo.univer' }) } },
  }
  state = def.update(mkContext(state), laterStatus)
  const screenshotCall = {
    id: '7', role: 'update', location: { kind: 'turn', turn: 7 },
    event: { type: 'tool/call', data: { turn: 7, step: 1, callId: 'call-screenshot', name: 'univer_screenshot', arguments: JSON.stringify({ file: '/x/proj/notes/demo.univer', worktreeId: 'wt-abc12345', unitId: 'unit-1', output: 'shots' }) } },
  }
  state = def.update(mkContext(state), screenshotCall)
  const screenshotResult = {
    id: '7', role: 'update', location: { kind: 'turn', turn: 7 },
    event: { type: 'tool/result', data: { turn: 7, step: 1, message: { content: [{ type: 'tool-result', toolCallId: 'call-screenshot', content: [{ type: 'text', text: JSON.stringify({ operation: 'screenshot', file: '/x/proj/notes/demo.univer', result: { unitId: 'unit-1', images: [{ name: 'page-1.png' }] } }) }, { type: 'image', attachment: { attachmentId: 'fixture-image' } }] }] } } },
  }
  state = def.update(mkContext(state), screenshotResult)
  if (state.files[0].operations.length !== 3 || state.files[0].operations[0].action !== 'ready' || state.files[0].operations[2].name !== 'screenshot') {
    throw new Error('later status/screenshot reads must preserve ready operation semantics and structured screenshot replay')
  }
  const locationData = def.buildLocationData(mkContext(state), 'turn')
  if (locationData === null || locationData.key !== 'univerTurn' || locationData.value.files.length !== 1) throw new Error('buildLocationData wrong')
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
  phase,
})
const turnFile = (file, worktreeId = null, name = worktreeId === null ? 'status' : 'execute', action = null, phase = 'succeeded') => ({
  file,
  operations: [{ ...operation(name, worktreeId, action, null, phase), file }],
})
const sessionWithTargets = (targets, running) => ({
  sessionId: 'test-session-id',
  running,
  chat: { timeline: { turns: new Map([[3, { data: { get: (key) => (key === 'univerTurn' ? { files: targets.map((target) => turnFile(target.file, target.worktreeId)) } : undefined) } }]]) } },
})
const sessionWithFiles = (files, running, turns = new Map()) => ({
  sessionId: 'test-session-id',
  running,
  chat: { timeline: { turns: new Map([...turns, [3, { data: { get: (key) => (key === 'univerTurn' ? { files } : undefined) } }]]) } },
})
const runtimeProps = (session) => conversationApi === 'split'
  ? {
      session: { sessionId: session.sessionId, running: session.running },
      useSession: (selector) => selector({ sessionId: session.sessionId, running: session.running }),
      useChat: (selector) => selector(session.chat),
    }
  : {
      session,
      useSession: (selector) => selector(session),
    }
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
  reactRoot.render(React.createElement(dockEntry.Component, {
    key: 's' + scenario,
    ...runtimeProps(session),
    t,
    getViewerLocale: dockInjected.getViewerLocale,
    sessionId: 'test-session-id',
    useSessions: (selector) => selector({ byId: { 'test-session-id': { cwd } } }),
  }))
  reviewRoot.render(React.createElement(tailEntry.Component, {
    key: 's' + scenario,
    matched: { turn: 3, files: session.chat.timeline.turns.get(3)?.data.get('univerTurn')?.files ?? [] },
    t,
    getViewerLocale: tailInjected.getViewerLocale,
    sessionId: 'test-session-id',
    ...runtimeProps(session),
    useSessions: (selector) => selector({ byId: { 'test-session-id': { cwd } } }),
  }))
}
async function waitFor(description, predicate, timeoutMs = 5000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 80))
  }
  throw new Error(`timeout waiting for: ${description}\nhtml: ${document.body.innerHTML.slice(0, 1500)}`)
}
const q = (selector) => document.querySelector(selector)
const qa = (selector) => Array.from(document.querySelectorAll(selector))

// ---- turn-tail preview: full standalone Viewer, not embedded mode ----
const tailRootEl = document.createElement('div')
document.body.appendChild(tailRootEl)
const tailRoot = createRoot(tailRootEl)
worktrees = [wt('draft')]
const tailProps = {
  matched: { turn: 3, files: [turnFile(DEMO_FILE, WORKTREE)] },
  sessionId: 'test-session-id',
  t,
  getViewerLocale: tailInjected.getViewerLocale,
  ...runtimeProps(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], true)),
  useSessions: (selector) => selector({ byId: { 'test-session-id': { cwd: SESSION_CWD } } }),
}
tailRoot.render(React.createElement(tailEntry.Component, tailProps))
await waitFor('回合尾部统一卡片', () => tailRootEl.querySelector('.uvf_panel') !== null)
await waitFor('卡片显示 worktree 名称', () => tailRootEl.querySelector('.uvf_panelWorktree')?.textContent === 'v3smoke')
await waitFor('中文完整 Viewer 页面', () => tailRootEl.querySelector('.uvf_panelFrame')?.getAttribute('src') === ZH_FULL_DEFAULT_UNIT_URL)
const tailFrame = tailRootEl.querySelector('.uvf_panelFrame')
activeLocale = 'en'
localeRevision += 1
tailRoot.render(React.createElement(tailEntry.Component, tailProps))
await waitFor('统一卡片切换英文', () => tailRootEl.querySelector('.uvf_panelFrame')?.getAttribute('src') === EN_FULL_DEFAULT_UNIT_URL)
if (tailRootEl.querySelector('.uvf_panelFrame') !== tailFrame) throw new Error('locale switch must update the existing Viewer iframe')
activeLocale = 'zh'
localeRevision += 1
tailRoot.render(React.createElement(tailEntry.Component, tailProps))
await waitFor('统一卡片切回中文', () => tailRootEl.querySelector('.uvf_panelFrame')?.getAttribute('src') === ZH_FULL_DEFAULT_UNIT_URL)

// A relative tool-call path and the absolute tool-result path identify one file and one card.
tailRoot.render(React.createElement(tailEntry.Component, {
  ...tailProps,
  matched: { turn: 3, files: [
    turnFile('work_班级成绩表/班级管理.univer'),
    turnFile(REL_DEMO_FILE, WORKTREE),
  ] },
}))
await waitFor('相对路径和绝对路径去重为一张卡片', () => tailRootEl.querySelectorAll('.uvf_panel').length === 1 && tailRootEl.querySelector('.uvf_panelMeta')?.textContent === REL_DEMO_FILE)

// Win32 call/result paths may use opposite separators but still identify one file.
tailRoot.render(React.createElement(tailEntry.Component, {
  ...tailProps,
  matched: { turn: 3, files: [
    turnFile('学生成绩表.univer'),
    turnFile(WINDOWS_FILE.replaceAll('\\', '/'), WORKTREE),
  ] },
  useSessions: (selector) => selector({ byId: { 'test-session-id': { cwd: WINDOWS_CWD } } }),
}))
await waitFor('Windows 分隔符去重为一张卡片', () => tailRootEl.querySelectorAll('.uvf_panel').length === 1 && tailRootEl.querySelector('.uvf_panelMeta')?.textContent === WINDOWS_FILE)

// Distinct files touched in one turn each receive their own card.
tailRoot.render(React.createElement(tailEntry.Component, {
  ...tailProps,
  matched: { turn: 3, files: [
    turnFile(DEMO_FILE, WORKTREE),
    turnFile(SECOND_FILE),
  ] },
}))
await waitFor('同一回合的两个文件分别显示卡片', () => tailRootEl.querySelectorAll('.uvf_panel').length === 2)
const previewPaths = Array.from(tailRootEl.querySelectorAll('.uvf_panelMeta')).map((element) => element.textContent)
if (previewPaths.join('|') !== `${DEMO_FILE}|${SECOND_FILE}`) throw new Error('preview cards must preserve file order: ' + previewPaths.join(','))

// A temporary Univer file deleted later in the same Turn must lose its card instead of loading forever.
missingFiles.add(SECOND_FILE)
await waitFor('回合结束前已删除的临时文件不显示卡片', () => {
  const panels = Array.from(tailRootEl.querySelectorAll('.uvf_panel'))
  return panels.length === 1 && panels[0]?.querySelector('.uvf_panelMeta')?.textContent === DEMO_FILE
})
missingFiles.delete(SECOND_FILE)

// A worktree touched again in a newer turn leaves the current review-card header behind.
const historicalSession = {
  sessionId: 'test-session-id',
  running: false,
  chat: { timeline: { turns: new Map([
    [3, { data: { get: (key) => (key === 'univerTurn' ? { files: [turnFile(DEMO_FILE, WORKTREE)] } : undefined) } }],
    [4, { data: { get: (key) => (key === 'univerTurn' ? { files: [turnFile(DEMO_FILE, WORKTREE)] } : undefined) } }],
  ]) } },
}
tailRoot.render(React.createElement(tailEntry.Component, {
  ...tailProps,
  matched: { turn: 3, files: [turnFile(DEMO_FILE, WORKTREE)] },
  ...runtimeProps(historicalSession),
}))
await waitFor('旧回合保留新版审阅 header', () => tailRootEl.querySelector('.uvf_panel_history') !== null)
await waitFor('历史 header 显示 worktree 名称', () => tailRootEl.querySelector('.uvf_panelWorktree')?.textContent === 'v3smoke')
if (tailRootEl.querySelector('.uvf_panelMeta')?.textContent !== DEMO_FILE) throw new Error('historical review header must show only the full file path')
tailRoot.unmount()
tailRootEl.remove()

// ---- scenario 0: no targets → no UI ----
worktrees = [wt('draft')]
render(sessionWithTargets([], false))
await waitFor('no UI without targets', () => q('.uvf_root') === null && q('.uvf_panel') === null)

// ---- scenario 0a: new opens a trunk window; reads alone do not open one ----
worktrees = []
render(sessionWithFiles([turnFile(DEMO_FILE, null, 'new')], true))
await waitFor('new 主动拉起当前版本浮窗', () => q('.uvf_win') !== null && q('.uvf_frame')?.getAttribute('src') === ZH_LIVE_TRUNK_URL)
if (q('.uvf_root')?.parentElement !== document.body) throw new Error('floating windows must portal outside the input dock')
if (q('.uvf_chip')?.getAttribute('data-status') !== 'trunk') throw new Error('new window must identify the current version')
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
render(sessionWithTargets([{ file: 'work_班级成绩表/班级管理.univer', worktreeId: WORKTREE }], false))
await waitFor('相对路径解析后出现审阅面板', () => q('.uvf_panel') !== null)
if (!reviewRootEl.contains(q('.uvf_panel'))) throw new Error('review panel must render at the Turn tail, not in the input dock')
if (!stateRequests.includes(REL_DEMO_FILE)) throw new Error('relative target must be polled as absolute: ' + stateRequests.join(', '))
await waitFor('相对路径卡片状态完成切换', () => q('.uvf_panelWorktree')?.textContent === 'v3smoke' && q('.uvf_panelMeta')?.textContent === REL_DEMO_FILE)

// ---- scenario 0c: Win32 separator variants identify one floating window ----
worktrees = [wt('ready')]
render(sessionWithFiles([
  turnFile('学生成绩表.univer', WORKTREE),
  turnFile(WINDOWS_FILE.replaceAll('\\', '/'), WORKTREE),
], true), true, WINDOWS_CWD)
await waitFor('Windows 分隔符去重为一个浮窗', () => qa('.uvf_win').length === 1)
if (!stateRequests.includes(WINDOWS_FILE)) throw new Error('Win32 target must be polled with native separators: ' + stateRequests.join(', '))

// ---- scenario 0d: later reads cannot erase a ready transition in the same Turn ----
worktrees = [wt('ready')]
const readyThenReads = turnFile(DEMO_FILE, WORKTREE, 'worktree', 'ready')
readyThenReads.operations.push(
  { ...operation('inspect', WORKTREE, null, UNITS[0].unitId), file: DEMO_FILE },
  { ...operation('status', null), file: DEMO_FILE },
)
render(sessionWithFiles([readyThenReads], false))
await waitFor('ready 后读取仍展示合并预览', () => q('.uvf_panelFrame')?.getAttribute('src') === ZH_FULL_DEFAULT_MERGE_URL)

// ---- scenario 1: draft → floating window with live iframe ----
worktrees = [wt('merged', 'wt-other-000001'), wt('draft')]
const liveDraftSession = sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], true)
render(liveDraftSession)
await waitFor('draft 浮窗出现', () => q('.uvf_win') !== null)
if (q('.uvf_frame')?.getAttribute('src') !== ZH_DEFAULT_UNIT_URL) throw new Error('window iframe must default to the changed unit in the DSH locale')
{
  const chips = Array.from(document.querySelectorAll('.uvf_win .uvf_unit'))
  if (chips.length !== 3) throw new Error('unit chips missing: ' + chips.length)
  if ((chips[2].textContent ?? '').includes('删') === false || (chips[2].textContent ?? '').includes('u-gone')) {
    throw new Error('nameless deleted chip must show the kind label, not the unitId: ' + chips[2].textContent)
  }
  if (chips[0].className.includes('uvf_unit_on') === false) throw new Error('default chip must be the first changed unit')
  if (chips[0].getAttribute('data-kind') !== 'modified') throw new Error('chip must carry its change kind')
  if ((chips[0].textContent ?? '').includes('销售') === false) throw new Error('chip must name the unit')
  chips[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor('切换 unit 后 iframe 跟随', () => q('.uvf_frame')?.getAttribute('src') === ZH_SLIDE_UNIT_URL)
}
if ((q('.uvf_windowTitle')?.textContent ?? '').includes('v3smoke') === false) throw new Error('title must name the draft worktree')
if (qa('.uvf_win').length !== 1) throw new Error('worktrees the session never mentioned must stay hidden')
if (q('.uvf_panel') === null) throw new Error('the unified Turn card must exist while the worktree is draft')

// ---- scenario 1b: DSH locale switch updates shell copy and the live Viewer in place ----
{
  const frame = q('.uvf_frame')
  activeLocale = 'en'
  localeRevision += 1
  render(liveDraftSession, false)
  await waitFor('浮窗切换英文', () => q('.uvf_chip')?.textContent === 'Editing' && q('[data-window-action=close]')?.getAttribute('title') === 'Close')
  if (q('.uvf_frame') !== frame) throw new Error('locale switch must preserve the live iframe element')
  if (q('.uvf_frame')?.getAttribute('src') !== EN_SLIDE_UNIT_URL) throw new Error('live Viewer must receive en-US after DSH switches to English')
  activeLocale = 'zh'
  localeRevision += 1
  render(liveDraftSession, false)
  await waitFor('浮窗切回中文', () => q('.uvf_chip')?.textContent === '修改中' && q('.uvf_frame')?.getAttribute('src') === ZH_SLIDE_UNIT_URL)
}

// ---- scenario 2: window controls / drag / bounded eight-way resize ----
{
  const win = q('.uvf_win')
  const header = q('.uvf_windowHeader')
  const px = (property) => Number.parseFloat(win.style[property])
  if (px('width') !== 560 || px('height') !== 420) throw new Error('window must use the new default geometry')
  if (qa('.uvf_resizeHandle').map((handle) => handle.getAttribute('data-direction')).join(',') !== 'nw,n,ne,w,e,sw,s,se') {
    throw new Error('window must expose all eight resize directions')
  }
  // Double-clicking the title bar maximizes; the explicit control restores.
  header.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, button: 0 }))
  await waitFor('双击标题栏放大', () => win.className.includes('uvf_win_max'))
  q('[data-window-action=maximize]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor('还原', () => win.className.includes('uvf_win_max') === false)
  // Dragging updates viewport coordinates and never changes display mode.
  const dragStart = { left: px('left'), top: px('top') }
  header.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 8, clientX: 100, clientY: 20 }))
  header.dispatchEvent(new dom.window.PointerEvent('pointermove', { bubbles: true, pointerId: 8, clientX: 60, clientY: 170 }))
  header.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 8 }))
  await waitFor('拖拽位移写入视口坐标', () => px('left') === dragStart.left - 40 && px('top') === dragStart.top + 150)
  if (win.className.includes('uvf_win_max')) throw new Error('drag must not maximize')
  // Fold hides the body without unmounting or reloading the Viewer iframe.
  const frameBeforeFold = q('.uvf_frame')
  q('[data-window-action=fold]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor('折叠后只显示标题条', () => q('.uvf_win') !== null && q('.uvf_win').className.includes('uvf_win_folded') && q('.uvf_windowBody')?.hidden === true)
  if (q('.uvf_frame') !== frameBeforeFold) throw new Error('fold must keep the Viewer iframe mounted')
  q('[data-window-action=fold]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor('展开后 Viewer 恢复', () => q('.uvf_windowBody')?.hidden === false)
  if (q('.uvf_frame') !== frameBeforeFold) throw new Error('expand must reuse the loaded Viewer iframe')
  // South-east grows both dimensions without moving the north-west corner.
  {
    const handle = q('[data-direction=se]')
    if (handle === null) throw new Error('se resize handle missing')
    const start = { left: px('left'), top: px('top'), width: px('width'), height: px('height') }
    handle.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 9, clientX: 500, clientY: 400 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointermove', { bubbles: true, pointerId: 9, clientX: 540, clientY: 480 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 9 }))
    await waitFor('右下角缩放生效', () => px('left') === start.left && px('top') === start.top && px('width') === start.width + 40 && px('height') === start.height + 80)
  }
  // North-west moves the origin while keeping the opposite corner fixed.
  {
    const handle = q('[data-direction=nw]')
    if (handle === null) throw new Error('nw resize handle missing')
    const start = { left: px('left'), top: px('top'), width: px('width'), height: px('height') }
    handle.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 10, clientX: 100, clientY: 100 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointermove', { bubbles: true, pointerId: 10, clientX: 160, clientY: 140 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 10 }))
    await waitFor('左上角缩放生效', () => px('left') === start.left + 60 && px('top') === start.top + 40 && px('width') === start.width - 60 && px('height') === start.height - 40)
  }
  // East and south edges resize independently.
  {
    const handle = q('[data-direction=e]')
    if (handle === null) throw new Error('east resize handle missing')
    const start = { left: px('left'), width: px('width') }
    handle.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 13, clientX: 200, clientY: 200 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointermove', { bubbles: true, pointerId: 13, clientX: 160, clientY: 200 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 13 }))
    await waitFor('右边缘缩放生效', () => px('left') === start.left && px('width') === start.width - 40)
  }
  {
    const handle = q('[data-direction=s]')
    if (handle === null) throw new Error('south resize handle missing')
    const start = { width: px('width'), height: px('height') }
    handle.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 12, clientX: 200, clientY: 340 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointermove', { bubbles: true, pointerId: 12, clientX: 200, clientY: 380 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 12 }))
    await waitFor('底边缘缩放生效', () => px('height') === start.height + 40 && px('width') === start.width)
  }
  // Dragging and resizing clamp to the viewport and react to viewport changes.
  header.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 14, clientX: 100, clientY: 100 }))
  header.dispatchEvent(new dom.window.PointerEvent('pointermove', { bubbles: true, pointerId: 14, clientX: -10000, clientY: -10000 }))
  header.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 14 }))
  await waitFor('拖拽夹紧到视口左上角', () => px('left') === 12 && px('top') === 12)
  {
    const handle = q('[data-direction=w]')
    handle.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 15, clientX: 0, clientY: 100 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointermove', { bubbles: true, pointerId: 15, clientX: 10000, clientY: 100 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 15 }))
    await waitFor('缩放夹紧到最小宽度', () => px('width') === 360)
  }
  dom.window.innerWidth = 700
  dom.window.innerHeight = 520
  dom.window.dispatchEvent(new dom.window.Event('resize'))
  await waitFor('视口缩小后窗口仍可见', () => px('left') >= 12 && px('top') >= 12 && px('left') + px('width') <= 688 && px('top') + px('height') <= 508)
  dom.window.innerWidth = 1440
  dom.window.innerHeight = 1000
  dom.window.dispatchEvent(new dom.window.Event('resize'))
  // Dismiss removes the window while the status stays draft.
  q('[data-window-action=close]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor('关闭后浮窗消失', () => q('.uvf_win') === null)
}

// ---- scenario 3: ready + session running → window stays with ready chip ----
worktrees = [wt('ready')]
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], true))
await waitFor('ready 且运行中浮窗保留', () => q('.uvf_win') !== null)
if ((q('.uvf_chip')?.textContent ?? '') !== '待确认') throw new Error('ready chip must say 待确认 while running')
if (q('.uvf_panel') === null) throw new Error('the unified Turn card must exist while the session is running')

// ---- scenario 3b: draft + session end → review dock with mark-ready ----
worktrees = [wt('draft')]
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
await waitFor('draft 审阅面板出现（会话结束后）', () => q('.uvf_panel') !== null)
await waitFor('draft 会话结束后浮窗关闭', () => q('.uvf_win') === null)
if (q('.uvf_panelFrame')?.getAttribute('src') !== ZH_FULL_DEFAULT_UNIT_URL) throw new Error('draft card must embed the full localized worktree page at the changed unit')
if ((q('.uvf_panelChip')?.textContent ?? '') !== '修改中') throw new Error('draft panel chip must match the Viewer status wording')
if (q('.uvf_panelPageKind') !== null) throw new Error('review header must not repeat the embedded page type')
if (q('.uvf_panelWorktree')?.textContent !== 'v3smoke') throw new Error('draft panel must place the worktree name beside the file name')
if (q('.uvf_panelMeta')?.textContent !== DEMO_FILE) throw new Error('review header metadata must contain only the full file path')
if (q('.uvf_panelFoot') !== null || q('.uvf_action') !== null) throw new Error('card must defer lifecycle actions to the embedded Viewer')
q('[data-panel-action=fullscreen]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
await waitFor('审阅面板进入全屏', () => q('.uvf_panel')?.className.includes('uvf_panel_fullscreen') === true)
if (q('[data-panel-action=fullscreen]')?.getAttribute('aria-label') !== '退出全屏') throw new Error('fullscreen control must expose its current action')
if (q('[data-panel-action=fold]') !== null) throw new Error('fullscreen review card must hide the fold control')
dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }))
await waitFor('Escape 退出审阅全屏', () => q('.uvf_panel')?.className.includes('uvf_panel_fullscreen') === false)
if (q('[data-panel-action=fold]') === null) throw new Error('fold control must return after exiting fullscreen')
{
  const frame = q('.uvf_panelFrame')
  q('[data-panel-action=fold]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor('审阅卡片折叠完整页面', () => q('.uvf_panelContent')?.hidden === true)
  if (q('[data-panel-action=fold]')?.getAttribute('aria-label') !== '展开') throw new Error('fold control must expose the expand action')
  if (q('.uvf_panelFrame') !== frame) throw new Error('folding must keep the full Univer page mounted')
  q('[data-panel-action=fold]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor('审阅卡片重新展开', () => q('.uvf_panelContent')?.hidden === false)
}
{
  const frame = q('.uvf_panelFrame')
  const reviewSession = sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false)
  activeLocale = 'en'
  localeRevision += 1
  render(reviewSession, false)
  await waitFor('审阅卡片切换英文', () => q('.uvf_panelFrame')?.getAttribute('src') === EN_FULL_DEFAULT_UNIT_URL)
  if (q('.uvf_panelWorktree')?.textContent !== 'v3smoke' || q('.uvf_panelMeta')?.textContent !== DEMO_FILE) throw new Error('locale switch must preserve the compact file and worktree header')
  if (q('.uvf_panelFrame') !== frame) throw new Error('locale switch must preserve the review iframe element')
  activeLocale = 'zh'
  localeRevision += 1
  render(reviewSession, false)
  await waitFor('审阅卡片切回中文', () => q('.uvf_panelFrame')?.getAttribute('src') === ZH_FULL_DEFAULT_UNIT_URL)
}
// ---- scenario 4: ready + session end → window closes, merge panel embeds ----
worktrees = [wt('ready')]
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
await waitFor('会话结束后浮窗关闭', () => q('.uvf_win') === null)
await waitFor('合并预览面板出现', () => q('.uvf_panel') !== null)
await waitFor('卡片嵌入完整合并页', () => q('.uvf_panelFrame')?.getAttribute('src') === ZH_FULL_DEFAULT_MERGE_URL)
if (q('.uvf_panelWorktree')?.textContent !== 'v3smoke') throw new Error('card must place the ready worktree beside the file name')
if ((q('.uvf_panelChip')?.textContent ?? '') !== '待确认') throw new Error('panel chip must say 待确认')
if (q('.uvf_action') !== null) throw new Error('ready card must not duplicate the mergePreview page actions')

// ---- scenario 4b: Viewer merge result → terminal review card remains ----
worktrees = [wt('merged')]
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
await waitFor('Viewer merge 后保留终态卡片', () => (q('.uvf_panelChip')?.textContent ?? '') === '已合入')
if (q('.uvf_panel')?.getAttribute('data-status') !== 'merged') throw new Error('merged review card must expose its terminal status')
if (q('.uvf_panelMeta')?.textContent !== DEMO_FILE) throw new Error('merged review card header metadata must remain the full file path')
if (q('.uvf_panelFrame')?.getAttribute('src') !== ZH_TRUNK_URL) throw new Error('merged review card must keep the full mainline page open')
if (q('.uvf_action') !== null || q('[data-panel-action=fullscreen]') === null) throw new Error('merged review card must remove actions but preserve fullscreen')
await new Promise((resolvePromise) => setTimeout(resolvePromise, 900))
if (q('.uvf_win') !== null) throw new Error('merged worktree must not open a window')

// ---- scenario 4c: Viewer discard result → terminal review card remains ----
worktrees = [wt('discarded')]
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
await waitFor('Viewer discard 后保留终态卡片', () => (q('.uvf_panelChip')?.textContent ?? '') === '已丢弃')
if (q('.uvf_panel')?.getAttribute('data-status') !== 'discarded') throw new Error('discarded review card must expose its terminal status')
if (q('.uvf_panelFrame')?.getAttribute('src') !== ZH_TRUNK_URL || q('.uvf_action') !== null) throw new Error('discarded review card must show mainline without mutation actions')
await new Promise((resolvePromise) => setTimeout(resolvePromise, 900))
if (q('.uvf_win') !== null) throw new Error('discarded worktree must not open a window')

// ---- scenario 5: replayed merged worktree → terminal card ----
worktrees = [wt('merged')]
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
await waitFor('历史 merged worktree 显示终态卡片', () => q('.uvf_panel')?.getAttribute('data-status') === 'merged')
if (q('.uvf_win') !== null || q('.uvf_panelFrame')?.getAttribute('src') !== ZH_TRUNK_URL) throw new Error('replayed merged card must open the full mainline page')

// ---- scenario 6: targets cleared → everything closes ----
render(sessionWithTargets([], false))
await waitFor('targets 清空后全部关闭', () => q('.uvf_win') === null && q('.uvf_panel') === null)

reactRoot.unmount()
reviewRoot.unmount()
server.close()
console.log(`client smoke OK (${conversationApi} Conversation API)`)
