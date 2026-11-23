import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { UNIVER_CONFIG_ENTRY_ID, type UniverSettings } from '../shared/settings.ts'
import { betterSidebarOf } from './better-sidebar.ts'
import { PreviewCard } from './components/preview-card.tsx'
import { UniverSettingsCard } from './components/settings-card.tsx'
import { UNIVER_FILE_VIEWER_ID, UniverFileViewer } from './components/univer-file-viewer.tsx'
import {
  UNIVER_SIDEBAR_TAB_ID,
  UNIVER_SIDEBAR_TAB_KIND,
  UniverSidebarTabBody
} from './components/univer-sidebar-tab.tsx'
import { UniverDock } from './components/univer-dock.tsx'
import { univerTurnDefinition } from './conversation/univer-turn-definition.ts'
import { en, UNIVER_LOCALE_NAMESPACE, zh } from './locales/index.ts'
import { fileAddressBasename, parseFileAddress } from './resource-address.ts'
import { sidebarRightTabsOf } from './sidebar-right.ts'
import { UniverPreferences } from './settings/univer-preferences.ts'
import { settingsStyles } from './styles/settings.ts'
import { worktreeStyles } from './styles/worktree.ts'
import { viewerLocaleOf, type ViewerLocale } from './viewer-locale.ts'

export const inject = ['slots', 'locale', 'conversation', 'uiConversation']

interface UiConversationEvents {
  register(definition: ConversationNodeDefinition): () => void
}

/** Register the DSH browser projections for Univer files and worktrees. */
export function apply(ctx: ClientContext): void {
  const getViewerLocale = (): ViewerLocale => viewerLocaleOf(ctx.locale.getSnapshot().active)
  const preferences = new UniverPreferences()
  const dismissedFiles = new Map<SessionId, Set<string>>()
  injectStyles('dsh-univer-office/styles', worktreeStyles)
  injectStyles('dsh-univer-office/settings-styles', settingsStyles)
  const uiConversation = ctx.get('uiConversation') as { events: UiConversationEvents } | undefined
  if (uiConversation === undefined) {
    throw new Error('dsh-univer-office: active DSH Client exposes no uiConversation service')
  }
  // A reload on the same fiber must tolerate re-registering the definition.
  try {
    uiConversation.events.register(univerTurnDefinition)
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('already registered')) throw error
  }
  ctx.effect(() => ctx.locale.register(UNIVER_LOCALE_NAMESPACE, { zh, en }), 'univer: dictionaries')
  ctx.effect(
    () =>
      ctx.slots.inject('conversation.chat.turnTail', () =>
        ctx.slots.register(
          {
            name: 'conversation.chat.turnTail',
            id: 'univer-turn-preview',
            locale: UNIVER_LOCALE_NAMESPACE,
            inject: () => ({ getViewerLocale, preferences })
          },
          PreviewCard
        )
      ),
    'univer: turn preview'
  )
  ctx.effect(
    () =>
      ctx.slots.inject('conversation.input.dock', () =>
        ctx.slots.register(
          {
            name: 'conversation.input.dock',
            id: 'univer-dock',
            order: 400,
            locale: UNIVER_LOCALE_NAMESPACE,
            inject: () => ({ getViewerLocale, preferences, dismissedFiles })
          },
          UniverDock
        )
      ),
    'univer: worktree dock'
  )
  // The `.univer` entry in the DSH file tree: an on-demand Viewer tab that needs
  // no agent operation, unlike the write-driven floating window.
  //
  // Two entry points cover two host shapes, and only one is ever reached.
  // dsh-better-sidebar replaces the native file tree, and its editor tab type
  // claims file addresses at the same `extension` tier with a longer pattern,
  // so it wins the claim and routes through its own registry — that is the
  // first registration. A host WITHOUT it falls through to this plugin's own
  // native right-Sidebar tab type, so the file tree entry works either way.
  ctx.inject(['sidebarRightTabs'], (nativeCtx: ClientContext) => {
    nativeCtx.effect(() => registerUniverSidebarTab(nativeCtx), 'univer: sidebar tab type')
  })
  ctx.inject(['betterSidebar'], (sidebarCtx: ClientContext) => {
    sidebarCtx.effect(() => registerUniverFileViewer(sidebarCtx), 'univer: univer file viewer')
  })
  ctx.inject(['configForms'], (settingsCtx: ClientContext) => {
    const settings = settingsCtx.configForms.get<UniverSettings>(UNIVER_CONFIG_ENTRY_ID)
    settingsCtx.effect(() => preferences.attach(settings), 'univer: presentation preferences')
    settingsCtx.slots.inject('plugins.bundle.config', () =>
      settingsCtx.slots.register(
        {
          name: 'plugins.bundle.config',
          key: 'dsh-univer-office',
          locale: UNIVER_LOCALE_NAMESPACE,
          inject: () => ({ settings })
        },
        UniverSettingsCard
      )
    )
  })
}

