import type {
  IUnitComparisonLabelDescriptor,
  UnitComparisonTerm
} from '@univerjs-pro/edit-history-ui'
import { unitComparisonLocaleKey } from '@univerjs-pro/edit-history-ui'

/** Translate an SDK descriptor through a host-owned Univer LocaleService. */
export type UnitComparisonTranslate = (descriptor: IUnitComparisonLabelDescriptor) => string

/** Resolve one SDK-owned comparison term through the standard History UI locale. */
export function comparisonTerm(
  translate: UnitComparisonTranslate,
  term: UnitComparisonTerm
): string {
  return translate({ key: unitComparisonLocaleKey(term) })
}
