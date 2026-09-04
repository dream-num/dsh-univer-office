import type { IUnitComparisonLabelDescriptor } from '@univerjs-pro/edit-history-ui'
import { LocaleService, LocaleType, type ILanguagePack } from '@univerjs/core'
import type { Messages } from './locales/en-US'
import type { UnitComparisonTranslate } from './locales/comparison-labels'
import { messagesFromVocabulary, type MessageVocabulary } from './locales/from-vocabulary'

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

type MessageFactory = (translateComparison: UnitComparisonTranslate) => Messages
type VocabularyModule = { default: MessageVocabulary }
type ComparisonLocaleModule = { default: ILanguagePack }

function vocabularyLoader(
  locale: Lang,
  load: () => Promise<VocabularyModule>
): () => Promise<MessageFactory> {
  return () =>
    load().then(
      ({ default: vocabulary }) =>
        (translateComparison): Messages =>
          messagesFromVocabulary(vocabulary, locale, translateComparison)
    )
}

const messageFactoryLoaders: Record<Lang, () => Promise<MessageFactory>> = {
  'en-US': () => import('./locales/en-US.js').then(({ createEnUsMessages }) => createEnUsMessages),
  'fr-FR': vocabularyLoader('fr-FR', () => import('./locales/fr-FR.js')),
  'zh-CN': () => import('./locales/zh-CN.js').then(({ createZhCnMessages }) => createZhCnMessages),
  'ru-RU': vocabularyLoader('ru-RU', () => import('./locales/ru-RU.js')),
  'zh-TW': vocabularyLoader('zh-TW', () => import('./locales/zh-TW.js')),
  'zh-HK': vocabularyLoader('zh-HK', () => import('./locales/zh-HK.js')),
  'vi-VN': vocabularyLoader('vi-VN', () => import('./locales/vi-VN.js')),
  'ja-JP': vocabularyLoader('ja-JP', () => import('./locales/ja-JP.js')),
  'ko-KR': vocabularyLoader('ko-KR', () => import('./locales/ko-KR.js')),
  'es-ES': vocabularyLoader('es-ES', () => import('./locales/es-ES.js')),
  'ca-ES': vocabularyLoader('ca-ES', () => import('./locales/ca-ES.js')),
  'sk-SK': vocabularyLoader('sk-SK', () => import('./locales/sk-SK.js')),
  'pt-BR': vocabularyLoader('pt-BR', () => import('./locales/pt-BR.js')),
  'de-DE': vocabularyLoader('de-DE', () => import('./locales/de-DE.js')),
  'it-IT': vocabularyLoader('it-IT', () => import('./locales/it-IT.js')),
  'id-ID': vocabularyLoader('id-ID', () => import('./locales/id-ID.js')),
  'pl-PL': vocabularyLoader('pl-PL', () => import('./locales/pl-PL.js'))
}

const comparisonLocaleLoaders: Record<Lang, () => Promise<ComparisonLocaleModule>> = {
  'en-US': () => import('@univerjs-pro/edit-history-ui/locale/en-US'),
  'fr-FR': () => import('@univerjs-pro/edit-history-ui/locale/fr-FR'),
  'zh-CN': () => import('@univerjs-pro/edit-history-ui/locale/zh-CN'),
  'ru-RU': () => import('@univerjs-pro/edit-history-ui/locale/ru-RU'),
  'zh-TW': () => import('@univerjs-pro/edit-history-ui/locale/zh-TW'),
  'zh-HK': () => import('@univerjs-pro/edit-history-ui/locale/zh-HK'),
  'vi-VN': () => import('@univerjs-pro/edit-history-ui/locale/vi-VN'),
  'ja-JP': () => import('@univerjs-pro/edit-history-ui/locale/ja-JP'),
  'ko-KR': () => import('@univerjs-pro/edit-history-ui/locale/ko-KR'),
  'es-ES': () => import('@univerjs-pro/edit-history-ui/locale/es-ES'),
  'ca-ES': () => import('@univerjs-pro/edit-history-ui/locale/ca-ES'),
  'sk-SK': () => import('@univerjs-pro/edit-history-ui/locale/sk-SK'),
  'pt-BR': () => import('@univerjs-pro/edit-history-ui/locale/pt-BR'),
  'de-DE': () => import('@univerjs-pro/edit-history-ui/locale/de-DE'),
  'it-IT': () => import('@univerjs-pro/edit-history-ui/locale/it-IT'),
  'id-ID': () => import('@univerjs-pro/edit-history-ui/locale/id-ID'),
  'pl-PL': () => import('@univerjs-pro/edit-history-ui/locale/pl-PL')
}

const messageCache = new Map<Lang, Promise<Messages>>()

function createComparisonTranslate(
  locale: LocaleType,
  localePack: ILanguagePack
): UnitComparisonTranslate {
  // The shell lives outside either read-only Univer instance. Give each cached language its own
  // public LocaleService so rapid language loads cannot change another table's descriptor output.
  const localeService = new LocaleService()
  localeService.load({ [locale]: localePack })
  localeService.setLocale(locale)
  return (descriptor: IUnitComparisonLabelDescriptor): string =>
    localeService.t(descriptor.key, ...(descriptor.args ?? []))
}

export const LANG_STORAGE_KEY = 'univer-collab-client-lang'

let active: Lang = 'en-US'
let table: Messages | undefined

/** The live message table for the active language. Read at render time, never cache the result. */
export function t(): Messages {
  if (table === undefined) {
    throw new Error('Application locale has not been initialized')
  }
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
  const locale = sdkLocaleOf(lang)
  const pending = Promise.all([comparisonLocaleLoaders[lang](), messageFactoryLoaders[lang]()])
    .then(([{ default: localePack }, createMessages]) => {
      return createMessages(createComparisonTranslate(locale, localePack))
    })
    .catch((error: unknown) => {
      messageCache.delete(lang)
      throw error
    })
  messageCache.set(lang, pending)
  return pending
}

export async function setLang(lang: Lang): Promise<void> {
  const messages = await loadMessages(lang)
  activateLang(lang, messages)
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
