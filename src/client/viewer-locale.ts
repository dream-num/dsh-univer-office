import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'

/** Locale tags understood by the bundled Univer Viewer. */
export type ViewerLocale = 'zh-CN' | 'en-US'

/** Viewer-locale accessor injected into DSH slot components. */
export interface ViewerLocaleInjected {
  readonly getViewerLocale: () => ViewerLocale
}

/** Map one DSH locale id to the corresponding Univer Viewer locale tag. */
export function viewerLocaleOf(locale: LocaleId): ViewerLocale {
  return locale === 'zh' ? 'zh-CN' : 'en-US'
}

/** Add the active Viewer locale without reconstructing the Host-owned target. */
export function localizeViewerUrl(url: string, locale: ViewerLocale): string {
  const target = new URL(url)
  target.searchParams.set('lang', locale)
  return target.toString()
}
