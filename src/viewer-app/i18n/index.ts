import { EN_US_MESSAGES } from './locales/en-US'
import { LocaleType } from '@univerjs/core'
import type { Messages } from './locales/en-US'

export const LOCALE_MANIFEST = [
  { tag: 'en-US', sdkLocale: LocaleType.EN_US, nativeName: 'English' },
  { tag: 'fr-FR', sdkLocale: LocaleType.FR_FR, nativeName: 'Français' },
  { tag: 'zh-CN', sdkLocale: LocaleType.ZH_CN, nativeName: '简体中文' },
  { tag: 'ru-RU', sdkLocale: LocaleType.RU_RU, nativeName: 'Русский' },
  { tag: 'zh-TW', sdkLocale: LocaleType.ZH_TW, nativeName: '繁體中文（台灣）' },
  { tag: 'zh-HK', sdkLocale: LocaleType.ZH_HK, nativeName: '繁體中文（香港）' },
  { tag: 'vi-VN', sdkLocale: LocaleType.VI_VN, nativeName: 'Tiếng Việt' },
  { tag: 'ja-JP', sdkLocale: LocaleType.JA_JP, nativeName: '日本語' },
  { tag: 'ko-KR', sdkLocale: LocaleType.KO_KR, nativeName: '한국어' },
  { tag: 'es-ES', sdkLocale: LocaleType.ES_ES, nativeName: 'Español' },
  { tag: 'ca-ES', sdkLocale: LocaleType.CA_ES, nativeName: 'Català' },
  { tag: 'sk-SK', sdkLocale: LocaleType.SK_SK, nativeName: 'Slovenčina' },
  { tag: 'pt-BR', sdkLocale: LocaleType.PT_BR, nativeName: 'Português (Brasil)' },
  { tag: 'de-DE', sdkLocale: LocaleType.DE_DE, nativeName: 'Deutsch' },
  { tag: 'it-IT', sdkLocale: LocaleType.IT_IT, nativeName: 'Italiano' },
  { tag: 'id-ID', sdkLocale: LocaleType.ID_ID, nativeName: 'Bahasa Indonesia' },
  { tag: 'pl-PL', sdkLocale: LocaleType.PL_PL, nativeName: 'Polski' }
] as const satisfies ReadonlyArray<{ tag: string; sdkLocale: LocaleType; nativeName: string }>

export type Lang = (typeof LOCALE_MANIFEST)[number]['tag']

const messageLoaders: Record<Lang, () => Promise<Messages>> = {
  'en-US': () => Promise.resolve(EN_US_MESSAGES),
  'fr-FR': () => import('./locales/fr-FR.js').then(({ FR_FR_MESSAGES }) => FR_FR_MESSAGES),
  'zh-CN': () => import('./locales/zh-CN.js').then(({ ZH_CN_MESSAGES }) => ZH_CN_MESSAGES),
  'ru-RU': () => import('./locales/ru-RU.js').then(({ RU_RU_MESSAGES }) => RU_RU_MESSAGES),
  'zh-TW': () => import('./locales/zh-TW.js').then(({ ZH_TW_MESSAGES }) => ZH_TW_MESSAGES),
  'zh-HK': () => import('./locales/zh-HK.js').then(({ ZH_HK_MESSAGES }) => ZH_HK_MESSAGES),
  'vi-VN': () => import('./locales/vi-VN.js').then(({ VI_VN_MESSAGES }) => VI_VN_MESSAGES),
  'ja-JP': () => import('./locales/ja-JP.js').then(({ JA_JP_MESSAGES }) => JA_JP_MESSAGES),
  'ko-KR': () => import('./locales/ko-KR.js').then(({ KO_KR_MESSAGES }) => KO_KR_MESSAGES),
  'es-ES': () => import('./locales/es-ES.js').then(({ ES_ES_MESSAGES }) => ES_ES_MESSAGES),
  'ca-ES': () => import('./locales/ca-ES.js').then(({ CA_ES_MESSAGES }) => CA_ES_MESSAGES),
  'sk-SK': () => import('./locales/sk-SK.js').then(({ SK_SK_MESSAGES }) => SK_SK_MESSAGES),
  'pt-BR': () => import('./locales/pt-BR.js').then(({ PT_BR_MESSAGES }) => PT_BR_MESSAGES),
  'de-DE': () => import('./locales/de-DE.js').then(({ DE_DE_MESSAGES }) => DE_DE_MESSAGES),
  'it-IT': () => import('./locales/it-IT.js').then(({ IT_IT_MESSAGES }) => IT_IT_MESSAGES),
  'id-ID': () => import('./locales/id-ID.js').then(({ ID_ID_MESSAGES }) => ID_ID_MESSAGES),
  'pl-PL': () => import('./locales/pl-PL.js').then(({ PL_PL_MESSAGES }) => PL_PL_MESSAGES)
}

