// Client-half smoke (dock float + merge panel): jsdom + real React + mock ctx
// + a fake /univer-api HTTP server. Covers: target discovery from the
// conversation snapshot → polling → draft floating window (live iframe deep
// link) → click-to-maximize / fold / drag / dismiss → ready + session end
// closes the window and embeds the merge panel → merged panel shows trunk.
//
//   node test/client-smoke.mjs
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const root = dirname(here)
// jsdom/react/react-dom come from this repo's devDependencies.
const repoRequire = createRequire(import.meta.url)
const { JSDOM } = repoRequire('jsdom')

// ---- fake loopback API (node half's /univer-api) ----
const DEMO_FILE = join(tmpdir(), 'dsh-univer-client-smoke', 'demo.univer')
const WORKTREE = 'wt-msvqmweb-47hcdg'
const OPEN_URL = 'http://127.0.0.1:9123/?file=KEY&worktree=wt-msvqmweb-47hcdg'
const VIEW_URL = 'http://127.0.0.1:9123/?file=KEY&worktree=wt-msvqmweb-47hcdg&mode=embedded&scope=worktree'
const MERGE_URL = 'http://127.0.0.1:9123/?file=KEY&worktree=wt-msvqmweb-47hcdg&mode=embedded&scope=mergePreview'
const UNITS = [
  { unitId: 'u-msvo3wpe-p4pqi4', name: '销售', type: 2, kind: 'modified', worktreeUrl: VIEW_URL + '&unit=u-msvo3wpe-p4pqi4', mergeUrl: MERGE_URL + '&unit=u-msvo3wpe-p4pqi4' },
  { unitId: 'u-msvy1lry-dv3hia', name: '班级成绩汇报', type: 3, kind: 'added', worktreeUrl: VIEW_URL + '&unit=u-msvy1lry-dv3hia', mergeUrl: MERGE_URL + '&unit=u-msvy1lry-dv3hia' },
  { unitId: 'u-gone-000001', name: '', type: 2, kind: 'deleted', worktreeUrl: VIEW_URL + '&unit=u-gone-000001', mergeUrl: MERGE_URL + '&unit=u-gone-000001' },
]
const DEFAULT_UNIT_URL = VIEW_URL + '&unit=' + encodeURIComponent(UNITS[0].unitId)
const SLIDE_UNIT_URL = VIEW_URL + '&unit=' + encodeURIComponent(UNITS[1].unitId)
const DEFAULT_MERGE_URL = MERGE_URL + '&unit=' + encodeURIComponent(UNITS[0].unitId)
let worktrees = []
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
  viewerUrl: 'http://127.0.0.1:9123/?file=KEY',
  worktrees,
})
const actionLog = []
let failMerge = false
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
    if (file !== DEMO_FILE && file !== REL_DEMO_FILE) {
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
    actionLog.push(body)
    if (failMerge && body.action === 'merge') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, reason: '销售图表 与 trunk 冲突，无法合并', state: currentState() }))
      return
    }
    const next = body.action === 'merge' ? 'merged' : body.action === 'reopen' ? 'draft' : body.action === 'ready' ? 'ready' : null
    worktrees = worktrees
      .filter((item) => body.action !== 'discard' || item.worktreeId !== body.worktreeId)
      .map((item) => (item.worktreeId === body.worktreeId && next !== null ? wt(next) : item))
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

const React = repoRequire('react')
const jsxRuntime = repoRequire('react/jsx-runtime')
const { createRoot } = repoRequire('react-dom/client')

let pluginExports = null
dom.window.__ModuleLoader__ = {
  load({ id, factory }) {
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
      return (key) => (localeDicts?.dicts.zh[key] ?? key)
    },
  },
  conversationEvents: {
    register(definition) {
      conversationDefinition = definition
      return () => {}
    },
  },
}
pluginExports.apply(fakeCtx)
const dockEntry = slotEntries.find((entry) => entry.options.name === 'conversation.input.dock' && entry.options.id === 'univer-dock')
const tailEntry = slotEntries.find((entry) => entry.options.name === 'conversation.chat.turnTail' && entry.options.id === 'univer')
if (dockEntry === undefined) throw new Error('dock entry missing: ' + slotEntries.map((e) => e.options.name + '/' + e.options.id).join(','))
if (tailEntry === undefined) throw new Error('turn-tail entry missing (existing preview card must stay registered)')
if (localeDicts === null || localeDicts.ns !== 'univer') throw new Error('locale dictionaries not registered')
if (conversationDefinition === null || conversationDefinition.kind !== 'univerTarget') throw new Error('conversationEvents definition not registered')

