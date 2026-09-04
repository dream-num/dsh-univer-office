import type { IUnitComparisonLabelDescriptor } from '@univerjs-pro/edit-history-ui'
import {
  getUnitComparisonEntityLabel,
  getUnitComparisonPathLabels,
  getUnitComparisonValueLabel
} from '@univerjs-pro/edit-history-ui'
import { LocaleService, type ILanguagePack, type LocaleType } from '@univerjs/core'
import type { UnitComparisonSemanticMessages } from './types.js'

/** Build SDK-owned entity, path, and enum labels without borrowing the host application's i18n. */
export function createComparisonSemanticMessages(
  locale: LocaleType,
  localePack: ILanguagePack
): UnitComparisonSemanticMessages {
  const localeService = new LocaleService()
  localeService.load({ [locale]: localePack })
  localeService.setLocale(locale)
  const translate = (descriptor: IUnitComparisonLabelDescriptor): string =>
    localeService.t(descriptor.key, ...(descriptor.args ?? []))

  return {
    entity: (entityType) => translate(getUnitComparisonEntityLabel(entityType)),
    changePath: (path) =>
      getUnitComparisonPathLabels(path)
        .map((descriptor) => translate(descriptor))
        .join(' · '),
    changeValue: (entityType, path, value) => {
      const descriptor = getUnitComparisonValueLabel(entityType, path, value)
      return descriptor === undefined ? undefined : translate(descriptor)
    }
  }
}
