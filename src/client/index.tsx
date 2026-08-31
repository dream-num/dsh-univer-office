import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { UNIVER_SETTINGS_NAMESPACE, type UniverSettings } from '../shared/settings.ts'
import { CombinedSnapshotPreviewCard, SplitSnapshotPreviewCard } from './components/preview-card.tsx'
import { UniverSettingsCard } from './components/settings-card.tsx'
import { CombinedSnapshotUniverDock, SplitSnapshotUniverDock } from './components/univer-dock.tsx'
import { selectUniverTurn, univerTurnDefinition } from './conversation/univer-turn-definition.ts'
import { registerConversationDefinition } from './dsh-compat.ts'
import { en, UNIVER_LOCALE_NAMESPACE, zh } from './locales/index.ts'
import { LivePreviewPreference } from './settings/live-preview-preference.ts'
import { settingsStyles } from './styles/settings.ts'
import { worktreeStyles } from './styles/worktree.ts'
import { viewerLocaleOf, type ViewerLocale } from './viewer-locale.ts'

export const inject = ['slots', 'locale', 'conversation']

/** Register the DSH browser projections for Univer files and worktrees. */
export function apply(ctx: ClientContext): void {
  const getViewerLocale = (): ViewerLocale => viewerLocaleOf(ctx.locale.getSnapshot().active)
  const livePreview = new LivePreviewPreference()
  injectStyles('dsh-univer-office/styles', worktreeStyles)
  injectStyles('dsh-univer-office/settings-styles', settingsStyles)
  const conversationApi = registerConversationDefinition(ctx, univerTurnDefinition)
  const PreviewCard = conversationApi === 'split' ? SplitSnapshotPreviewCard : CombinedSnapshotPreviewCard
  const UniverDock = conversationApi === 'split' ? SplitSnapshotUniverDock : CombinedSnapshotUniverDock
  ctx.effect(() => ctx.locale.register(UNIVER_LOCALE_NAMESPACE, { zh, en }), 'univer: dictionaries')
  ctx.effect(() => ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    priority: -10,
    locale: UNIVER_LOCALE_NAMESPACE,
    select: selectUniverTurn,
    inject: () => ({ getViewerLocale }),
  }, PreviewCard)), 'univer: turn preview')
  ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'univer-dock',
    order: 400,
    locale: UNIVER_LOCALE_NAMESPACE,
    inject: () => ({ getViewerLocale, livePreview }),
  }, UniverDock)), 'univer: worktree dock')
  ctx.inject(['settingsScope'], (settingsCtx: ClientContext) => {
    const settings = settingsCtx.settingsScope.bind<UniverSettings>({ namespace: UNIVER_SETTINGS_NAMESPACE })
    settingsCtx.effect(() => livePreview.attach(settings), 'univer: live preview preference')
    settingsCtx.slots.inject('settings.plugin.item', () => settingsCtx.slots.register({
      name: 'settings.plugin.item',
      key: UNIVER_SETTINGS_NAMESPACE,
      locale: UNIVER_LOCALE_NAMESPACE,
      inject: () => ({ settings }),
    }, UniverSettingsCard))
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
