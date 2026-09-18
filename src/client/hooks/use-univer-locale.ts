import * as React from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { UNIVER_LOCALE_NAMESPACE } from '../locales/index.ts'
import { viewerLocaleOf } from '../viewer-locale.ts'
import type { ViewerLocale } from '../viewer-locale.ts'

/**
 * Bind this plugin's dictionaries for surfaces the slot framework does not
 * inject `t` into. A registered file viewer receives only its own descriptor
 * props, so the Turn-tail components' namespace injection is unavailable here.
 *
 * The bound translator resolves the active locale when it is called, so the
 * subscription exists only to re-render on a language switch.
 */
export function useUniverLocale(ctx: ClientContext): {
  readonly t: TranslateNS<'univer'>
  readonly viewerLocale: ViewerLocale
} {
  React.useSyncExternalStore(
    React.useCallback((listener: () => void) => ctx.locale.subscribe(listener), [ctx]),
    () => ctx.locale.getSnapshot().revision,
    () => 0
  )
  return {
    // `bind` is keyed by string at runtime; the namespace map restores the key union.
    t: ctx.locale.bind(UNIVER_LOCALE_NAMESPACE) as TranslateNS<'univer'>,
    viewerLocale: viewerLocaleOf(ctx.locale.getSnapshot().active)
  }
}