// ---- definition pure-accumulator sanity (replay-safe, unchanged behavior) ----
{
  const def = conversationDefinition
  const mkContext = (state) => ({ state, key: '', kind: 'univerTarget', id: '7', matches: [], start: undefined, current: new Map() })
  const startMatch = { id: '7', role: 'start', event: { type: 'turn/start', data: { turn: 7 } }, location: { kind: 'turn', turn: 7 } }
  let state = def.start({ state: undefined }, startMatch, { previous: () => undefined })
  if (state.turn !== 7 || state.targets.length !== 0) throw new Error('definition start state wrong')
  const univerCall = {
    id: '7', role: 'update', location: { kind: 'turn', turn: 7 },
    event: { type: 'tool/call', data: { turn: 7, name: 'univer_execute', arguments: JSON.stringify({ file: '/x/proj/notes/demo.univer', worktreeId: 'wt-abc12345', unitId: 'unit-1', code: 'return null;' }) } },
  }
  state = def.update(mkContext(state), univerCall)
  if (state.targets.length !== 1 || state.targets[0].file !== '/x/proj/notes/demo.univer' || state.targets[0].worktreeId !== 'wt-abc12345') throw new Error('structured target extraction wrong: ' + JSON.stringify(state.targets))
  const locationData = def.buildLocationData(mkContext(state), 'turn')
  if (locationData === null || locationData.key !== 'univerTarget' || locationData.value.targets.length !== 1) throw new Error('buildLocationData wrong')
}

