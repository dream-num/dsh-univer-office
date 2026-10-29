// Built Client half in jsdom: real React, a mock DSH ctx, and a fake /univer-api HTTP server.
// Covers target discovery from the conversation snapshot → polling → draft floating window (live
// iframe deep link) → maximize / fold / drag / resize / dismiss → ready + session end closes the
// window and embeds the merge panel → terminal cards, plus file-tree and Sidebar previews, legacy
// hosts, and the real Cordis lifecycle. Shared by one test file per Settings API generation.
//
// Scenarios run in order and share the mounted DOM, like a user session.
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeServer, listen } from '../../support/net.ts'
import { pluginRoot, repoPath } from '../../support/paths.ts'

export type SettingsApi = 'settingsScope' | 'configForms'

const repoRequire = createRequire(repoPath('package.json'))

const SESSION_ID = 'test-session-id'
const DEMO_FILE = join(tmpdir(), 'dsh-univer-client-smoke', 'demo.univer')
const SECOND_FILE = join(tmpdir(), 'dsh-univer-client-smoke', 'second.univer')
const SESSION_CWD = join(tmpdir(), 'dsh-univer-client-smoke', 'workdir')
const REL_DEMO_FILE = SESSION_CWD + '/work_班级成绩表/班级管理.univer'
const WINDOWS_CWD = 'C:\\Users\\17361\\Documents\\DSH'
const WINDOWS_FILE = WINDOWS_CWD + '\\学生成绩表.univer'
const WORKTREE = 'wt-msvqmweb-47hcdg'
const OPEN_URL = 'http://127.0.0.1:9123/?file=KEY&worktree=wt-msvqmweb-47hcdg'
const VIEW_URL =
  'http://127.0.0.1:9123/?file=KEY&worktree=wt-msvqmweb-47hcdg&mode=embedded&scope=worktree'
const MERGE_URL =
  'http://127.0.0.1:9123/?file=KEY&worktree=wt-msvqmweb-47hcdg&mode=embedded&scope=mergePreview'
