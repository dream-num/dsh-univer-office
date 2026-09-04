import { LocaleType } from '@univerjs/core'
import type {
  IUnitComparisonViewerMessages,
  UnitComparisonViewerMessageOverrides
} from './types.js'
import { caESUnitComparisonViewerMessages } from './locales/ca-ES.js'
import { deDEUnitComparisonViewerMessages } from './locales/de-DE.js'
import { enUSUnitComparisonViewerMessages } from './locales/en-US.js'
import { esESUnitComparisonViewerMessages } from './locales/es-ES.js'
import { frFRUnitComparisonViewerMessages } from './locales/fr-FR.js'
import { idIDUnitComparisonViewerMessages } from './locales/id-ID.js'
import { itITUnitComparisonViewerMessages } from './locales/it-IT.js'
import { jaJPUnitComparisonViewerMessages } from './locales/ja-JP.js'
import { koKRUnitComparisonViewerMessages } from './locales/ko-KR.js'
import { plPLUnitComparisonViewerMessages } from './locales/pl-PL.js'
import { ptBRUnitComparisonViewerMessages } from './locales/pt-BR.js'
import { ruRUUnitComparisonViewerMessages } from './locales/ru-RU.js'
import { skSKUnitComparisonViewerMessages } from './locales/sk-SK.js'
import { viVNUnitComparisonViewerMessages } from './locales/vi-VN.js'
import { zhCNUnitComparisonViewerMessages } from './locales/zh-CN.js'
import { zhHKUnitComparisonViewerMessages } from './locales/zh-HK.js'
import { zhTWUnitComparisonViewerMessages } from './locales/zh-TW.js'

export const UNIT_COMPARISON_VIEWER_LOCALES = [
  LocaleType.EN_US,
  LocaleType.FR_FR,
  LocaleType.ZH_CN,
  LocaleType.RU_RU,
  LocaleType.ZH_TW,
  LocaleType.ZH_HK,
  LocaleType.VI_VN,
  LocaleType.JA_JP,
  LocaleType.KO_KR,
  LocaleType.ES_ES,
  LocaleType.CA_ES,
  LocaleType.SK_SK,
  LocaleType.PT_BR,
  LocaleType.DE_DE,
  LocaleType.IT_IT,
  LocaleType.ID_ID,
  LocaleType.PL_PL
] as const

const MESSAGES_BY_LOCALE: Readonly<Partial<Record<LocaleType, IUnitComparisonViewerMessages>>> = {
  [LocaleType.CA_ES]: caESUnitComparisonViewerMessages,
  [LocaleType.DE_DE]: deDEUnitComparisonViewerMessages,
  [LocaleType.EN_US]: enUSUnitComparisonViewerMessages,
  [LocaleType.ES_ES]: esESUnitComparisonViewerMessages,
  [LocaleType.FR_FR]: frFRUnitComparisonViewerMessages,
  [LocaleType.ID_ID]: idIDUnitComparisonViewerMessages,
  [LocaleType.IT_IT]: itITUnitComparisonViewerMessages,
  [LocaleType.JA_JP]: jaJPUnitComparisonViewerMessages,
  [LocaleType.KO_KR]: koKRUnitComparisonViewerMessages,
  [LocaleType.PL_PL]: plPLUnitComparisonViewerMessages,
  [LocaleType.PT_BR]: ptBRUnitComparisonViewerMessages,
  [LocaleType.RU_RU]: ruRUUnitComparisonViewerMessages,
  [LocaleType.SK_SK]: skSKUnitComparisonViewerMessages,
  [LocaleType.VI_VN]: viVNUnitComparisonViewerMessages,
  [LocaleType.ZH_CN]: zhCNUnitComparisonViewerMessages,
  [LocaleType.ZH_HK]: zhHKUnitComparisonViewerMessages,
  [LocaleType.ZH_TW]: zhTWUnitComparisonViewerMessages
}

export function resolveUnitComparisonViewerMessages(
  locale: LocaleType,
  overrides?: UnitComparisonViewerMessageOverrides
): IUnitComparisonViewerMessages {
  const messages = MESSAGES_BY_LOCALE[locale] ?? enUSUnitComparisonViewerMessages
  if (overrides === undefined) return messages
  return {
    ...messages,
    ...overrides,
    kind: { ...messages.kind, ...overrides.kind },
    side: { ...messages.side, ...overrides.side },
    checkboxState: { ...messages.checkboxState, ...overrides.checkboxState },
    sheetTree: {
      ...messages.sheetTree,
      ...overrides.sheetTree,
      categories: { ...messages.sheetTree.categories, ...overrides.sheetTree?.categories },
      titles: { ...messages.sheetTree.titles, ...overrides.sheetTree?.titles }
    }
  }
}

export { enUSUnitComparisonViewerMessages }
