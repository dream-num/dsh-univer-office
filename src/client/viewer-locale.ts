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

/** Add Viewer presentation parameters to the Host-owned target. */
export function localizeViewerUrl(url: string, locale: ViewerLocale, surface?: 'floating'): string {
  // Host-projected Viewer targets are same-origin relative paths.
  const target = new URL(url, window.location.origin)
  target.searchParams.set('lang', locale)
  if (surface !== undefined) target.searchParams.set('surface', surface)
  return target.toString()
}
