import type { ILanguagePack } from '@univerjs/core'

export const CONTENT_LOCALES = [
  'en-US',
  'fr-FR',
  'zh-CN',
  'ru-RU',
  'zh-TW',
  'zh-HK',
  'vi-VN',
  'ja-JP',
  'ko-KR',
  'es-ES',
  'ca-ES',
  'sk-SK',
  'pt-BR',
  'de-DE',
  'it-IT',
  'id-ID',
  'pl-PL'
] as const

export type ContentLocale = (typeof CONTENT_LOCALES)[number]

const loaders: Record<ContentLocale, () => Promise<ILanguagePack>> = {
  'en-US': () => import('./en-US.js').then(({ default: locale }) => locale),
  'fr-FR': () => import('./fr-FR.js').then(({ default: locale }) => locale),
  'zh-CN': () => import('./zh-CN.js').then(({ default: locale }) => locale),
  'ru-RU': () => import('./ru-RU.js').then(({ default: locale }) => locale),
  'zh-TW': () => import('./zh-TW.js').then(({ default: locale }) => locale),
  'zh-HK': () => import('./zh-HK.js').then(({ default: locale }) => locale),
  'vi-VN': () => import('./vi-VN.js').then(({ default: locale }) => locale),
  'ja-JP': () => import('./ja-JP.js').then(({ default: locale }) => locale),
  'ko-KR': () => import('./ko-KR.js').then(({ default: locale }) => locale),
  'es-ES': () => import('./es-ES.js').then(({ default: locale }) => locale),
  'ca-ES': () => import('./ca-ES.js').then(({ default: locale }) => locale),
  'sk-SK': () => import('./sk-SK.js').then(({ default: locale }) => locale),
  'pt-BR': () => import('./pt-BR.js').then(({ default: locale }) => locale),
  'de-DE': () => import('./de-DE.js').then(({ default: locale }) => locale),
  'it-IT': () => import('./it-IT.js').then(({ default: locale }) => locale),
  'id-ID': () => import('./id-ID.js').then(({ default: locale }) => locale),
  'pl-PL': () => import('./pl-PL.js').then(({ default: locale }) => locale)
}

const cache = new Map<ContentLocale, Promise<ILanguagePack>>()

export function loadContentLocale(locale: ContentLocale): Promise<ILanguagePack> {
  const cached = cache.get(locale)
  if (cached !== undefined) {
    return cached
  }
  const pending = loaders[locale]().catch((error: unknown) => {
    cache.delete(locale)
    throw error
  })
  cache.set(locale, pending)
  return pending
}
