import * as React from 'react'
import type { ClientContext } from './dsh.ts'
import { PreviewCard } from './components/preview-card.tsx'
import { UniverDock } from './components/univer-dock.tsx'
import { selectUniverPreview, univerTargetDefinition } from './conversation/univer-target-definition.ts'
import { en } from './locales/en.ts'
import { zh } from './locales/zh.ts'
import { previewStyles } from './styles/preview.ts'
import { worktreeStyles } from './styles/worktree.ts'

const NAMESPACE = 'univer'
export const inject = ['slots', 'locale', 'conversationEvents']

/** Register the DSH browser projections for Univer files and worktrees. */
export function apply(ctx: ClientContext): void {
  injectStyles('dsh-univer-office/styles', `${previewStyles}\n${worktreeStyles}`)
  try {
    ctx.conversationEvents.register(univerTargetDefinition)
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('already registered')) throw error
  }
  ctx.effect(() => ctx.locale.register(NAMESPACE, { zh, en }), 'univer: dictionaries')
  ctx.effect(() => ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail',
    id: 'univer',
    priority: -10,
    locale: NAMESPACE,
    select: selectUniverPreview,
    inject: () => ({}),
  }, PreviewCard as React.ComponentType<Record<string, unknown>>)), 'univer: turn preview')
  ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'univer-dock',
    order: 400,
    inject: () => ({ t: ctx.locale.bind(NAMESPACE) }),
  }, UniverDock as unknown as React.ComponentType<Record<string, unknown>>)), 'univer: worktree dock')
}

function injectStyles(id: string, css: string): void {
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(id)}]`) !== null) return
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-univer-office'
  style.dataset.pluginCss = id
  style.textContent = css
  document.head.appendChild(style)
}