/**
 * Register the on-demand `.univer` preview as a native right-Sidebar tab type.
 *
 * The body registers under the type's own id, and both live on the caller's
 * fiber. A host without a right Sidebar never provides `sidebarRightTabs`, so
 * this returns a no-op disposer rather than failing the plugin.
 */
function registerUniverSidebarTab(ctx: ClientContext): () => void {
  const tabs = sidebarRightTabsOf(ctx)
  if (tabs === undefined) return () => undefined
  const disposeBody = untypedSlots(ctx).inject('sidebar.right.pane.tab', () =>
    untypedSlots(ctx).register(
      {
        name: 'sidebar.right.pane.tab',
        key: UNIVER_SIDEBAR_TAB_ID,
        inject: () => ({ ctx })
      },
      UniverSidebarTabBody
    )
  )
  const disposeType = tabs.register({
    id: UNIVER_SIDEBAR_TAB_ID,
    kind: UNIVER_SIDEBAR_TAB_KIND,
    // A glob without `:` matches the address's URI path at any depth, so this
    // claims `.univer` in any directory. It stays narrower than the document
    // preview's whole-address `dsh-resource://file/**`, which is why ordinary
    // files keep their own previewer.
    patterns: ['*.univer'],
    // Third-party types outrank the product's own viewers. Only a session-scoped
    // address can be authorized by the Host state route, and the absolute scope
    // carries no session at all.
    priority: 'extension',
    canOpen: (address) => parseFileAddress(address)?.scope === 'session',
    title: fileAddressBasename
  })
  return () => {
    disposeType()
    disposeBody()
  }
}

/**
 * Register the on-demand `.univer` preview with the optional sidebar service.
 *
 * Returns a disposer either way, so `ctx.effect` always owns a reversible
 * registration even on a host that mounts the inject key without a usable
 * service.
 */
function registerUniverFileViewer(ctx: ClientContext): () => void {
  const sidebar = betterSidebarOf(ctx)
  if (sidebar === undefined) return () => undefined
  return sidebar.registerFileViewer({
    id: UNIVER_FILE_VIEWER_ID,
    title: 'Univer',
    exts: ['univer'],
    priority: 10,
    // Host state supplies the Viewer URL, so the sidebar never reads the file's
    // bytes: `.univer` is a binary container, and a byte-reading strategy would
    // route it to the generic download pane instead of this viewer.
    fetchStrategy: 'none',
    component: UniverFileViewer
  })
}

/** The native right-Sidebar tab seat ships no SlotMap declaration. */
interface UntypedSlots {
  /**
   * Invoke `callback` once the named seat exists. Returns the callback's
   * registration disposer, which is what makes the enclosing `ctx.effect`
   * reversible; a seat that never appears leaves nothing to dispose.
   */
  inject(key: string, callback: () => (() => void) | void): () => void
  register(
    options: { readonly name: string } & Record<string, unknown>,
    component: unknown
  ): () => void
}

function untypedSlots(ctx: ClientContext): UntypedSlots {
  return ctx.slots as unknown as UntypedSlots
}

function injectStyles(id: string, css: string): void {
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(id)}]`) !== null) return
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-univer-office'
  style.dataset.pluginCss = id
  style.textContent = css
  document.head.appendChild(style)
}