// ---- render harness ----
const zh = localeDicts.dicts.zh
const t = (key) => zh[key] ?? key
const sessionWithTargets = (targets, running) => ({
  sessionId: 'test-session-id',
  running,
  chat: { timeline: { turns: new Map([[3, { data: { get: (key) => (key === 'univerTarget' ? { turn: 3, targets } : undefined) } }]]) } },
})
const rootEl = document.createElement('div')
document.body.appendChild(rootEl)
const reactRoot = createRoot(rootEl)
const SESSION_CWD = join(tmpdir(), 'dsh-univer-client-smoke', 'workdir')
const REL_DEMO_FILE = SESSION_CWD + '/work_班级成绩表/班级管理.univer'
let scenario = 0
function render(session) {
  scenario += 1
  reactRoot.render(React.createElement(dockEntry.Component, {
    key: 's' + scenario,
    session,
    t,
    sessionId: 'test-session-id',
    useSessions: (selector) => selector({ byId: { 'test-session-id': { cwd: SESSION_CWD } } }),
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
tailRoot.render(React.createElement(tailEntry.Component, {
  matched: { targets: [{ file: DEMO_FILE, worktreeId: WORKTREE }] },
  sessionId: 'test-session-id',
  t,
}))
await waitFor('回合尾部预览卡片', () => q('.unvT_expandBtn') !== null)
q('.unvT_expandBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await waitFor('完整 Viewer 页面', () => q('.unvT_frame')?.getAttribute('src') === OPEN_URL)
tailRoot.unmount()
tailRootEl.remove()

// ---- scenario 0: no targets → no UI ----
worktrees = [wt('draft')]
render(sessionWithTargets([], false))
await waitFor('no UI without targets', () => q('.uvf_root') === null && q('.uvf_panel') === null)

// ---- scenario 0b: relative target resolves against the session cwd ----
worktrees = [wt('ready')]
render(sessionWithTargets([{ file: 'work_班级成绩表/班级管理.univer', worktreeId: WORKTREE }], false))
await waitFor('相对路径解析后出现审阅面板', () => q('.uvf_panel') !== null)
if (stateRequests.at(-1) !== REL_DEMO_FILE) throw new Error('relative target must be polled as absolute: ' + stateRequests.join(', '))
if ((q('.uvf_panelTitle')?.textContent ?? '').includes('v3smoke') === false) throw new Error('panel must name the worktree')

// ---- scenario 1: draft → floating window with live iframe ----
worktrees = [wt('merged', 'wt-other-000001'), wt('draft')]
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], true))
await waitFor('draft 浮窗出现', () => q('.uvf_win') !== null)
if (q('.uvf_frame')?.getAttribute('src') !== DEFAULT_UNIT_URL) throw new Error('window iframe must default to the changed unit')
{
  const chips = qa('.uvf_unit')
  if (chips.length !== 3) throw new Error('unit chips missing: ' + chips.length)
  if ((chips[2].textContent ?? '').includes('删') === false || (chips[2].textContent ?? '').includes('u-gone')) {
    throw new Error('nameless deleted chip must show the kind label, not the unitId: ' + chips[2].textContent)
  }
  if (chips[0].className.includes('uvf_unit_on') === false) throw new Error('default chip must be the first changed unit')
  if (chips[0].getAttribute('data-kind') !== 'modified') throw new Error('chip must carry its change kind')
  if ((chips[0].textContent ?? '').includes('销售') === false) throw new Error('chip must name the unit')
  chips[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor('切换 unit 后 iframe 跟随', () => q('.uvf_frame')?.getAttribute('src') === SLIDE_UNIT_URL)
}
if ((q('.uvf_title')?.textContent ?? '').includes('v3smoke') === false) throw new Error('title must name the draft worktree')
if (qa('.uvf_win').length !== 1) throw new Error('worktrees the session never mentioned must stay hidden')
if (q('.uvf_panel') !== null) throw new Error('no merge panel while the worktree is draft')

// ---- scenario 2: click-to-maximize / fold / drag / dismiss ----
{
  const win = q('.uvf_win')
  const bar = q('.uvf_bar')
  // Click (press + release without movement) maximizes.
  bar.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 7, clientX: 100, clientY: 20 }))
  bar.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientX: 100, clientY: 20 }))
  await waitFor('点击标题栏放大', () => win.className.includes('uvf_win_max'))
  qa('.uvf_btn')[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor('还原', () => win.className.includes('uvf_win_max') === false)
  // Drag: movement beyond the slop moves the window, not maximize.
  bar.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 8, clientX: 100, clientY: 20 }))
  bar.dispatchEvent(new dom.window.PointerEvent('pointermove', { bubbles: true, pointerId: 8, clientX: 60, clientY: 170 }))
  bar.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 8 }))
  await waitFor('拖拽位移写入 transform', () => (q('.uvf_win').style.transform ?? '').includes('translate(-40px, 150px)'))
  if (q('.uvf_win').className.includes('uvf_win_max')) throw new Error('drag must not maximize')
  // Fold collapses the window to its bar (class + no inline size + no iframe).
  qa('.uvf_btn')[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor('折叠后只剩标题条', () => q('.uvf_win') !== null && q('.uvf_win').className.includes('uvf_win_folded') && q('.uvf_frame') === null)
  if ((q('.uvf_win').style.width ?? '') !== '') throw new Error('folded window must drop its inline size')
  qa('.uvf_btn')[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor('展开后 iframe 恢复', () => q('.uvf_frame') !== null)
  // Corner handle resizes the window (clamped to the bounds).
  {
    const handle = q('.uvf_h_se')
    if (handle === null) throw new Error('se resize handle missing')
    handle.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 9, clientX: 480, clientY: 340 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointermove', { bubbles: true, pointerId: 9, clientX: 580, clientY: 420 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 9 }))
    await waitFor('拖角缩放生效', () => (q('.uvf_win').style.width === '580px' && q('.uvf_win').style.height === '420px'))
  }
  // Bottom-left corner: width/height shrink; the RIGHT edge stays fixed, so
  // the x offset must NOT change (right-anchored stack).
  {
    const handle = q('.uvf_h_sw')
    if (handle === null) throw new Error('sw resize handle missing')
    handle.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 10, clientX: 100, clientY: 420 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointermove', { bubbles: true, pointerId: 10, clientX: 160, clientY: 340 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 10 }))
    await waitFor('左下角缩放生效', () => (q('.uvf_win').style.width === '520px' && q('.uvf_win').style.height === '340px' && (q('.uvf_win').style.transform ?? '').includes('translate(60px, 150px)')))
  }
  // Left edge: width shrinks, right edge still fixed (x unchanged).
  {
    const handle = q('.uvf_h_w')
    if (handle === null) throw new Error('west resize handle missing')
    handle.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 11, clientX: 100, clientY: 200 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointermove', { bubbles: true, pointerId: 11, clientX: 140, clientY: 200 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 11 }))
    await waitFor('左边缘缩放生效', () => (q('.uvf_win').style.width === '480px' && (q('.uvf_win').style.transform ?? '').includes('translate(60px, 150px)')))
  }
  // Right edge: width grows and the window shifts right (left edge fixed).
  {
    const handle = q('.uvf_h_e')
    if (handle === null) throw new Error('east resize handle missing')
    handle.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 13, clientX: 200, clientY: 200 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointermove', { bubbles: true, pointerId: 13, clientX: 240, clientY: 200 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 13 }))
    await waitFor('右边缘缩放生效', () => (q('.uvf_win').style.width === '520px' && (q('.uvf_win').style.transform ?? '').includes('translate(100px, 150px)')))
  }
  // Bottom edge: height grows, width stays.
  {
    const handle = q('.uvf_h_s')
    if (handle === null) throw new Error('south resize handle missing')
    handle.dispatchEvent(new dom.window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 12, clientX: 200, clientY: 340 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointermove', { bubbles: true, pointerId: 12, clientX: 200, clientY: 380 }))
    handle.dispatchEvent(new dom.window.PointerEvent('pointerup', { bubbles: true, pointerId: 12 }))
    await waitFor('底边缘缩放生效', () => (q('.uvf_win').style.height === '380px' && q('.uvf_win').style.width === '520px'))
  }
  // Dismiss removes the window while the status stays draft.
  qa('.uvf_btn')[2].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await waitFor('关闭后浮窗消失', () => q('.uvf_win') === null)
}

// ---- scenario 3: ready + session running → window stays with ready chip ----
worktrees = [wt('ready')]
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], true))
await waitFor('ready 且运行中浮窗保留', () => q('.uvf_win') !== null)
if ((q('.uvf_chip')?.textContent ?? '') !== '待确认') throw new Error('ready chip must say 待确认 while running')
if (q('.uvf_panel') !== null) throw new Error('no merge panel while the session is running')