const messageCache = new Map<Lang, Promise<Messages>>([['en-US', Promise.resolve(EN_US_MESSAGES)]])

export const LANG_STORAGE_KEY = 'univer-collab-client-lang'

let active: Lang = 'en-US'
let table: Messages = EN_US_MESSAGES

/** The live message table for the active language. Read at render time, never cache the result. */
export function t(): Messages {
  return table
}

export function currentLang(): Lang {
  return active
}

export function activateLang(lang: Lang, messages: Messages): void {
  active = lang
  table = messages
}

export async function loadMessages(lang: Lang): Promise<Messages> {
  const cached = messageCache.get(lang)
  if (cached !== undefined) {
    return cached
  }
  const pending = messageLoaders[lang]().catch((error: unknown) => {
    messageCache.delete(lang)
    throw error
  })
  messageCache.set(lang, pending)
  return pending
}

export async function setLang(lang: Lang): Promise<void> {
  activateLang(lang, await loadMessages(lang))
}

export function sdkLocaleOf(lang: Lang): LocaleType {
  return LOCALE_MANIFEST.find((locale) => locale.tag === lang)?.sdkLocale ?? LocaleType.EN_US
}

/** Reflect the active language on document metadata; the App owns its file-specific tab title. */
export function applyDocumentLang(): void {
  document.documentElement.lang = active
}

/** Persist the user's explicit choice so it survives reloads (best-effort; storage may be blocked). */
export function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang)
  } catch {
    // localStorage unavailable (e.g. blocked third-party context) — the URL still carries the lang.
  }
}

/**
 * Resolve the boot language: URL `?lang=` > localStorage > `navigator.language` > en-US.
 * Unrecognized values at one source fall through to the next.
 */
export function resolveLang(): Lang {
  const fromUrl = normalizeLang(new URLSearchParams(location.search).get('lang'))
  if (fromUrl !== undefined) {
    return fromUrl
  }
  let stored: string | null = null
  try {
    stored = localStorage.getItem(LANG_STORAGE_KEY)
  } catch {
    // localStorage unavailable — fall through.
  }
  const fromStorage = normalizeLang(stored)
  if (fromStorage !== undefined) {
    return fromStorage
  }
  return normalizeLang(navigator.language) ?? 'en-US'
}

/** Map a BCP 47-ish value onto a supported language; tolerate bare "zh"/"en" prefixes. */
export function normalizeLang(value: string | null | undefined): Lang | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  const normalized = value.replace(/_/gu, '-').toLowerCase()
  const exact = LOCALE_MANIFEST.find((locale) => locale.tag.toLowerCase() === normalized)
  if (exact !== undefined) {
    return exact.tag
  }
  if (normalized === 'zh') {
    return 'zh-CN'
  }
  const language = normalized.split('-')[0]
  return LOCALE_MANIFEST.find((locale) => locale.tag.toLowerCase().startsWith(`${language}-`))?.tag
}
