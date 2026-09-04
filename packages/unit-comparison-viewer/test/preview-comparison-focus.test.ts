// @vitest-environment jsdom
import {
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SLIDE
} from '../src/unit-types.js'
import { describe, expect, it, vi } from 'vitest'
import {
  focusPreviewComparisonTarget,
  structuralDiffFocusTarget
} from '../src/native/comparison-focus'

describe('preview comparison stable-ID focus', () => {
  it("maps semantic Doc rows to each side's native paragraph identity", () => {
    const item = {
      id: 'paragraph:update:table:table1:row:0:cell:0:paragraph:0',
      stableId: 'table:table1:row:0:cell:0:paragraph:0',
      category: 'text-style',
      entityType: 'text-style',
      path: ['text-style', 'table:table1:row:0:cell:0:paragraph:0'],
      label: 'Cell text style',
      kind: 'update',
      moved: false,
      changes: [],
      nativeStableIds: { left: 'paragraph-left', right: 'paragraph-right' },
      position: { left: 2, right: 4 },
      values: { left: [], right: [] }
    } as const

    expect(structuralDiffFocusTarget(item, 'left')).toEqual({
      category: 'paragraph',
      stableId: 'paragraph-left'
    })
    expect(structuralDiffFocusTarget(item, 'right')).toEqual({
      category: 'paragraph',
      stableId: 'paragraph-right'
    })
  })

  it('maps Slide and Board resource changes to their containing canvas page', () => {
    const baseItem = {
      id: 'resource:update:object-1',
      stableId: 'object-1',
      category: 'resource',
      path: ['resource', 'object-1'],
      label: 'Resource',
      kind: 'update',
      moved: false,
      changes: [],
      position: { left: 0, right: 0 },
      values: {}
    } as const

    expect(
      structuralDiffFocusTarget(
        {
          ...baseItem,
          entityType: 'slide-chart',
          scope: { entityType: 'slide', stableId: 'slide-1' }
        },
        'left'
      )
    ).toEqual({ category: 'slide-element:slide-1', stableId: 'object-1' })
    expect(
      structuralDiffFocusTarget(
        {
          ...baseItem,
          entityType: 'board-table',
          scope: { entityType: 'board-page', stableId: 'page-1' }
        },
        'right'
      )
    ).toEqual({ category: 'board-element:page-1', stableId: 'object-1' })
  })

  it('selects the matching Doc paragraph and SectionBreak offsets', async () => {
    const setSelection = vi.fn()
    const api = {
      getActiveDocument: () => ({
        getParagraphs: () => [
          { getId: () => 'p1', getInfo: () => ({ startOffset: 4, endOffset: 9 }) }
        ],
        getBody: () => ({ sectionBreaks: [{ sectionId: 's1', startIndex: 12 }] }),
        setSelection
      })
    }

    await expect(
      focusPreviewComparisonTarget(api, UNIT_TYPE_DOC, 'unused', {
        category: 'paragraph',
        stableId: 'p1'
      })
    ).resolves.toBe(true)
    await expect(
      focusPreviewComparisonTarget(api, UNIT_TYPE_DOC, 'unused', {
        category: 'section',
        stableId: 's1'
      })
    ).resolves.toBe(true)
    expect(setSelection).toHaveBeenNthCalledWith(1, 4, 9)
    expect(setSelection).toHaveBeenNthCalledWith(2, 12, 12)
  })

  it('activates the matching Slide before checking its element', async () => {
    const slide = { getElementById: vi.fn(() => ({})) }
    const setActiveSlide = vi.fn()
    const selectSlideElement = vi.fn()
    const api = {
      getActivePresentation: () => ({
        getSlideById: vi.fn((id: string) => (id === 'page1' ? slide : null)),
        setActiveSlide
      })
    }

    await expect(
      focusPreviewComparisonTarget(
        api,
        UNIT_TYPE_SLIDE,
        'unused',
        {
          category: 'slide-element:page1',
          stableId: 'shape1'
        },
        { selectSlideElement }
      )
    ).resolves.toBe(true)
    expect(setActiveSlide).toHaveBeenCalledWith(slide)
    expect(slide.getElementById).toHaveBeenCalledWith('shape1')
    expect(selectSlideElement).toHaveBeenCalledWith('page1', 'shape1')
  })

  it('activates Base table and routes view, record, and field targets', async () => {
    const baseUi = {
      activateTable: vi.fn(async () => undefined),
      activateView: vi.fn(async () => undefined),
      scrollToRecord: vi.fn(),
      scrollToField: vi.fn()
    }
    const api = { getBaseUI: () => baseUi }

    await focusPreviewComparisonTarget(api, UNIT_TYPE_BASE, 'unused', {
      category: 'view:t1',
      stableId: 'v1'
    })
    await focusPreviewComparisonTarget(api, UNIT_TYPE_BASE, 'unused', {
      category: 'record:t1',
      stableId: 'r1'
    })
    await focusPreviewComparisonTarget(api, UNIT_TYPE_BASE, 'unused', {
      category: 'field:t1',
      stableId: 'f1'
    })

    expect(baseUi.activateTable).toHaveBeenCalledTimes(3)
    expect(baseUi.activateView).toHaveBeenCalledWith('v1')
    expect(baseUi.scrollToRecord).toHaveBeenCalledWith('r1')
    expect(baseUi.scrollToField).toHaveBeenCalledWith('f1')
  })

  it('selects and centers a Board element in its own pane', async () => {
    const container = document.createElement('div')
    container.id = 'board-pane'
    Object.defineProperties(container, {
      clientWidth: { value: 640 },
      clientHeight: { value: 360 }
    })
    document.body.append(container)
    const focusElement = vi.fn(() => true)
    const api = { getActiveBoard: () => ({ focusElement }) }

    await expect(
      focusPreviewComparisonTarget(api, UNIT_TYPE_BOARD, container.id, {
        category: 'board-element:page1',
        stableId: 'e1'
      })
    ).resolves.toBe(true)
    expect(focusElement).toHaveBeenCalledWith('e1', { x: 320, y: 180 })
  })
})