const TRUNK_URL = 'http://127.0.0.1:9123/?file=KEY'
const withLang = (url: string, lang: string) => {
  const target = new URL(url)
  target.searchParams.set('lang', lang)
  return target.toString()
}
const asReviewPage = (url: string) => {
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
const DEFAULT_UNIT_URL = VIEW_URL + '&unit=' + encodeURIComponent(UNITS[0]!.unitId)
const SLIDE_UNIT_URL = VIEW_URL + '&unit=' + encodeURIComponent(UNITS[1]!.unitId)
const DEFAULT_MERGE_URL = MERGE_URL + '&unit=' + encodeURIComponent(UNITS[0]!.unitId)
const ZH_DEFAULT_UNIT_URL = withLang(DEFAULT_UNIT_URL, 'zh-CN')
const ZH_SLIDE_UNIT_URL = withLang(SLIDE_UNIT_URL, 'zh-CN')
const EN_SLIDE_UNIT_URL = withLang(SLIDE_UNIT_URL, 'en-US')
const ZH_FULL_DEFAULT_UNIT_URL = withLang(asReviewPage(DEFAULT_UNIT_URL), 'zh-CN')
const EN_FULL_DEFAULT_UNIT_URL = withLang(asReviewPage(DEFAULT_UNIT_URL), 'en-US')
const ZH_FULL_DEFAULT_MERGE_URL = withLang(asReviewPage(DEFAULT_MERGE_URL), 'zh-CN')
const ZH_TRUNK_URL = withLang(asReviewPage(TRUNK_URL), 'zh-CN')
const ZH_LIVE_TRUNK_URL = withLang(TRUNK_URL, 'zh-CN')
const SETTINGS_DEFAULTS = { autoOpenLivePreview: true, conversationReviewCards: true }
const SESSION_ADDRESS = 'dsh-resource://file/session/test-session-id/预览演示/月度支出表.univer'

const wt = (status: string, worktreeId = WORKTREE) => ({
  worktreeId,
  name: worktreeId === WORKTREE ? 'v3smoke' : 'other',
  status,
  units: status === 'draft' || status === 'ready' ? UNITS : [],
  ...(status === 'draft' || status === 'ready' ? { openUrl: OPEN_URL, worktreeUrl: VIEW_URL } : {}),
  ...(status === 'ready' ? { mergeUrl: MERGE_URL } : {})
})

/** Encode one `/`-separated path the way the file-resource grammar encodes it. */
const encodeAddressPath = (path: string) =>
  path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

export function defineClientSuite(settingsApi: SettingsApi): void {
  const modernSettings = settingsApi === 'configForms'

  describe(`built Client with the ${settingsApi} Settings API`, () => {
    // ---- fake Host state ----
    let worktrees: any[] = []
    const missingFiles = new Set<string>()
    const stateRequests: Array<string | null> = []
    /** Gateway phase the fake Host reports; a stopped Gateway cannot project Viewer URLs. */
    let gatewayPhase = 'running'
    const currentState = () => ({
      ok: true,
      file: DEMO_FILE,
      gateway: 'http://127.0.0.1:9123',
      gatewayRunning: true,
      viewerUrl: TRUNK_URL,
      worktrees
    })

    // ---- mock ctx state ----
    const slotEntries: Array<{ options: any; Component: any }> = []
    let localeDicts: { ns: string; dicts: Record<string, Record<string, string>> } | null = null
    let conversationDefinition: any = null
    let activeLocale = 'zh'
    let localeRevision = 0
    const localeListeners = new Set<() => void>()
    /** File viewers the Client registered with the optional sidebar service. */
    const sidebarViewers: any[] = []
    /** Native right-Sidebar tab types the Client registered. */
    const nativeTabTypes: any[] = []
    let settingsWriteFailure: 'throw' | 'refuse' | undefined
    const settingsEffects: unknown[] = []
    let settingsRevision = 0
    let settingsValue: Record<string, boolean> = { ...SETTINGS_DEFAULTS }
    let settingsUser: Record<string, boolean> = {}
    const settingsListeners = new Set<() => void>()
    const makeSettingsSnapshot = () => ({
      status: 'ready',
      value: { ...settingsValue },
      base: { ...SETTINGS_DEFAULTS },
      user: settingsUser,
      revision: settingsRevision,
      writable: true,
      mode: 'host'
    })
    let settingsSnapshot: any = makeSettingsSnapshot()
    const notifySettings = () => {
      for (const listener of settingsListeners) listener()
    }
    const settingsScope = {
      getSnapshot(this: unknown) {
        if (this !== settingsScope) throw new Error('SettingsScope.getSnapshot lost its receiver')
        return settingsSnapshot
      },
      subscribe(this: unknown, listener: () => void) {
        if (this !== settingsScope) throw new Error('SettingsScope.subscribe lost its receiver')
        settingsListeners.add(listener)
        return () => settingsListeners.delete(listener)
      },
      async set(field: string, value: unknown) {
        if (settingsWriteFailure === 'throw') throw new Error('transport unavailable')
        if (settingsWriteFailure === 'refuse') return false
        if (!Object.hasOwn(SETTINGS_DEFAULTS, field) || typeof value !== 'boolean')
          throw new Error(`unexpected settings write: ${field}`)
        settingsValue = { ...settingsValue, [field]: value }
        settingsUser = { ...settingsUser, [field]: value }
        settingsRevision += 1
        settingsSnapshot = makeSettingsSnapshot()
        notifySettings()
        return modernSettings ? true : undefined
      },
      async unset(field: string) {
        if (!Object.hasOwn(SETTINGS_DEFAULTS, field))
          throw new Error(`unexpected settings reset: ${field}`)
        settingsValue = {
          ...settingsValue,
          [field]: SETTINGS_DEFAULTS[field as keyof typeof SETTINGS_DEFAULTS]
        }
        const nextUser = { ...settingsUser }
        delete nextUser[field]
        settingsUser = nextUser
        settingsRevision += 1
        settingsSnapshot = makeSettingsSnapshot()
        notifySettings()
      }
    }
    const conversationEventRegistry = {
      register(definition: any) {
        conversationDefinition = definition
        return () => {}
      }
    }
    /** Switch the active locale the way the runtime does: bump the revision and notify. */
    const setActiveLocale = (next: string) => {
      activeLocale = next
      localeRevision += 1
      for (const listener of localeListeners) listener()
    }
    const fakeCtx: any = {
      inject(services: string[], callback: (ctx: any) => unknown) {
        const key = services.join(',')
        if (key === (modernSettings ? 'settingsScope' : 'configForms')) return () => {}
        if (!['settingsScope', 'configForms', 'betterSidebar', 'sidebarRightTabs'].includes(key))
          throw new Error(`unexpected ctx.inject(${JSON.stringify(services)})`)
        return callback(fakeCtx)
      },
      effect(fn: () => unknown) {
        const disposer = fn()
        settingsEffects.push(disposer)
        return () => {
          if (typeof disposer === 'function') disposer()
        }
      },
      slots: {
        register(options: any, Component: any) {
          slotEntries.push({ options, Component })
          return () => {}
        },
        inject(key: string, callback: () => unknown) {
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
        bind(spec: { namespace: string }) {
          if (spec.namespace !== 'univer-office')
            throw new Error(`unexpected settings namespace ${spec.namespace}`)
          return settingsScope
        }
      },
      locale: {
        register(ns: string, dicts: Record<string, Record<string, string>>) {
          localeDicts = { ns, dicts }
          return () => {}
        },
        bind() {
          return (key: string) => localeDicts?.dicts[activeLocale]?.[key] ?? key
        },
        getSnapshot() {
          return { active: activeLocale, revision: localeRevision }
        },
        subscribe(listener: () => void) {
          localeListeners.add(listener)
          return () => localeListeners.delete(listener)
        }
      },
      get(name: string) {
        if (name === 'configForms')
          return {
            get(entryId: string) {
              if (entryId !== 'univer') throw new Error(`unexpected config entry ${entryId}`)
              return settingsScope
            }
          }
        if (name === 'uiConversation') return { events: conversationEventRegistry }
        if (name === 'sidebarRightTabs')
          return {
            register(definition: any) {
              nativeTabTypes.push(definition)
              return () => {}
            }
          }
        if (name === 'betterSidebar')
          return {
            registerFileViewer(descriptor: any) {
              sidebarViewers.push(descriptor)
              return () => {}
            }
          }
        throw new Error(`unexpected ctx.get("${name}")`)
      }
    }

    // ---- harness assigned in beforeAll ----
    let server: Server
    let dom: any
    let document: Document
    let React: any
    let createRoot: (element: Element) => any
    let pluginExports: any
    let dockEntry: any
    let tailEntry: any
    let settingsEntry: any
    let dockInjected: any
    let tailInjected: any
    let settingsInjected: any
    let fileViewer: any
    let nativeTab: any
    let nativeBodyEntry: any
    let reactRoot: any
    let reviewRootEl: HTMLElement
    let reviewRoot: any
    let tailProps: any
    let liveDraftSession: any
    let scenario = 0
    let callSequence = 0

    const t = (key: string) => localeDicts?.dicts[activeLocale]?.[key] ?? key
    const q = (selector: string): any => document.querySelector(selector)
    const qa = (selector: string): any[] => Array.from(document.querySelectorAll(selector))
    const click = (element: Element) =>
      element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    const pointer = (element: Element, type: string, init: Record<string, unknown>) =>
      element.dispatchEvent(new dom.window.PointerEvent(type, { bubbles: true, ...init }))
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
    async function waitFor(description: string, predicate: () => boolean, timeoutMs = 5000) {
      const startedAt = Date.now()
      while (Date.now() - startedAt < timeoutMs) {
        if (predicate()) return
        await sleep(80)
      }
      throw new Error(
        `timeout waiting for: ${description}\nhtml: ${document.body.innerHTML.slice(0, 1500)}`
      )
    }

    const operation = (
      name: string,
      worktreeId: string | null,
      action: string | null = null,
      unitId: string | null = null,
      phase = 'succeeded'
    ) => ({
      callId: `fixture-${++callSequence}`,
      name,
      action,
      file: DEMO_FILE,
      worktreeId,
      unitId,
      phase
    })
    const turnFile = (
      file: string,
      worktreeId: string | null = null,
      name = worktreeId === null ? 'status' : 'execute',
      action: string | null = null,
      phase = 'succeeded'
    ) => ({ file, operations: [{ ...operation(name, worktreeId, action, null, phase), file }] })
    const sessionWithFiles = (files: any[], running: boolean, turns = new Map()) => ({
      sessionId: SESSION_ID,
      running,
      chat: {
        timeline: {
          turns: new Map([
            ...turns,
            [3, { data: { get: (key: string) => (key === 'univerTurn' ? { files } : undefined) } }]
          ])
        }
      }
    })
    const sessionWithTargets = (
      targets: Array<{ file: string; worktreeId: string | null }>,
      running: boolean
    ) =>
      sessionWithFiles(
        targets.map((target) => turnFile(target.file, target.worktreeId)),
        running
      )
    const runtimeProps = (session: any) => ({
      session: { sessionId: session.sessionId, running: session.running },
      useSession: (selector: any) =>
        selector({ sessionId: session.sessionId, running: session.running }),
      useChat: (selector: any) => selector(session.chat)
    })
    const useSessionsAt = (cwd: string) => (selector: any) =>
      selector({ byId: { [SESSION_ID]: { cwd } } })
    // List-slot entries (DSH 0.1.6-alpha.2) receive the owner props and resolve their own match,
    // so fixtures express a match as the Turn's univerTurn data.
    const ownerProps = (turn: number, files: any[], extra = {}) => ({
      turn: {
        turn,
        data: { get: (key: string) => (key === 'univerTurn' ? { files } : undefined) }
      },
      seq: turn,
      openFile: () => {},
      ...extra
    })
    function render(session: any, remount = true, cwd = SESSION_CWD) {
      if (remount) scenario += 1
      reactRoot.render(
        React.createElement(dockEntry.Component, {
          key: 's' + scenario,
          ...runtimeProps(session),
          t,
          getViewerLocale: dockInjected.getViewerLocale,
          preferences: dockInjected.preferences,
          sessionId: SESSION_ID,
          useSessions: useSessionsAt(cwd)
        })
      )
      reviewRoot.render(
        React.createElement(tailEntry.Component, {
          key: 's' + scenario,
          // List-slot entries receive the owner props directly; the component resolves its own
          // match from turn.data.
          turn: {
            turn: 3,
            data: session.chat.timeline.turns.get(3)?.data ?? { get: () => undefined }
          },
          seq: 3,
          openFile: () => {},
          t,
          getViewerLocale: tailInjected.getViewerLocale,
          preferences: tailInjected.preferences,
          sessionId: SESSION_ID,
          ...runtimeProps(session),
          useSessions: useSessionsAt(cwd)
        })
      )
    }
    const mount = (tag = 'div') => {
      const element = document.createElement(tag)
      document.body.appendChild(element)
      return { element, root: createRoot(element) }
    }

    beforeAll(async () => {
      server = createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://x')
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
          if (url.searchParams.get('sessionId') !== SESSION_ID) {
            res.writeHead(400).end()
            return
          }
          stateRequests.push(file)
          if (gatewayPhase !== 'running') {
            res.writeHead(503, { 'content-type': 'application/json' })
            res.end(
              JSON.stringify({ ok: false, code: 'GATEWAY_UNAVAILABLE', message: 'no gateway' })
            )
            return
          }
          if (file !== null && missingFiles.has(file)) {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(
              JSON.stringify({
                ok: false,
                code: 'INVALID_FILE_PATH',
                message: 'path does not exist'
              })
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
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk)
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          if (body.sessionId !== SESSION_ID) {
            res.writeHead(400).end()
            return
          }
          const next =
            ({ merge: 'merged', discard: 'discarded', reopen: 'draft', ready: 'ready' } as const)[
              body.action as string
            ] ?? null
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
      const origin = `http://127.0.0.1:${await listen(server)}`

      const { JSDOM } = repoRequire('jsdom')
      dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
        url: origin + '/'
      })
      // jsdom does not implement PointerEvent; the drag simulation needs it.
      if (dom.window.PointerEvent === undefined) {
        dom.window.PointerEvent = class PointerEvent extends dom.window.MouseEvent {
          pointerId: number
          pointerType: string
          isPrimary: boolean
          constructor(type: string, params: any = {}) {
            super(type, params)
            this.pointerId = params.pointerId ?? 0
            this.pointerType = params.pointerType ?? 'mouse'
            this.isPrimary = params.isPrimary ?? true
          }
        }
      }
      // jsdom has no dialog top layer; containment and iframe continuity are verified in the
      // browser layout test. This shim only models open state.
      dom.window.HTMLDialogElement.prototype.show = function () {
        this.open = true
      }
      dom.window.HTMLDialogElement.prototype.showModal = function () {
        this.open = true
      }
      dom.window.HTMLDialogElement.prototype.close = function () {
        this.open = false
      }
      document = dom.window.document
      Object.assign(globalThis, { window: dom.window, document })
      Object.defineProperty(globalThis, 'navigator', {
        value: dom.window.navigator,
        configurable: true
      })
      Object.defineProperty(dom.window, 'innerWidth', {
        value: 1440,
        writable: true,
        configurable: true
      })
      Object.defineProperty(dom.window, 'innerHeight', {
        value: 1000,
        writable: true,
        configurable: true
      })

      React = repoRequire('react')
      const jsxRuntime = repoRequire('react/jsx-runtime')
      ;({ createRoot } = repoRequire('react-dom/client'))
      dom.window.__ModuleLoader__ = {
        load({ factory }: { factory: (require: (spec: string) => unknown) => unknown }) {
          pluginExports = factory((spec) => {
            if (spec === 'react') return React
            if (spec === 'react/jsx-runtime') return jsxRuntime
            throw new Error(`unexpected require("${spec}")`)
          })
        }
      }
      const source = readFileSync(join(pluginRoot(), 'lib/client.js'), 'utf8')
      new Function('window', `${source}\n//# sourceURL=lib/client.js`)(dom.window)

      ;({ root: reactRoot } = mount())
      ;({ element: reviewRootEl, root: reviewRoot } = mount())
    })

    afterAll(async () => {
      if (server !== undefined) await closeServer(server)
      dom?.window.close()
      for (const key of ['window', 'document', 'navigator']) Reflect.deleteProperty(globalThis, key)
    })

    describe('registration', () => {
      it('registers through the window ModuleLoader', () => {
        expect(
          pluginExports,
          'client module did not register via __ModuleLoader__.load'
        ).not.toBeNull()
        expect(pluginExports.apply).toEqual(expect.any(Function))
        expect(pluginExports.inject, 'Conversation services of the supported DSH line').toEqual([
          'slots',
          'locale',
          'conversation',
          'uiConversation'
        ])
        pluginExports.apply(fakeCtx)
      })

      it('registers the dock, turn-tail, and settings entries in the Univer locale', () => {
        dockEntry = slotEntries.find(
          (entry) =>
            entry.options.name === 'conversation.input.dock' && entry.options.id === 'univer-dock'
        )
        tailEntry = slotEntries.find(
          (entry) =>
            entry.options.name === 'conversation.chat.turnTail' &&
            entry.options.id === 'univer-turn-preview'
        )
        settingsEntry = slotEntries.find(
          (entry) =>
            entry.options.name === 'plugins.bundle.config' &&
            entry.options.key === 'dsh-univer-office'
        )
        expect(dockEntry, 'dock entry').toBeDefined()
        // turnTail is a list slot since DSH 0.1.6-alpha.2: entries declare a stable id and no
        // chain selector.
        expect(tailEntry, 'turn-tail entry').toBeDefined()
        expect(tailEntry.options.select).toBeUndefined()
        expect(settingsEntry, 'Univer settings card').toBeDefined()
        for (const entry of [dockEntry, tailEntry, settingsEntry]) {
          expect(entry.options.locale).toBe('univer')
        }
        expect(localeDicts?.ns).toBe('univer')
        expect(conversationDefinition?.kind).toBe('univerTurn')
        dockInjected = dockEntry.options.inject()
        tailInjected = tailEntry.options.inject()
        settingsInjected = settingsEntry.options.inject()
        expect(dockInjected.getViewerLocale).toEqual(expect.any(Function))
        expect(tailInjected.getViewerLocale).toEqual(expect.any(Function))
        expect(dockInjected.preferences).toBeDefined()
        expect(settingsInjected.settings).toBe(settingsScope)
      })

      // A click on the file in the DSH file tree must reach the Viewer with no agent write, so
      // the Client registers a previewer for the `.univer` extension.
      it('registers an on-demand .univer file viewer', () => {
        expect(sidebarViewers).toHaveLength(1)
        fileViewer = sidebarViewers[0]
        expect(fileViewer).toMatchObject({ id: 'univer-office:univer', exts: ['univer'] })
        // It must outrank the sidebar catch-all viewer.
        expect(fileViewer.priority).toBeGreaterThan(0)
        // `.univer` is a binary container: a byte-reading strategy would render the download pane.
        expect(fileViewer.fetchStrategy).toBe('none')
        expect(fileViewer.component).toEqual(expect.any(Function))
      })

      // dsh-better-sidebar wins the address claim whenever it is installed, so the registration
      // above only covers hosts that have it. Without this one, a host on DSH's own file tree has
      // no `.univer` preview at all.
      it('registers a native right-Sidebar tab type', () => {
        expect(nativeTabTypes).toHaveLength(1)
        nativeTab = nativeTabTypes[0]
        expect(nativeTab).toMatchObject({
          id: 'dsh-univer-office',
          kind: 'univer',
          patterns: ['*.univer'],
          // A third-party tab type claims addresses in the highest band.
          priority: 'extension'
        })
        expect(nativeTab.canOpen(SESSION_ADDRESS)).toBe(true)
        // The absolute scope carries no session, so the state route cannot authorize it.
        expect(nativeTab.canOpen('dsh-resource://file/absolute/home/me/x.univer')).toBe(false)
        expect(nativeTab.canOpen('dsh-resource://note/session/s1/x.univer')).toBe(false)
        expect(nativeTab.title(SESSION_ADDRESS)).toBe('月度支出表.univer')
        nativeBodyEntry = slotEntries.find(
          (entry) =>
            entry.options.name === 'sidebar.right.pane.tab' && entry.options.key === nativeTab.id
        )
        expect(nativeBodyEntry?.Component).toEqual(expect.any(Function))
      })

      // The mirrored `dsh-resource://file/…` grammar, exercised through the two members the
      // sidebar actually calls rather than by reaching into the parser.
      it.each([
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
      ])('claims %s: %s', (address, claimable, title) => {
        expect(nativeTab.canOpen(address)).toBe(claimable)
        if (title !== undefined) expect(nativeTab.title(address)).toBe(title)
      })
    })

    describe('Conversation definition', () => {
      const location = { kind: 'turn', turn: 7 }
      const mkContext = (state: any) => ({
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
        location
      }
      const toolCall = (callId: string, name: string, args: unknown) => ({
        id: '7',
        role: 'update',
        location,
        event: {
          type: 'tool/call',
          data: { turn: 7, step: 1, callId, name, arguments: JSON.stringify(args) }
        }
      })
      const toolResult = (message: unknown) => ({
        id: '7',
        role: 'update',
        location,
        event: { type: 'tool/result', data: { turn: 7, step: 1, message } }
      })
      const readyCall = toolCall('call-ready', 'univer_worktree', {
        action: 'ready',
        file: '/x/proj/notes/demo.univer',
        worktreeId: 'wt-abc12345'
      })
      const readyText = {
        type: 'text',
        text: JSON.stringify({
          operation: 'worktree',
          file: '/x/proj/notes/demo.univer',
          result: { action: 'ready', worktreeId: 'wt-abc12345' }
        })
      }
      const start = () =>
        conversationDefinition.start({ state: undefined }, startMatch, {
          previous: () => undefined
        })

      it('starts an empty Turn', () => {
        expect(start()).toMatchObject({ turn: 7, files: [] })
      })

      // Session format v4 (DSH 0.1.7): the tool result is a first-class tool-role message —
      // `toolCallId` / `isError` sit on the message and `content` holds the text blocks directly.
      // 0.3.2 threw "reading 'flatMap'" on this shape and took the whole timeline down with it.
      it('applies a v4 tool-role result and ignores a foreign one', () => {
        let state = conversationDefinition.update(mkContext(start()), readyCall)
        state = conversationDefinition.update(
          mkContext(state),
          toolResult({
            role: 'tool',
            source: { kind: 'tool', callId: 'call-ready' },
            toolCallId: 'call-ready',
            isError: false,
            content: [readyText]
          })
        )
        expect(state.files[0]?.operations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              callId: 'call-ready',
              phase: 'succeeded',
              worktreeId: 'wt-abc12345'
            })
          ])
        )
        const foreign = conversationDefinition.update(
          mkContext(state),
          toolResult({
            role: 'tool',
            source: { kind: 'tool', callId: 'call-other' },
            toolCallId: 'call-other',
            content: [{ type: 'text', text: 'total 12\n-rw-r--r-- x' }]
          })
        )
        expect(foreign).toBe(state)
      })

      it('keeps ready semantics across later reads and replays screenshots structurally', () => {
        const update = (state: any, match: any) =>
          conversationDefinition.update(mkContext(state), match)
        let state = update(start(), readyCall)
        state = update(
          state,
          toolResult({
            content: [{ type: 'tool-result', toolCallId: 'call-ready', content: [readyText] }]
          })
        )
        state = update(
          state,
          toolCall('call-status', 'univer_status', { file: '/x/proj/notes/demo.univer' })
        )
        state = update(
          state,
          toolCall('call-screenshot', 'univer_screenshot', {
            file: '/x/proj/notes/demo.univer',
            worktreeId: 'wt-abc12345',
            unitId: 'unit-1',
            output: 'shots'
          })
        )
        state = update(
          state,
          toolResult({
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
          })
        )
        expect(state.files[0].operations).toHaveLength(3)
        expect(state.files[0].operations[0].action).toBe('ready')
        expect(state.files[0].operations[2].name).toBe('screenshot')
        const locationData = conversationDefinition.buildLocationData(mkContext(state), 'turn')
        expect(locationData?.key).toBe('univerTurn')
        expect(locationData?.value.files).toHaveLength(1)
      })
    })

    // List-slot entries render the full standalone Viewer page, not embedded mode.
    describe('turn-tail preview card', () => {
      let tail: { element: HTMLElement; root: any }
      const renderTail = (files: any[], extra = {}) =>
        tail.root.render(
          React.createElement(tailEntry.Component, { ...tailProps, ...ownerProps(3, files, extra) })
        )
      const frameSrc = () => tail.element.querySelector('.uvf_panelFrame')?.getAttribute('src')
      const panelMeta = () => tail.element.querySelector('.uvf_panelMeta')?.textContent

      beforeAll(() => {
        tail = mount()
        worktrees = [wt('draft')]
        tailProps = {
          sessionId: SESSION_ID,
          t,
          getViewerLocale: tailInjected.getViewerLocale,
          preferences: tailInjected.preferences,
          ...runtimeProps(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], true)),
          useSessions: useSessionsAt(SESSION_CWD)
        }
      })

      afterAll(() => {
        tail.root.unmount()
        tail.element.remove()
      })

      it('embeds the full localized Viewer page and follows locale switches in place', async () => {
        renderTail([turnFile(DEMO_FILE, WORKTREE)])
        await waitFor('回合尾部统一卡片', () => tail.element.querySelector('.uvf_panel') !== null)
        await waitFor(
          '卡片显示 worktree 名称',
          () => tail.element.querySelector('.uvf_panelWorktree')?.textContent === 'v3smoke'
        )
        await waitFor('中文完整 Viewer 页面', () => frameSrc() === ZH_FULL_DEFAULT_UNIT_URL)
        const frame = tail.element.querySelector('.uvf_panelFrame')
        setActiveLocale('en')
        renderTail([turnFile(DEMO_FILE, WORKTREE)])
        await waitFor('统一卡片切换英文', () => frameSrc() === EN_FULL_DEFAULT_UNIT_URL)
        expect(
          tail.element.querySelector('.uvf_panelFrame'),
          'locale switch updates the existing iframe'
        ).toBe(frame)
        setActiveLocale('zh')
        renderTail([turnFile(DEMO_FILE, WORKTREE)])
        await waitFor('统一卡片切回中文', () => frameSrc() === ZH_FULL_DEFAULT_UNIT_URL)
      })

      it('merges a relative tool-call path and its absolute result into one card', async () => {
        renderTail([turnFile('work_班级成绩表/班级管理.univer'), turnFile(REL_DEMO_FILE, WORKTREE)])
        await waitFor(
          '相对路径和绝对路径去重为一张卡片',
          () =>
            tail.element.querySelectorAll('.uvf_panel').length === 1 &&
            panelMeta() === REL_DEMO_FILE
        )
      })

      it('merges Win32 paths written with opposite separators into one card', async () => {
        renderTail(
          [turnFile('学生成绩表.univer'), turnFile(WINDOWS_FILE.replaceAll('\\', '/'), WORKTREE)],
          { useSessions: useSessionsAt(WINDOWS_CWD) }
        )
        await waitFor(
          'Windows 分隔符去重为一张卡片',
          () =>
            tail.element.querySelectorAll('.uvf_panel').length === 1 && panelMeta() === WINDOWS_FILE
        )
      })

      it('gives each file touched in one Turn its own card, in order', async () => {
        renderTail([turnFile(DEMO_FILE, WORKTREE), turnFile(SECOND_FILE)])
        await waitFor(
          '同一回合的两个文件分别显示卡片',
          () => tail.element.querySelectorAll('.uvf_panel').length === 2
        )
        expect(
          Array.from(tail.element.querySelectorAll('.uvf_panelMeta')).map(
            (element) => element.textContent
          )
        ).toEqual([DEMO_FILE, SECOND_FILE])
      })

      it('drops the card of a temporary file deleted later in the Turn', async () => {
        missingFiles.add(SECOND_FILE)
        try {
          await waitFor('回合结束前已删除的临时文件不显示卡片', () => {
            const panels = Array.from(tail.element.querySelectorAll('.uvf_panel'))
            return (
              panels.length === 1 &&
              panels[0]?.querySelector('.uvf_panelMeta')?.textContent === DEMO_FILE
            )
          })
        } finally {
          missingFiles.delete(SECOND_FILE)
        }
      })

      describe('history', () => {
        const turnData = (files: any[] | undefined) => ({
          data: {
            get: (key: string) => (key === 'univerTurn' && files ? { files } : undefined)
          }
        })
        const sessionWithTurns = (turns: Array<[number, any[] | undefined]>) =>
          runtimeProps({
            sessionId: SESSION_ID,
            running: false,
            chat: {
              timeline: {
                turns: new Map(turns.map(([turn, files]) => [turn, turnData(files)]))
              }
            }
          })
        const isHistory = () => tail.element.querySelector('.uvf_panel_history') !== null
        // Remount from an empty tail: an expansion must not leak into the next case, and the
        // asynchronous commit must not let a predicate match the previous case's DOM.
        const renderHistory = async (files: any[], extra: object) => {
          tail.root.render(null)
          await waitFor('清空上一组卡片', () => tail.element.querySelector('.uvf_panel') === null)
          renderTail(files, extra)
          await waitFor('渲染新一组卡片', () => tail.element.querySelector('.uvf_panel') !== null)
        }

        it('folds an older worktree card without mounting its Viewer', async () => {
          await renderHistory(
            [turnFile(DEMO_FILE, WORKTREE)],
            sessionWithTurns([
              [3, [turnFile(DEMO_FILE, WORKTREE)]],
              [4, [turnFile(DEMO_FILE, WORKTREE)]]
            ])
          )
          await waitFor('旧回合保留新版审阅 header', isHistory)
          await waitFor(
            '历史 header 显示 worktree 名称',
            () => tail.element.querySelector('.uvf_panelWorktree')?.textContent === 'v3smoke'
          )
          expect(panelMeta(), 'historical header shows only the full file path').toBe(DEMO_FILE)
          expect(tail.element.querySelector('.uvf_panelContent')?.hasAttribute('hidden')).toBe(true)
          expect(frameSrc(), 'a historical card mounts no Viewer').toBeUndefined()

          click(tail.element.querySelector('[data-panel-action=fold]')!)
          await waitFor('展开历史卡片后加载 Viewer', () => frameSrc() === ZH_FULL_DEFAULT_UNIT_URL)
        })

        it('folds an older trunk card once any newer Turn renders cards', async () => {
          await renderHistory(
            [turnFile(DEMO_FILE)],
            sessionWithTurns([
              [3, [turnFile(DEMO_FILE)]],
              [4, [turnFile(SECOND_FILE)]]
            ])
          )
          await waitFor('较新回合有卡片时旧 trunk 卡片折叠', isHistory)
          expect(frameSrc()).toBeUndefined()
        })

        it('keeps the latest card Turn open across Turns without Univer files', async () => {
          await renderHistory(
            [turnFile(DEMO_FILE, WORKTREE)],
            sessionWithTurns([
              [3, [turnFile(DEMO_FILE, WORKTREE)]],
              [4, undefined],
              [5, []]
            ])
          )
          await waitFor('无卡片回合不折叠最新卡片', () => frameSrc() === ZH_FULL_DEFAULT_UNIT_URL)
          expect(isHistory()).toBe(false)
        })
      })
    })

    describe('input dock and Turn card', () => {
      it('shows no UI without targets', async () => {
        worktrees = [wt('draft')]
        render(sessionWithTargets([], false))
        await waitFor(
          'no UI without targets',
          () => q('.uvf_root') === null && q('.uvf_panel') === null
        )
      })

      it('opens a trunk window for new, but not for reads alone', async () => {
        worktrees = []
        render(sessionWithFiles([turnFile(DEMO_FILE, null, 'new')], true))
        await waitFor(
          'new 主动拉起当前版本浮窗',
          () => q('.uvf_win') !== null && q('.uvf_frame')?.getAttribute('src') === ZH_LIVE_TRUNK_URL
        )
        expect(
          q('.uvf_root')?.parentElement,
          'floating windows portal outside the input dock'
        ).toBe(document.body)
        expect(q('.uvf_chip')?.getAttribute('data-status')).toBe('trunk')
        render(sessionWithFiles([turnFile(DEMO_FILE, null, 'status')], true))
        await waitFor('纯读取不主动拉起浮窗', () => q('.uvf_win') === null)
      })

      it('resumes an open non-terminal worktree in the next Turn', async () => {
        worktrees = [wt('draft')]
        const running = sessionWithFiles([turnFile(DEMO_FILE, WORKTREE, 'execute')], true)
        render(running)
        await waitFor('写入拉起浮窗', () => q('.uvf_win') !== null)
        render({ ...running, running: false }, false)
        await waitFor('Turn 间暂时隐藏浮窗', () => q('.uvf_win') === null)
        render({ ...running, running: true }, false)
        await waitFor('下一 Turn 延续非终态浮窗', () => q('.uvf_win') !== null)
      })

      it('resolves a relative target against the session cwd', async () => {
        worktrees = [wt('ready')]
        render(
          sessionWithTargets(
            [{ file: 'work_班级成绩表/班级管理.univer', worktreeId: WORKTREE }],
            false
          )
        )
        await waitFor('相对路径解析后出现审阅面板', () => q('.uvf_panel') !== null)
        expect(
          reviewRootEl.contains(q('.uvf_panel')),
          'review panel renders at the Turn tail'
        ).toBe(true)
        expect(stateRequests).toContain(REL_DEMO_FILE)
        await waitFor(
          '相对路径卡片状态完成切换',
          () =>
            q('.uvf_panelWorktree')?.textContent === 'v3smoke' &&
            q('.uvf_panelMeta')?.textContent === REL_DEMO_FILE
        )
      })

      it('polls Win32 targets with native separators as one floating window', async () => {
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
        expect(stateRequests).toContain(WINDOWS_FILE)
      })

      it('keeps the merge preview after later reads in the same Turn', async () => {
        worktrees = [wt('ready')]
        const readyThenReads = turnFile(DEMO_FILE, WORKTREE, 'worktree', 'ready')
        readyThenReads.operations.push(
          { ...operation('inspect', WORKTREE, null, UNITS[0]!.unitId), file: DEMO_FILE },
          { ...operation('status', null), file: DEMO_FILE }
        )
        render(sessionWithFiles([readyThenReads], false))
        await waitFor(
          'ready 后读取仍展示合并预览',
          () => q('.uvf_panelFrame')?.getAttribute('src') === ZH_FULL_DEFAULT_MERGE_URL
        )
      })

      it('opens a draft floating window with a live iframe and Unit chips', async () => {
        worktrees = [wt('merged', 'wt-other-000001'), wt('draft')]
        liveDraftSession = sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], true)
        render(liveDraftSession)
        await waitFor('draft 浮窗出现', () => q('.uvf_win') !== null)
        expect(
          q('.uvf_frame')?.getAttribute('src'),
          'iframe defaults to the changed Unit in the DSH locale'
        ).toBe(ZH_DEFAULT_UNIT_URL)
        const chips = qa('.uvf_win .uvf_unit')
        expect(chips).toHaveLength(3)
        // A nameless deleted chip shows the kind label, not the unitId.
        expect(chips[2].textContent).toContain('删')
        expect(chips[2].textContent).not.toContain('u-gone')
        expect(chips[0].className).toContain('uvf_unit_on')
        expect(chips[0].getAttribute('data-kind')).toBe('modified')
        expect(chips[0].textContent).toContain('销售')
        click(chips[1])
        await waitFor(
          '切换 unit 后 iframe 跟随',
          () => q('.uvf_frame')?.getAttribute('src') === ZH_SLIDE_UNIT_URL
        )
        expect(q('.uvf_windowTitle')?.textContent).toContain('v3smoke')
        expect(qa('.uvf_win'), 'worktrees the session never mentioned stay hidden').toHaveLength(1)
        expect(
          q('.uvf_panel'),
          'the unified Turn card exists while the worktree is draft'
        ).not.toBeNull()
      })
    })

    describe('Settings card', () => {
      it('disables and re-enables automatic live windows', async () => {
        const { element, root } = mount('section')
        try {
          root.render(
            React.createElement(settingsEntry.Component, { t, ...settingsInjected, view: 'page' })
          )
          const toggle = () => element.querySelector('[role=switch]')!
          const save = () => click(element.querySelector('.uvf_settingsSave')!)
          await waitFor(
            'Univer 设置卡片出现',
            () => element.querySelector('.uvf_settingsCard') !== null
          )
          await waitFor('实时预览开关出现', () => toggle().getAttribute('aria-checked') === 'true')
          click(toggle())
          await waitFor(
            '关闭设置进入待保存状态',
            () => toggle().getAttribute('aria-checked') === 'false'
          )
          save()
          await waitFor(
            '关闭设置后浮窗消失',
            () => settingsValue.autoOpenLivePreview === false && q('.uvf_win') === null
          )
          expect(q('.uvf_panel'), 'disabling live windows keeps review cards').not.toBeNull()
          await waitFor(
            '保存后设置显示覆盖状态',
            () => element.querySelector('.uvf_settingsBadge')?.textContent === '已覆盖'
          )
          click(toggle())
          await waitFor(
            '重新开启设置进入待保存状态',
            () => toggle().getAttribute('aria-checked') === 'true'
          )
          save()
          await waitFor(
            '重新开启后当前修改恢复浮窗',
            () => settingsValue.autoOpenLivePreview === true && q('.uvf_win') !== null
          )
          click(qa('.uvf_win .uvf_unit')[1])
          await waitFor(
            '重新开启后可恢复切换 unit',
            () => q('.uvf_frame')?.getAttribute('src') === ZH_SLIDE_UNIT_URL
          )
        } finally {
          root.unmount()
          element.remove()
        }
      })

      // The two switches are independent: hiding cards leaves the live window alone, and the
      // on-demand file-tree preview is a separate surface entirely.
      it('hides conversation review cards independently of live windows', async () => {
        const { element, root } = mount('section')
        try {
          root.render(
            React.createElement(settingsEntry.Component, { t, ...settingsInjected, view: 'page' })
          )
          await waitFor(
            '设置卡片同时提供两个开关',
            () => element.querySelectorAll('[role=switch]').length === 2
          )
          // Every interaction is scoped to the review-card row: the previous test left the
          // live-window field overridden too, so an unscoped query would hit its Reset.
          const fields = () => element.querySelectorAll('.uvf_settingsField')
          const reviewRow = () => fields()[1]!
          const reviewSwitch = () => reviewRow().querySelector('[role=switch]')!
          const save = async (description: string, accepted: () => boolean) => {
            await waitFor(`${description}: Save 可用`, () => {
              const button = element.querySelector<HTMLButtonElement>('.uvf_settingsSave')
              return button !== null && !button.disabled
            })
            click(element.querySelector('.uvf_settingsSave')!)
            await waitFor(description, accepted)
          }
          expect(fields()[0]!.querySelector('[role=switch]')?.getAttribute('aria-label')).toBe(
            t('settings.autoOpenLivePreview')
          )
          expect(reviewSwitch().getAttribute('aria-label')).toBe(
            t('settings.conversationReviewCards')
          )
          expect(q('.uvf_panel'), 'review cards start visible').not.toBeNull()
          click(reviewSwitch())
          await waitFor(
            '关闭审阅卡片进入待保存状态',
            () => reviewSwitch().getAttribute('aria-checked') === 'false'
          )
          await save(
            '关闭审阅卡片后回合卡片消失',
            () => settingsValue.conversationReviewCards === false && q('.uvf_panel') === null
          )
          expect(
            q('.uvf_win'),
            'hiding review cards leaves the live window untouched'
          ).not.toBeNull()
          click(reviewRow().querySelector('.uvf_settingsReset')!)
          await save(
            '恢复默认后审阅卡片回来',
            () => settingsValue.conversationReviewCards === true && q('.uvf_panel') !== null
          )
        } finally {
          root.unmount()
          element.remove()
        }
      })

      // ConfigForm may reject transport failures or explicitly refuse a write.
      it.runIf(modernSettings)('keeps a failed save actionable and retries the draft', async () => {
        const { element, root } = mount('section')
        try {
          root.render(
            React.createElement(settingsEntry.Component, { t, ...settingsInjected, view: 'page' })
          )
          await waitFor(
            'modern settings form',
            () => element.querySelectorAll('[role=switch]').length === 2
          )
          click(element.querySelectorAll('[role=switch]')[1]!)
          const saveButton = () => element.querySelector<HTMLButtonElement>('.uvf_settingsSave')!
          for (const failure of ['throw', 'refuse'] as const) {
            settingsWriteFailure = failure
            await waitFor('save can retry', () => !saveButton().disabled)
            click(saveButton())
            await sleep(0)
            await waitFor(
              'failed save remains actionable',
              () => element.querySelector('.uvf_settingsFailed') !== null && !saveButton().disabled
            )
            expect(
              settingsValue.conversationReviewCards,
              `${failure}: durable preference unchanged`
            ).toBe(true)
          }
          settingsWriteFailure = undefined
          click(saveButton())
          await waitFor(
            'retry persists retained draft',
            () => settingsValue.conversationReviewCards === false && saveButton().disabled
          )
          await settingsScope.unset('conversationReviewCards')
        } finally {
          settingsWriteFailure = undefined
          root.unmount()
          element.remove()
        }
      })

      // The Host half resolves the settings document, so a Client that ships first (a rolling
      // upgrade, or an HMR reload) reads a snapshot without the new field. An absent field must
      // keep the product default instead of reading as "off" and hiding cards.
      //
      // The crafted snapshot keeps the shared field at its current value, so the correct
      // projection is byte-identical and nothing re-renders — which is why this settles instead
      // of polling. With the bug the projection changes to `undefined` and the card unmounts.
      it('treats a field missing from an older Host schema as its default', async () => {
        settingsSnapshot = {
          ...settingsSnapshot,
          value: { autoOpenLivePreview: true },
          revision: settingsRevision + 1
        }
        notifySettings()
        try {
          await sleep(250)
          expect(q('.uvf_panel'), '缺失的设置字段必须沿用产品默认值，而不是隐藏界面').not.toBeNull()
        } finally {
          settingsSnapshot = {
            ...settingsSnapshot,
            value: { ...settingsValue },
            revision: settingsRevision
          }
          notifySettings()
        }
      })
    })

    describe('floating window', () => {
      it('switches locale while preserving the live iframe', async () => {
        const frame = q('.uvf_frame')
        setActiveLocale('en')
        render(liveDraftSession, false)
        await waitFor(
          '浮窗切换英文',
          () =>
            q('.uvf_chip')?.textContent === 'Editing' &&
            q('[data-window-action=close]')?.getAttribute('title') === 'Close'
        )
        expect(q('.uvf_frame')).toBe(frame)
        expect(q('.uvf_frame')?.getAttribute('src')).toBe(EN_SLIDE_UNIT_URL)
        setActiveLocale('zh')
        render(liveDraftSession, false)
        await waitFor(
          '浮窗切回中文',
          () =>
            q('.uvf_chip')?.textContent === '修改中' &&
            q('.uvf_frame')?.getAttribute('src') === ZH_SLIDE_UNIT_URL
        )
      })

      describe('controls', () => {
        let win: any
        let header: any
        const px = (property: string) => Number.parseFloat(win.style[property])
        const drag = (
          element: Element,
          pointerId: number,
          from: [number, number],
          to: [number, number]
        ) => {
          pointer(element, 'pointerdown', {
            button: 0,
            pointerId,
            clientX: from[0],
            clientY: from[1]
          })
          pointer(element, 'pointermove', { pointerId, clientX: to[0], clientY: to[1] })
          pointer(element, 'pointerup', { pointerId })
        }
        const box = () => ({
          left: px('left'),
          top: px('top'),
          width: px('width'),
          height: px('height')
        })

        beforeAll(() => {
          win = q('.uvf_win')
          header = q('.uvf_windowHeader')
        })

        it('uses the default geometry with eight resize directions', () => {
          expect([px('width'), px('height')]).toEqual([560, 420])
          expect(
            qa('.uvf_resizeHandle').map((handle) => handle.getAttribute('data-direction'))
          ).toEqual(['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'])
        })

        it('maximizes on title double-click and restores from the control', async () => {
          header.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, button: 0 }))
          await waitFor('双击标题栏放大', () => win.className.includes('uvf_win_max'))
          click(q('[data-window-action=maximize]'))
          await waitFor('还原', () => win.className.includes('uvf_win_max') === false)
        })

        it('moves in viewport coordinates without maximizing', async () => {
          const start = box()
          drag(header, 8, [100, 20], [60, 170])
          await waitFor(
            '拖拽位移写入视口坐标',
            () => px('left') === start.left - 40 && px('top') === start.top + 150
          )
          expect(win.className).not.toContain('uvf_win_max')
        })

        it('folds and expands without reloading the Viewer iframe', async () => {
          const frame = q('.uvf_frame')
          click(q('[data-window-action=fold]'))
          await waitFor(
            '折叠后只显示标题条',
            () =>
              q('.uvf_win')?.className.includes('uvf_win_folded') === true &&
              q('.uvf_windowBody')?.hidden === true
          )
          expect(q('.uvf_frame'), 'fold keeps the Viewer iframe mounted').toBe(frame)
          click(q('[data-window-action=fold]'))
          await waitFor('展开后 Viewer 恢复', () => q('.uvf_windowBody')?.hidden === false)
          expect(q('.uvf_frame'), 'expand reuses the loaded Viewer iframe').toBe(frame)
        })

        it.each([
          [
            'se',
            [500, 400],
            [540, 480],
            { left: 0, top: 0, width: 40, height: 80 },
            '右下角缩放生效'
          ],
          [
            'nw',
            [100, 100],
            [160, 140],
            { left: 60, top: 40, width: -60, height: -40 },
            '左上角缩放生效'
          ],
          [
            'e',
            [200, 200],
            [160, 200],
            { left: 0, top: 0, width: -40, height: 0 },
            '右边缘缩放生效'
          ],
          ['s', [200, 340], [200, 380], { left: 0, top: 0, width: 0, height: 40 }, '底边缘缩放生效']
        ] as const)(
          'resizes from the %s handle',
          async (direction, from, to, delta, description) => {
            const handle = q(`[data-direction=${direction}]`)
            expect(handle).not.toBeNull()
            const start = box()
            drag(handle, 9, [...from], [...to])
            await waitFor(description, () => {
              const now = box()
              return (
                now.left === start.left + delta.left &&
                now.top === start.top + delta.top &&
                now.width === start.width + delta.width &&
                now.height === start.height + delta.height
              )
            })
          }
        )

        it('clamps dragging and resizing to the viewport and refits on resize', async () => {
          drag(header, 14, [100, 100], [-10000, -10000])
          await waitFor('拖拽夹紧到视口左上角', () => px('left') === 12 && px('top') === 12)
          drag(q('[data-direction=w]'), 15, [0, 100], [10000, 100])
          await waitFor('缩放夹紧到最小宽度', () => px('width') === 360)
          dom.window.innerWidth = 700
          dom.window.innerHeight = 520
          dom.window.dispatchEvent(new dom.window.Event('resize'))
          try {
            await waitFor(
              '视口缩小后窗口仍可见',
              () =>
                px('left') >= 12 &&
                px('top') >= 12 &&
                px('left') + px('width') <= 688 &&
                px('top') + px('height') <= 508
            )
          } finally {
            dom.window.innerWidth = 1440
            dom.window.innerHeight = 1000
            dom.window.dispatchEvent(new dom.window.Event('resize'))
          }
        })

        it('dismisses while the worktree stays draft', async () => {
          click(q('[data-window-action=close]'))
          await waitFor('关闭后浮窗消失', () => q('.uvf_win') === null)
        })
      })
    })

    describe('review lifecycle', () => {
      it('keeps the window with a ready chip while the session runs', async () => {
        worktrees = [wt('ready')]
        render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], true))
        await waitFor('ready 且运行中浮窗保留', () => q('.uvf_win') !== null)
        expect(q('.uvf_chip')?.textContent).toBe('待确认')
        expect(
          q('.uvf_panel'),
          'the unified Turn card exists while the session runs'
        ).not.toBeNull()
      })

      it('replaces the window with a draft review card at session end', async () => {
        worktrees = [wt('draft')]
        render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
        await waitFor('draft 审阅面板出现（会话结束后）', () => q('.uvf_panel') !== null)
        await waitFor('draft 会话结束后浮窗关闭', () => q('.uvf_win') === null)
        expect(q('.uvf_panelFrame')?.getAttribute('src')).toBe(ZH_FULL_DEFAULT_UNIT_URL)
        expect(q('.uvf_panelChip')?.textContent).toBe('修改中')
        expect(
          q('.uvf_panelPageKind'),
          'the header does not repeat the embedded page type'
        ).toBeNull()
        expect(q('.uvf_panelWorktree')?.textContent).toBe('v3smoke')
        expect(q('.uvf_panelMeta')?.textContent).toBe(DEMO_FILE)
        // Lifecycle actions belong to the embedded Viewer.
        expect(q('.uvf_panelFoot')).toBeNull()
        expect(q('.uvf_action')).toBeNull()
      })

      it('enters and leaves fullscreen without remounting the Viewer', async () => {
        const inlineParent = q('.uvf_panel').parentElement
        const inlineFrame = q('.uvf_panelFrame')
        q('.uvf_panel').getBoundingClientRect = () => ({ height: 650 })
        click(q('[data-panel-action=fullscreen]'))
        await waitFor(
          '审阅面板进入全屏',
          () => q('.uvf_panel')?.className.includes('uvf_panel_fullscreen') === true
        )
        expect(q('[data-panel-action=fullscreen]')?.getAttribute('aria-label')).toBe('退出全屏')
        expect(q('[data-panel-action=fold]'), 'fullscreen hides the fold control').toBeNull()
        expect(q('.uvf_panelFrame')).toBe(inlineFrame)
        expect(
          q('.uvf_panelPlaceholder')?.parentElement,
          'placeholder keeps the inline footprint'
        ).toBe(inlineParent)
        expect(q('.uvf_panelPlaceholder')?.style.height).toBe('650px')
        expect(document.activeElement, 'fullscreen keeps keyboard focus').toBe(
          q('[data-panel-action=fullscreen]')
        )

        dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }))
        await waitFor(
          'Escape 退出审阅全屏',
          () => q('.uvf_panel')?.className.includes('uvf_panel_fullscreen') === false
        )
        expect(q('[data-panel-action=fold]')).not.toBeNull()
        expect(q('.uvf_panelFrame')).toBe(inlineFrame)
        expect(q('.uvf_panel').parentElement).toBe(inlineParent)
        expect(q('.uvf_panelPlaceholder')).toBeNull()
        expect(document.activeElement, 'exiting fullscreen restores focus').toBe(
          q('[data-panel-action=fullscreen]')
        )

        click(q('[data-panel-action=fullscreen]'))
        await waitFor('再次进入审阅全屏', () => q('.uvf_panel_fullscreen') !== null)
        click(q('[data-panel-action=fullscreen]'))
        await waitFor('按钮退出审阅全屏', () => q('.uvf_panel_fullscreen') === null)
      })

      it('releases the Viewer while folded and reloads it when expanded', async () => {
        click(q('[data-panel-action=fold]'))
        await waitFor('审阅卡片折叠完整页面', () => q('.uvf_panelContent')?.hidden === true)
        expect(q('[data-panel-action=fold]')?.getAttribute('aria-label')).toBe('展开')
        expect(q('.uvf_panelFrame'), 'a folded card mounts no Viewer').toBeNull()
        click(q('[data-panel-action=fold]'))
        await waitFor('审阅卡片重新展开', () => q('.uvf_panelContent')?.hidden === false)
        expect(q('.uvf_panelFrame')?.getAttribute('src')).toBe(ZH_FULL_DEFAULT_UNIT_URL)
      })

      it('switches the review card locale in place', async () => {
        const frame = q('.uvf_panelFrame')
        const session = sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false)
        setActiveLocale('en')
        render(session, false)
        await waitFor(
          '审阅卡片切换英文',
          () => q('.uvf_panelFrame')?.getAttribute('src') === EN_FULL_DEFAULT_UNIT_URL
        )
        expect(q('.uvf_panelWorktree')?.textContent).toBe('v3smoke')
        expect(q('.uvf_panelMeta')?.textContent).toBe(DEMO_FILE)
        expect(q('.uvf_panelFrame')).toBe(frame)
        setActiveLocale('zh')
        render(session, false)
        await waitFor(
          '审阅卡片切回中文',
          () => q('.uvf_panelFrame')?.getAttribute('src') === ZH_FULL_DEFAULT_UNIT_URL
        )
      })

      it('embeds the full merge page for a ready worktree at session end', async () => {
        worktrees = [wt('ready')]
        render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
        await waitFor('会话结束后浮窗关闭', () => q('.uvf_win') === null)
        await waitFor('合并预览面板出现', () => q('.uvf_panel') !== null)
        await waitFor(
          '卡片嵌入完整合并页',
          () => q('.uvf_panelFrame')?.getAttribute('src') === ZH_FULL_DEFAULT_MERGE_URL
        )
        expect(q('.uvf_panelWorktree')?.textContent).toBe('v3smoke')
        expect(q('.uvf_panelChip')?.textContent).toBe('待确认')
        expect(q('.uvf_action'), 'no duplicate of the mergePreview page actions').toBeNull()
      })

      it.each([
        ['merged', '已合入', 'Viewer merge 后保留终态卡片'],
        ['discarded', '已丢弃', 'Viewer discard 后保留终态卡片']
      ])(
        'keeps a terminal %s card on mainline without mutation actions',
        async (status, chip, description) => {
          worktrees = [wt(status)]
          render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
          await waitFor(description, () => q('.uvf_panelChip')?.textContent === chip)
          expect(q('.uvf_panel')?.getAttribute('data-status')).toBe(status)
          expect(q('.uvf_panelMeta')?.textContent).toBe(DEMO_FILE)
          expect(q('.uvf_panelFrame')?.getAttribute('src')).toBe(ZH_TRUNK_URL)
          expect(q('.uvf_action')).toBeNull()
          expect(
            q('[data-panel-action=fullscreen]'),
            'terminal cards keep fullscreen'
          ).not.toBeNull()
          await sleep(900)
          expect(q('.uvf_win'), 'a terminal worktree never opens a window').toBeNull()
        }
      )

      it('shows a replayed merged worktree as a terminal card', async () => {
        worktrees = [wt('merged')]
        render(sessionWithTargets([{ file: DEMO_FILE, worktreeId: WORKTREE }], false))
        await waitFor(
          '历史 merged worktree 显示终态卡片',
          () => q('.uvf_panel')?.getAttribute('data-status') === 'merged'
        )
        expect(q('.uvf_win')).toBeNull()
        expect(q('.uvf_panelFrame')?.getAttribute('src')).toBe(ZH_TRUNK_URL)
      })

      it('closes everything, including a fullscreen card, when targets clear', async () => {
        click(q('[data-panel-action=fullscreen]'))
        await waitFor('清空目标前进入全屏', () => q('.uvf_panel_fullscreen') !== null)
        render(sessionWithTargets([], false))
        await waitFor(
          'targets 清空后全部关闭',
          () => q('.uvf_win') === null && q('.uvf_panel') === null
        )
        expect(
          q('.uvf_panelPlaceholder'),
          'unmounting fullscreen review removes its placeholder'
        ).toBeNull()
        reactRoot.unmount()
        reviewRoot.unmount()
      })
    })

    // Hosts up to 0.1.6-alpha.1 use a chain turnTail slot and settings.plugin.item.
    it('registers the chain-contract turnTail and legacy settings item on older hosts', async () => {
      const legacyEntries: Array<{ options: any; Component: any }> = []
      const legacyInjectKeys: string[] = []
      const legacyCtx: any = {
        ...fakeCtx,
        inject(services: string[], callback: (ctx: any) => unknown) {
          const key = services.join(',')
          if (key === 'configForms') return () => {}
          if (key !== 'settingsScope' && key !== 'betterSidebar' && key !== 'sidebarRightTabs')
            throw new Error(`unexpected ctx.inject(${JSON.stringify(services)})`)
          return callback(legacyCtx)
        },
        slots: {
          register(options: any, Component: any) {
            // Hosts up to 0.1.6-alpha.1 reject a chain-slot registration without a selector.
            if (options.name === 'conversation.chat.turnTail' && options.select === undefined)
              throw new Error('chain slot "conversation.chat.turnTail" requires options.select')
            legacyEntries.push({ options, Component })
            return () => {}
          },
          inject(key: string, callback: () => unknown) {
            legacyInjectKeys.push(key)
            return fakeCtx.slots.inject(key, callback)
          }
        }
      }
      pluginExports.apply(legacyCtx)
      const legacyTail = legacyEntries.find(
        (entry) => entry.options.name === 'conversation.chat.turnTail'
      )
      expect(legacyTail?.options.select).toEqual(expect.any(Function))
      expect(legacyTail?.options.priority).toBe(-10)
      expect(legacyTail?.options).not.toHaveProperty('id')
      const legacySettings = legacyEntries.find(
        (entry) => entry.options.name === 'settings.plugin.item'
      )
      expect(legacySettings?.options.key).toBe('univer-office')
      expect(legacyInjectKeys, 'legacy hosts probe both settings slots').toEqual(
        expect.arrayContaining(['plugins.bundle.config', 'settings.plugin.item'])
      )
      // The chain host passes {...owner, matched}; the component resolves its own match from the
      // owner turn and renders the same review cards.
      const { element, root } = mount()
      try {
        root.render(
          React.createElement(legacyTail!.Component, {
            key: 'legacy',
            ...tailProps,
            ...ownerProps(3, [turnFile(DEMO_FILE, WORKTREE)]),
            matched: { turn: 3, files: [turnFile(DEMO_FILE, WORKTREE)] }
          })
        )
        await waitFor(
          'chain 契约下预览卡片正常渲染',
          () => element.querySelector('.uvf_panel') !== null
        )
      } finally {
        root.unmount()
        element.remove()
      }
    })

    describe('on-demand .univer file viewer', () => {
      let viewer: { element: HTMLElement; root: any }
      let key = 0
      const renderViewer = () =>
        viewer.root.render(
          React.createElement(fileViewer.component, {
            key: 'fv' + ++key,
            ctx: fakeCtx,
            scope: { sessionId: SESSION_ID, cwd: SESSION_CWD },
            path: DEMO_FILE,
            title: 'demo.univer',
            viewerId: fileViewer.id
          })
        )
      const chips = () => viewer.element.querySelectorAll('.uvf_unit')
      const frameSrc = () => viewer.element.querySelector('iframe.uvf_frame')?.getAttribute('src')

      beforeAll(() => {
        viewer = mount()
      })

      afterAll(() => {
        gatewayPhase = 'running'
        missingFiles.delete(DEMO_FILE)
        viewer.root.unmount()
        viewer.element.remove()
      })

      // Opening the file must reach the Viewer with no agent operation: the Client resolves the
      // Host-projected trunk target on its own.
      it('previews the current version on click and follows locale in place', async () => {
        worktrees = [wt('draft')]
        renderViewer()
        await waitFor(
          '点击文件即按需展示当前版本',
          () => frameSrc() === withLang(TRUNK_URL, 'zh-CN')
        )
        expect(chips(), 'file preview leaves worktree navigation to the Viewer').toHaveLength(0)
        const frame = viewer.element.querySelector('iframe.uvf_frame')
        setActiveLocale('en')
        try {
          await waitFor(
            '语言切换后 Viewer locale 同步跟随',
            () => frameSrc() === withLang(TRUNK_URL, 'en-US')
          )
          expect(viewer.element.querySelector('iframe.uvf_frame')).toBe(frame)
        } finally {
          setActiveLocale('zh')
        }
      })

      it('opens the full Viewer for a ready worktree without an outer scope switch', async () => {
        worktrees = [wt('ready')]
        renderViewer()
        await waitFor(
          'ready worktree 仍打开完整 Viewer',
          () => frameSrc() === withLang(TRUNK_URL, 'zh-CN')
        )
        expect(chips()).toHaveLength(0)
      })

      it('explains a file the Host reports missing', async () => {
        missingFiles.add(DEMO_FILE)
        renderViewer()
        await waitFor(
          '文件已不在工作区时给出说明',
          () => viewer.element.textContent?.includes(t('viewer.missing')) === true
        )
      })

      // The shared Turn-preview poll swallows this failure, so the phase is reported separately.
      it('offers a start action for a stopped Gateway', async () => {
        gatewayPhase = 'stopped'
        renderViewer()
        await waitFor(
          'Gateway 停止时给出启动入口',
          () => viewer.element.textContent?.includes(t('dock.gatewayDown')) === true
        )
        const start = Array.from(viewer.element.querySelectorAll('button')).find(
          (button) => button.textContent === t('dock.startGateway')
        )
        expect(start).toBeDefined()
      })
    })

    // The seat hands a body nothing but the resource address, so the address carries both the
    // session and the path; this proves the route end to end against the same fake Host API.
    it('renders the native right-Sidebar tab body from its address alone', async () => {
      const { element, root } = mount()
      try {
        worktrees = [wt('ready')]
        root.render(
          React.createElement(nativeBodyEntry.Component, {
            ctx: fakeCtx,
            useTabInfo: () => ({
              tab: {
                contentId: `dsh-resource://file/session/${SESSION_ID}/${encodeAddressPath(REL_DEMO_FILE)}`
              }
            })
          })
        )
        await waitFor(
          '原生侧边栏标签按地址解析出文件与会话并渲染 Viewer',
          () =>
            element.querySelector('iframe.uvf_frame')?.getAttribute('src') ===
            withLang(TRUNK_URL, 'zh-CN')
        )
        expect(element.querySelector('[data-surface=sidebar-right]')).not.toBeNull()
        expect(element.querySelector('.uvf_unit')).toBeNull()
      } finally {
        root.unmount()
        element.remove()
      }
    })

    it('releases settings subscriptions on unload', () => {
      for (const dispose of settingsEffects.toReversed())
        if (typeof dispose === 'function') dispose()
      expect(settingsListeners.size).toBe(0)
    })

    // Real Cordis exercises dependency visibility and optional child fibers. Set
    // UNIVER_DSH_RUNTIME_ROOT to a separately installed DSH package directory to run the same
    // lifecycle against that release's Cordis.
    it('activates, attaches late Settings, and tears down under real Cordis', async () => {
      const runtimeRequire = process.env.UNIVER_DSH_RUNTIME_ROOT
        ? createRequire(join(process.env.UNIVER_DSH_RUNTIME_ROOT, 'package.json'))
        : repoRequire
      const { Context } = await import(
        pathToFileURL(runtimeRequire.resolve('@deepseek-ai/cordis')).href
      )
      const context = new Context()
      const liveEntries = new Set<any>()
      try {
        context.provide('slots', {
          inject(_name: string, callback: () => unknown) {
            return context.effect(callback)
          },
          register(options: any) {
            liveEntries.add(options)
            return () => liveEntries.delete(options)
          }
        })
        context.provide('locale', fakeCtx.locale)
        context.provide('conversation', {})
        const fiber = context.plugin(pluginExports)
        await fiber
        expect(fiber.state, 'Client waits for uiConversation before activating').toBe(0)
        context.provide('uiConversation', { events: conversationEventRegistry })
        await fiber
        expect(fiber.state, 'absent optional services do not block activation').toBe(2)
        expect([...liveEntries].some((entry) => entry.name === 'conversation.chat.turnTail')).toBe(
          true
        )
        expect(settingsListeners.size, 'absent Settings attach no preferences').toBe(0)
        context.provide(
          modernSettings ? 'configForms' : 'settingsScope',
          modernSettings ? fakeCtx.get('configForms') : fakeCtx.settingsScope
        )
        await waitFor('late Cordis settings attachment', () => settingsListeners.size === 1)
        expect([...liveEntries].some((entry) => entry.name === 'plugins.bundle.config')).toBe(true)
        await fiber.dispose()
        expect(settingsListeners.size, 'unload releases preferences').toBe(0)
      } finally {
        await context.fiber.dispose()
      }
      expect(liveEntries.size, 'teardown leaves no slot registrations').toBe(0)
    })
  })
}
