import type { ILanguagePack, LocaleType } from '@univerjs/core'

const loaders: Partial<Record<LocaleType, () => Promise<ILanguagePack>>> = {
  enUS: () => import('./en-US.js').then(({ default: load }) => load()),
  frFR: () => import('./fr-FR.js').then(({ default: load }) => load()),
  zhCN: () => import('./zh-CN.js').then(({ default: load }) => load()),
  ruRU: () => import('./ru-RU.js').then(({ default: load }) => load()),
  zhTW: () => import('./zh-TW.js').then(({ default: load }) => load()),
  zhHK: () => import('./zh-HK.js').then(({ default: load }) => load()),
  viVN: () => import('./vi-VN.js').then(({ default: load }) => load()),
  jaJP: () => import('./ja-JP.js').then(({ default: load }) => load()),
  koKR: () => import('./ko-KR.js').then(({ default: load }) => load()),
  esES: () => import('./es-ES.js').then(({ default: load }) => load()),
  caES: () => import('./ca-ES.js').then(({ default: load }) => load()),
  skSK: () => import('./sk-SK.js').then(({ default: load }) => load()),
  ptBR: () => import('./pt-BR.js').then(({ default: load }) => load()),
  deDE: () => import('./de-DE.js').then(({ default: load }) => load()),
  itIT: () => import('./it-IT.js').then(({ default: load }) => load()),
  idID: () => import('./id-ID.js').then(({ default: load }) => load()),
  plPL: () => import('./pl-PL.js').then(({ default: load }) => load())
}

const cache = new Map<LocaleType, Promise<ILanguagePack>>()

export function loadViewerLocale(locale: LocaleType): Promise<ILanguagePack> {
  const cached = cache.get(locale)
  if (cached !== undefined) {
    return cached
  }
  const loader = loaders[locale]
  if (loader === undefined) {
    return Promise.reject(new Error(`Unsupported Gateway Viewer locale: ${locale}`))
  }
  const pending = loader().catch((error: unknown) => {
    cache.delete(locale)
    throw error
  })
  cache.set(locale, pending)
  return pending
}
