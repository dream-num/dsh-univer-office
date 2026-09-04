import type { IUnitComparisonChange } from '../comparison-types.js'
import {
  defaultUnitComparisonViewerMessages,
  type IUnitComparisonViewerMessages
} from '../i18n/messages.js'

/** Human-readable values shared by the comparison sidebar's change descriptions. */
export function formatComparisonValue(
  value: unknown,
  valueType: IUnitComparisonChange['valueType'] = 'unknown',
  semantic?: { readonly entityType: string; readonly path: readonly string[] },
  messages: IUnitComparisonViewerMessages = defaultUnitComparisonViewerMessages
): string {
  if (value === undefined) return '∅'
  if (value === null) return 'null'
  if (semantic) {
    const label = messages.changeValue(semantic.entityType, semantic.path, value)
    if (label !== undefined) return label
  }
  if (valueType === 'boolean' && typeof value === 'boolean') {
    return value ? messages.checkboxState.checked : messages.checkboxState.unchecked
  }
  if (typeof value === 'string') {
    if (valueType !== 'text' && valueType !== 'formula' && /^[{[]/u.test(value.trim())) {
      try {
        return formatComparisonValue(JSON.parse(value) as unknown, valueType, semantic, messages)
      } catch {
        return value
      }
    }
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return messages.itemCount(value.length)
  const record = asRecord(value)
  if (record === undefined) return String(value)
  const primitive = [record.rgb, record.v, record.value, record.text].find(
    (candidate) =>
      typeof candidate === 'string' ||
      typeof candidate === 'number' ||
      typeof candidate === 'boolean'
  )
  return primitive === undefined
    ? messages.propertyCount(Object.keys(record).length)
    : String(primitive)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
