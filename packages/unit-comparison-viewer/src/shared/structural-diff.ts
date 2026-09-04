import type { IUnitComparisonChange } from '../comparison-types.js'

/** Internal structural-diff projection shared by the product-specific viewers. */
export type UnitStructuralDiffKind = 'delete' | 'insert' | 'update'

export interface UnitStructuralDiffItem {
  readonly id: string
  readonly stableId: string
  readonly category: string
  /** Stable entity kind without the parent ID suffix carried by legacy category values. */
  readonly entityType: string
  /** Stable parent object ID, for example the Slide page or Base table containing this item. */
  readonly parentStableId?: string
  /** SDK-owned product view containing this item. */
  readonly scope?: {
    readonly entityType: string
    readonly stableId: string
  }
  /** Machine-readable path from the Unit root to the changed object. */
  readonly path: readonly string[]
  readonly label: string
  readonly kind: UnitStructuralDiffKind
  readonly moved: boolean
  /** Normalized leaf changes shared by native highlights, detail UI, and agent context. */
  readonly changes: readonly IUnitComparisonChange[]
  /** Side-specific runtime identity when semantic alignment uses a different stable ID. */
  readonly nativeStableIds?: {
    readonly left?: string
    readonly right?: string
  }
  readonly position: {
    readonly left: number | null
    readonly right: number | null
  }
  /** Projected values used for comparison. Kept opaque so agents can inspect product-specific data. */
  readonly values: {
    readonly left?: unknown
    readonly right?: unknown
  }
}

/** Return the stable Slide page containing a structural diff item. */
export function slidePageIdOfDiffItem(item: UnitStructuralDiffItem): string | null {
  if (item.scope?.entityType === 'slide') return item.scope.stableId
  if (item.entityType === 'slide') return item.stableId
  if (item.entityType === 'slide-element') {
    return item.parentStableId ?? legacyParentStableId(item.category, 'slide-element')
  }
  return null
}

/** Return only changes rendered by the selected Slide page. */
export function filterSlidePageDiffItems(
  items: readonly UnitStructuralDiffItem[],
  pageId: string
): UnitStructuralDiffItem[] {
  return items.filter((item) => slidePageIdOfDiffItem(item) === pageId)
}

/** Return the stable Base table containing a structural diff item. */
export function baseTableIdOfDiffItem(item: UnitStructuralDiffItem): string | null {
  if (item.scope?.entityType === 'table') return item.scope.stableId
  if (item.entityType === 'table') return item.stableId
  return item.parentStableId ?? legacyParentStableId(item.category, item.entityType)
}

/** Return only changes rendered by the selected Base table. */
export function filterBaseTableDiffItems(
  items: readonly UnitStructuralDiffItem[],
  tableId: string
): UnitStructuralDiffItem[] {
  return items.filter((item) => baseTableIdOfDiffItem(item) === tableId)
}

export type DocumentComparisonRowKind = 'delete' | 'equal' | 'insert' | 'update'

export interface DocumentComparisonParagraph {
  /** Comparison identity. Nested paragraphs use a stable table/column slot. */
  readonly stableId: string
  /** Native paragraph identity used to address the rendered Doc side. */
  readonly paragraphId: string
  /** Stable containing table/column-group slot, when the paragraph is nested. */
  readonly structureId?: string
  readonly index: number
  readonly start: number
  readonly end: number
  readonly text: string
  readonly value: unknown
}

/**
 * One visual row in a stable-ID Doc comparison. Missing sides are intentional placeholders.
 * A moved paragraph is represented by a delete row and an insert row with the same stable ID.
 */
export interface DocumentComparisonRow {
  readonly id: string
  readonly stableId: string
  readonly kind: DocumentComparisonRowKind
  readonly moved: boolean
  readonly left: DocumentComparisonParagraph | null
  readonly right: DocumentComparisonParagraph | null
}

function legacyParentStableId(category: string, entityType: string): string | null {
  const prefix = `${entityType}:`
  return category.startsWith(prefix) ? category.slice(prefix.length) : null
}
