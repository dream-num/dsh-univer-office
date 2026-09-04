import {
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SLIDE,
  type UnitType
} from '../unit-types.js'
import type { UnitStructuralDiffItem } from '../shared/structural-diff.js'

export interface PreviewFocusTarget {
  readonly category: string
  readonly stableId: string
}

export interface PreviewFocusHooks {
  readonly selectSlideElement?: (slideId: string, elementId: string) => void
}

/** Resolve semantic comparison identity to the native object present on one rendered side. */
export function structuralDiffFocusTarget(
  item: UnitStructuralDiffItem,
  side: 'left' | 'right'
): PreviewFocusTarget {
  const category =
    item.scope?.entityType === 'slide' &&
    (item.entityType === 'slide-chart' || item.entityType === 'slide-table')
      ? `slide-element:${item.scope.stableId}`
      : item.scope?.entityType === 'board-page' &&
          (item.entityType === 'board-chart' || item.entityType === 'board-table')
        ? `board-element:${item.scope.stableId}`
        : item.entityType === 'text-style'
          ? 'paragraph'
          : item.category
  return {
    category,
    stableId: item.nativeStableIds?.[side] ?? item.stableId
  }
}

interface PreviewComparisonApi {
  getActiveDocument(): {
    getBody(): {
      readonly sectionBreaks?: readonly {
        readonly sectionId?: string
        readonly startIndex: number
      }[]
    }
    getParagraphs(): readonly {
      getId(): string
      getInfo(): { readonly startOffset: number; readonly endOffset: number }
    }[]
    setSelection(startOffset: number, endOffset: number): void
  } | null
  getActivePresentation(): {
    getSlideById(id: string): {
      getElementById(id: string): unknown | null
    } | null
    setActiveSlide(slide: unknown): unknown
  } | null
  getBaseUI(): {
    activateTable(tableId: string): Promise<void>
    activateView(viewId: string): Promise<void>
    scrollToField(fieldId: string): void
    scrollToRecord(recordId: string): void
  }
  getActiveBoard(): {
    focusElement(
      elementId: string,
      viewportPoint: { readonly x: number; readonly y: number }
    ): boolean
  } | null
}

/** Navigate one read-only preview without issuing a data mutation. */
export async function focusPreviewComparisonTarget(
  apiValue: unknown,
  unitType: UnitType,
  containerId: string,
  target: PreviewFocusTarget,
  hooks: PreviewFocusHooks = {}
): Promise<boolean> {
  const api = apiValue as PreviewComparisonApi
  if (unitType === UNIT_TYPE_DOC) {
    const document = api.getActiveDocument()
    if (document === null) return false
    if (target.category === 'paragraph') {
      const paragraph = document
        .getParagraphs()
        .find((candidate) => candidate.getId() === target.stableId)
      if (paragraph === undefined) return false
      const info = paragraph.getInfo()
      document.setSelection(info.startOffset, info.endOffset)
      return true
    }
    if (target.category === 'section') {
      const section = document
        .getBody()
        .sectionBreaks?.find((candidate) => candidate.sectionId === target.stableId)
      if (section === undefined) return false
      document.setSelection(section.startIndex, section.startIndex)
      return true
    }
    return false
  }

  if (unitType === UNIT_TYPE_SLIDE) {
    const presentation = api.getActivePresentation()
    if (presentation === null) return false
    const slideId =
      target.category === 'slide'
        ? target.stableId
        : target.category.startsWith('slide-element:')
          ? target.category.slice('slide-element:'.length)
          : undefined
    if (slideId === undefined) return false
    const slide = presentation.getSlideById(slideId)
    if (slide === null) return false
    presentation.setActiveSlide(slide)
    if (target.category === 'slide') return true
    if (slide.getElementById(target.stableId) === null) return false
    hooks.selectSlideElement?.(slideId, target.stableId)
    return true
  }

  if (unitType === UNIT_TYPE_BASE) {
    const baseUi = api.getBaseUI()
    const [category, tableId] = target.category.split(':', 2)
    if (category === 'table') {
      await baseUi.activateTable(target.stableId)
      return true
    }
    if (tableId === undefined) return false
    await baseUi.activateTable(tableId)
    if (category === 'view') {
      await baseUi.activateView(target.stableId)
    } else if (category === 'record') {
      baseUi.scrollToRecord(target.stableId)
    } else if (category === 'field') {
      baseUi.scrollToField(target.stableId)
    } else {
      return false
    }
    return true
  }

  if (unitType === UNIT_TYPE_BOARD && target.category.startsWith('board-element')) {
    const board = api.getActiveBoard()
    if (board === null) return false
    const container = document.getElementById(containerId)
    return board.focusElement(target.stableId, {
      x: Math.max(0, (container?.clientWidth ?? 0) / 2),
      y: Math.max(0, (container?.clientHeight ?? 0) / 2)
    })
  }

  return false
}
