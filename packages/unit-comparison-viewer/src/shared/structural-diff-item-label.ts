import type { UnitStructuralDiffItem } from './structural-diff.js'
import {
  defaultUnitComparisonViewerMessages,
  type IUnitComparisonViewerMessages
} from '../i18n/messages.js'

const STRUCTURED_CONTENT_CATEGORIES = new Set([
  'block-range',
  'column-group',
  'doc-callout',
  'doc-code',
  'doc-table-resource',
  'table',
  'table-range'
])

/** Resolve a product-specific display category without changing the stable Agent API category. */
export function structuralDiffItemDisplayCategory(item: UnitStructuralDiffItem): string {
  if (item.category !== 'block-range') return item.category
  const subtype = [item.values.right, item.values.left]
    .map(asRecord)
    .map((value) => value?.type ?? value?.blockType)
    .find((value): value is string => typeof value === 'string')
    ?.toLocaleLowerCase()
  if (subtype === 'quote') return 'doc-quote'
  if (subtype === 'callout') return 'doc-callout'
  return item.category
}

export function structuralDiffItemEntityLabel(
  item: UnitStructuralDiffItem,
  messages: IUnitComparisonViewerMessages = defaultUnitComparisonViewerMessages
): string {
  return messages.entity(structuralDiffItemDisplayCategory(item))
}

/** Keep technical identity in `stableId`; visible navigation always uses content or a localized ordinal. */
export function structuralDiffItemLabel(
  item: UnitStructuralDiffItem,
  preferredLabel: string = item.label,
  messages: IUnitComparisonViewerMessages = defaultUnitComparisonViewerMessages
): string {
  const candidate = preferredLabel.trim()
  const position = (item.position.right ?? item.position.left ?? 0) + 1
  const displayCategory = structuralDiffItemDisplayCategory(item)
  const entity = messages.entity(displayCategory)
  // A transition reference contains another entity's ID, not a user-authored display name.
  const isReferenceId =
    item.entityType === 'slide-transition-ref' &&
    [item.values.left, item.values.right].some((value) => value === candidate)
  const readable =
    candidate.length > 0 && candidate !== item.stableId && !isReferenceId
      ? STRUCTURED_CONTENT_CATEGORIES.has(item.category)
        ? `${entity} · ${candidate}`
        : candidate
      : messages.entityAt(displayCategory, position)
  return item.moved ? `${readable} · ${messages.moved}` : readable
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