// ---- scenario 3b: draft + session end → review dock with mark-ready ----
worktrees = [wt('draft')]
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
await waitFor('draft 审阅面板出现（会话结束后）', () => q('.uvf_panel') !== null)
if (q('.uvf_win') !== null) throw new Error('no floating window for a draft worktree after session end')
if (q('.uvf_panelFrame')?.getAttribute('src') !== DEFAULT_UNIT_URL) throw new Error('draft panel must embed the live worktree page at the changed unit')
if ((q('.uvf_panelChip')?.textContent ?? '') !== '修改中') throw new Error('draft panel chip must match the Viewer status wording')
if ((q('.uvf_hint')?.textContent ?? '').includes('提交确认') === false) throw new Error('draft panel must use the Viewer confirmation wording')
{
  const kinds = qa('.uvf_action').map((el) => el.getAttribute('data-kind'))
  if (kinds.includes('ready') === false || kinds.includes('discard') === false || kinds.includes('merge') === true) {
    throw new Error('draft panel actions wrong: ' + kinds.join(','))
  }
}
q('.uvf_action[data-kind=ready]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
await waitFor('标记 ready 后切到合并预览', () => q('.uvf_panelFrame')?.getAttribute('src') === DEFAULT_MERGE_URL)
if ((q('.uvf_panelChip')?.textContent ?? '') !== '待确认') throw new Error('panel chip must switch to 待确认')
if (q('.uvf_action[data-kind=merge]') === null) throw new Error('merge action must appear once marked ready')

// ---- scenario 4: ready + session end → window closes, merge panel embeds ----
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
await waitFor('会话结束后浮窗关闭', () => q('.uvf_win') === null)
await waitFor('合并预览面板出现', () => q('.uvf_panel') !== null)
if (q('.uvf_panelFrame')?.getAttribute('src') !== DEFAULT_MERGE_URL) throw new Error('panel iframe must embed the mergePreview page at the changed unit')
if ((q('.uvf_panelTitle')?.textContent ?? '').includes('v3smoke') === false) throw new Error('panel must name the ready worktree')
if ((q('.uvf_panelChip')?.textContent ?? '') !== '待确认') throw new Error('panel chip must say 待确认')
{
  const kinds = qa('.uvf_action').map((el) => el.getAttribute('data-kind'))
  if (kinds.includes('merge') === false || kinds.includes('reopen') === false || kinds.includes('discard') === false) {
    throw new Error('review action buttons missing: ' + kinds.join(','))
  }
}

// ---- scenario 4a: reopen → back to the draft review panel ----
worktrees = [wt('ready')]
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
await waitFor('ready 面板出现（reopen 场景）', () => q('.uvf_action[data-kind=reopen]') !== null)
q('.uvf_action[data-kind=reopen]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
await waitFor('reopen 请求发出', () => actionLog.some((entry) => entry.action === 'reopen'))
await waitFor('恢复编辑后回到 draft 审阅面板', () => q('.uvf_panelChip')?.textContent === '修改中')
if (q('.uvf_win') !== null) throw new Error('no floating window for a draft worktree after session end')
if (q('.uvf_action[data-kind=ready]') === null) throw new Error('draft panel must offer mark-ready after reopen')

// ---- scenario 4b: merge conflict → error shown, panel stays ----
failMerge = true
worktrees = [wt('ready')]
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
await waitFor('ready 面板出现（冲突场景）', () => q('.uvf_action[data-kind=merge]') !== null)
q('.uvf_action[data-kind=merge]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
await waitFor('冲突错误显示', () => (q('.uvf_error')?.textContent ?? '').includes('冲突'))
if (q('.uvf_panel') === null) throw new Error('panel must stay after a failed merge')
failMerge = false

// ---- scenario 4c: merge success → terminal, nothing renders anywhere ----
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
await waitFor('面板出现（merge 成功场景）', () => q('.uvf_panel') !== null)
q('.uvf_action[data-kind=merge]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
await waitFor('merge 后面板关闭', () => q('.uvf_panel') === null)
await new Promise((resolvePromise) => setTimeout(resolvePromise, 900))
if (q('.uvf_win') !== null) throw new Error('merged worktree must not open a window')

// ---- scenario 4d: discard → panel closes, no window ----
worktrees = [wt('ready')]
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
// The same component instance survives root re-renders; wait for the poll to
// replace the merged state with the ready state before clicking.
await waitFor('ready 面板出现（discard 场景）', () => q('.uvf_action[data-kind=discard]') !== null)
q('.uvf_action[data-kind=discard]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
await waitFor('discard 后面板关闭', () => q('.uvf_panel') === null)
await new Promise((resolvePromise) => setTimeout(resolvePromise, 900))
if (q('.uvf_win') !== null) throw new Error('discarded worktree must not open a window')

// ---- scenario 5: merged + session end → nothing anywhere ----
worktrees = [wt('merged')]
render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
await new Promise((resolvePromise) => setTimeout(resolvePromise, 1100))
if (q('.uvf_panel') !== null || q('.uvf_win') !== null) throw new Error('merged worktree must render nowhere')

// ---- scenario 6: targets cleared → everything closes ----
render(sessionWithTargets([], false))
await waitFor('targets 清空后全部关闭', () => q('.uvf_win') === null && q('.uvf_panel') === null)

reactRoot.unmount()
server.close()
console.log('client smoke OK')
