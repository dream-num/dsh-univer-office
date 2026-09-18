import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { UNIVER_SETTINGS_NAMESPACE, type UniverSettings } from '../shared/settings.ts'
import { PreviewCard } from './components/preview-card.tsx'
import { UniverSettingsCard } from './components/settings-card.tsx'
import { UniverDock } from './components/univer-dock.tsx'
import { univerTurnDefinition } from './conversation/univer-turn-definition.ts'
import { en, UNIVER_LOCALE_NAMESPACE, zh } from './locales/index.ts'
import { LivePreviewPreference } from './settings/live-preview-preference.ts'
import { settingsStyles } from './styles/settings.ts'
import { worktreeStyles } from './styles/worktree.ts'
import { viewerLocaleOf, type ViewerLocale } from './viewer-locale.ts'

export const inject = ['slots', 'locale', 'conversation']

interface UiConversationEvents {
  register(definition: ConversationNodeDefinition): () => void
}

/** Register the DSH browser projections for Univer files and worktrees. */
export function apply(ctx: ClientContext): void {
  const getViewerLocale = (): ViewerLocale => viewerLocaleOf(ctx.locale.getSnapshot().active)
  const livePreview = new LivePreviewPreference()
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
            // List-slot contract (DSH 0.1.6-alpha.2): a fresh id contributes an
            // entry; the entry component resolves its own Turn match because
            // list slots inject the owner props instead of a chain `matched`.
            id: 'univer-turn-preview',
            locale: UNIVER_LOCALE_NAMESPACE,
            inject: () => ({ getViewerLocale })
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
            inject: () => ({ getViewerLocale, livePreview })
          },
          UniverDock
        )
      ),
    'univer: worktree dock'
  )
  ctx.inject(['settingsScope'], (settingsCtx: ClientContext) => {
    const settings = settingsCtx.settingsScope.bind<UniverSettings>({
      namespace: UNIVER_SETTINGS_NAMESPACE
    })
    settingsCtx.effect(() => livePreview.attach(settings), 'univer: live preview preference')
    // The bundle configuration section of this package's own Plugins page.
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

function injectStyles(id: string, css: string): void {
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(id)}]`) !== null) return
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-univer-office'
  style.dataset.pluginCss = id
  style.textContent = css
  document.head.appendChild(style)
}
