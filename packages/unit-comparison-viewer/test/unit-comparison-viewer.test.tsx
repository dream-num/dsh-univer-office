// @vitest-environment jsdom
import { UNIT_TYPE_DOC, UNIT_TYPE_SHEET, UNIT_TYPE_SLIDE } from '../src/unit-types.js'
import { LocaleType, type IDocumentData, type Univer } from '@univerjs/core'
import type { ISlideData } from '@univerjs-pro/slides'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  UnitComparisonViewer,
  type UnitComparisonUniverFactory,
  type UnitComparisonViewerValue
} from '../src/unit-comparison-viewer'

// Preload the lazy Sheet view outside the test timeout, including its Univer dependencies.
await import('../src/sheet/sheet-comparison-view.js')

const paneState = vi.hoisted(() => ({
  createCalls: [] as Array<Record<string, unknown>>,
  handles: [] as Array<{
    dispose: ReturnType<typeof vi.fn>
    focusComparisonTarget: ReturnType<typeof vi.fn>
    setComparisonSelection: ReturnType<typeof vi.fn>
  }>
}))

vi.mock('../src/native/comparison-pane', () => ({
  createComparisonPane: vi.fn(async (options: Record<string, unknown>) => {
    paneState.createCalls.push(options)
    const runtime = await (options.createUniver as UnitComparisonUniverFactory)({
      container: options.container as HTMLElement,
      unitType: options.unitType as typeof UNIT_TYPE_DOC,
      locale: LocaleType.EN_US,
      darkMode: false
    })
    const handle = {
      dispose: vi.fn(() => runtime.dispose()),
      focusComparisonTarget: vi.fn(async () => true),
      getBoardViewport: vi.fn(() => null),
      setBoardViewport: vi.fn(),
      setComparisonSelection: vi.fn(async () => undefined),
      subscribeBoardViewport: vi.fn(() => () => undefined)
    }
    paneState.handles.push(handle)
    return handle
  })
}))

describe('UnitComparisonViewer lifecycle boundary', () => {
  let root: Root
  let host: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = '<main id="root"></main>'
    host = document.getElementById('root')!
    root = createRoot(host)
    paneState.createCalls = []
    paneState.handles = []
  })

  afterEach(async () => {
    flushSync(() => root.unmount())
    await new Promise((resolve) => setTimeout(resolve, 0))
    document.body.innerHTML = ''
  })

  it('creates one runtime per present side and does not remount on selection', async () => {
    const runtimes: Array<{ dispose: ReturnType<typeof vi.fn> }> = []
    const createUniver = vi.fn(async () => {
      const runtime = { univer: {} as Univer, dispose: vi.fn() }
      runtimes.push(runtime)
      return runtime
    })
    const comparison = docComparison('cmp-1')

    flushSync(() => root.render(renderViewer('cmp-1', comparison, createUniver)))
    await vi.waitFor(() => expect(createUniver).toHaveBeenCalledTimes(2))
    await vi.waitFor(() =>
      expect(
        paneState.handles.every((handle) => handle.focusComparisonTarget.mock.calls.length > 0)
      ).toBe(true)
    )

    const item = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Paragraph')
    )
    expect(item).toBeDefined()
    flushSync(() => item?.click())
    await vi.waitFor(() =>
      expect(
        paneState.handles.every((handle) => handle.setComparisonSelection.mock.calls.length > 0)
      ).toBe(true)
    )
    expect(createUniver).toHaveBeenCalledTimes(2)

    flushSync(() => root.render(renderViewer('cmp-2', docComparison('cmp-2'), createUniver)))
    await vi.waitFor(() => expect(createUniver).toHaveBeenCalledTimes(4))
    await vi.waitFor(() =>
      expect(runtimes.slice(0, 2).every((runtime) => runtime.dispose.mock.calls.length === 1)).toBe(
        true
      )
    )
  })

  it('does not call the factory for a missing side', async () => {
    const createUniver = vi.fn(async () => ({ univer: {} as Univer, dispose: vi.fn() }))
    const comparison = docComparison('cmp-missing', true)
    flushSync(() => root.render(renderViewer('cmp-missing', comparison, createUniver)))
    await vi.waitFor(() => expect(createUniver).toHaveBeenCalledTimes(1))
    expect(host.textContent).toContain('Not present')

    flushSync(() =>
      root.render(
        renderViewer('cmp-missing', comparison, createUniver, { locale: LocaleType.ZH_CN })
      )
    )
    await vi.waitFor(() => expect(host.textContent).toContain('此侧不存在'))
  })

  it('renders an inline error when both Sheet snapshots are missing', async () => {
    const createUniver = vi.fn(async () => ({ univer: {} as Univer, dispose: vi.fn() }))

    flushSync(() =>
      root.render(renderViewer('cmp-missing-sheet', missingSheetComparison(), createUniver))
    )

    await vi.waitFor(() => expect(host.textContent).toContain('Comparison payload is invalid'))
    expect(createUniver).not.toHaveBeenCalled()
  })

  it('recreates Slide panes on page changes and preserves the selected page', async () => {
    const lifecycle: string[] = []
    const createUniver = vi.fn(async () => {
      lifecycle.push('create')
      return {
        univer: {} as Univer,
        dispose: vi.fn(() => lifecycle.push('dispose'))
      }
    })
    const comparison = slideComparison('cmp-slide')

    flushSync(() => root.render(renderViewer('cmp-slide', comparison, createUniver)))
    await vi.waitFor(() => expect(createUniver).toHaveBeenCalledTimes(2))

    const secondSlide = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Slide 2'
    )
    expect(secondSlide).toBeDefined()
    flushSync(() => secondSlide?.click())
    await vi.waitFor(() => expect(createUniver).toHaveBeenCalledTimes(4))
    expect(lifecycle.slice(2, 6)).toEqual(['dispose', 'dispose', 'create', 'create'])

    const pageRecreated = paneState.createCalls.slice(-2)
    expect(pageRecreated.map((options) => options.initialSlideId)).toEqual([undefined, 'slide-2'])
    expect(pageRecreated.map((options) => options.selectedItemId)).toEqual([
      'element-2',
      'element-2'
    ])
    expect(
      pageRecreated.every((options) =>
        (options.items as Array<{ scope?: { stableId?: string } }>).every(
          (item) => item.scope?.stableId === 'slide-2'
        )
      )
    ).toBe(true)

    flushSync(() =>
      root.render(renderViewer('cmp-slide', comparison, createUniver, { darkMode: true }))
    )
    await vi.waitFor(() => expect(createUniver).toHaveBeenCalledTimes(6))

    const recreated = paneState.createCalls.slice(-2)
    expect(recreated.map((options) => options.initialSlideId)).toEqual([undefined, 'slide-2'])
    expect(recreated.map((options) => options.selectedItemId)).toEqual(['element-2', 'element-2'])
    await vi.waitFor(() =>
      expect(
        paneState.handles
          .slice(-2)
          .every((handle) =>
            handle.focusComparisonTarget.mock.calls.some(
              ([target]) => (target as { stableId?: string }).stableId === 'element-2'
            )
          )
      ).toBe(true)
    )
  })
})

function renderViewer(
  key: string,
  comparison: UnitComparisonViewerValue,
  createUniver: UnitComparisonUniverFactory,
  options: { readonly darkMode?: boolean; readonly locale?: LocaleType } = {}
) {
  return (
    <UnitComparisonViewer
      key={key}
      comparison={comparison}
      createUniver={createUniver}
      locale={options.locale ?? LocaleType.EN_US}
      darkMode={options.darkMode ?? false}
    />
  )
}

function slideComparison(comparisonId: string): UnitComparisonViewerValue {
  const leftUnitData = {
    id: 'slide-unit',
    activeSlideId: 'slide-1',
    slides: { 'slide-1': {} }
  } as unknown as ISlideData
  const rightUnitData = {
    id: 'slide-unit',
    activeSlideId: 'slide-1',
    slides: { 'slide-1': {}, 'slide-2': {} }
  } as unknown as ISlideData
  const unit = {
    unitId: 'slide-unit',
    type: UNIT_TYPE_SLIDE,
    name: 'Slides'
  } as const
  const item = (slideId: string, elementId: string, title: string, kind: 'insert' | 'update') => ({
    id: elementId,
    stableId: elementId,
    parentStableId: slideId,
    scope: { entityType: 'slide' as const, stableId: slideId },
    kind,
    entityType: 'slide-element',
    path: ['slides', slideId, 'elements', elementId],
    title,
    moved: false,
    changes: [],
    details: [],
    locations: { left: null, right: null }
  })
  const result = {
    schemaVersion: 1,
    comparisonId,
    unit,
    fidelity: 'history',
    stale: false,
    detail: 'full',
    summary: { total: 2, insert: 1, delete: 0, update: 1, moved: 0, byEntityType: {} },
    coverage: { supportedEntityTypes: ['slide-element'] },
    scopes: [
      { entityType: 'slide', stableId: 'slide-1', displayName: 'Slide 1', kind: 'update' },
      { entityType: 'slide', stableId: 'slide-2', displayName: 'Slide 2', kind: 'insert' }
    ],
    page: { offset: 0, limit: 100, matched: 2, hasMore: false },
    items: [
      item('slide-1', 'element-1', 'Element 1', 'update'),
      item('slide-2', 'element-2', 'Element 2', 'insert')
    ],
    diagnostics: { readiness: 'ready', unsupportedMutationIds: [], codes: [] },
    productContext: { kind: 'slide' }
  } as const
  return {
    result,
    left: { label: 'Before', unitData: leftUnitData },
    right: { label: 'After', revision: 2, unitData: rightUnitData }
  }
}

function missingSheetComparison(): UnitComparisonViewerValue {
  return {
    result: {
      schemaVersion: 1,
      comparisonId: 'cmp-missing-sheet',
      unit: { unitId: 'book-1', type: UNIT_TYPE_SHEET, name: 'Workbook' },
      fidelity: 'history',
      stale: false,
      detail: 'full',
      summary: { total: 0, insert: 0, delete: 0, update: 0, moved: 0, byEntityType: {} },
      coverage: { supportedEntityTypes: [] },
      scopes: [],
      page: { offset: 0, limit: 100, matched: 0, hasMore: false },
      items: [],
      diagnostics: { readiness: 'ready', unsupportedMutationIds: [], codes: [] },
      productContext: { kind: 'sheet', sheets: [] }
    },
    left: { label: 'Before', unitData: null },
    right: { label: 'After', unitData: null }
  }
}

function docComparison(comparisonId: string, missingLeft = false): UnitComparisonViewerValue {
  const unitData = { id: 'doc-1' } as IDocumentData
  const result = {
    schemaVersion: 1,
    comparisonId,
    unit: { unitId: 'doc-1', type: UNIT_TYPE_DOC, name: 'Document' },
    fidelity: 'history',
    stale: false,
    detail: 'full',
    summary: { total: 1, insert: 0, delete: 0, update: 1, moved: 0, byEntityType: {} },
    coverage: { supportedEntityTypes: ['paragraph'] },
    scopes: [],
    page: { offset: 0, limit: 100, matched: 1, hasMore: false },
    items: [
      {
        id: 'paragraph:p1',
        stableId: 'p1',
        kind: 'update',
        entityType: 'paragraph',
        path: ['body', 'paragraphs', 'p1'],
        title: 'Paragraph',
        moved: false,
        changes: [],
        details: [],
        locations: { left: null, right: null }
      }
    ],
    diagnostics: { readiness: 'ready', unsupportedMutationIds: [], codes: [] },
    productContext: {
      kind: 'doc',
      paragraphAlignment: {
        total: 0,
        page: { offset: 0, limit: 100, matched: 0, hasMore: false },
        rows: []
      }
    }
  } as const
  return {
    result,
    left: { label: 'Before', unitData: missingLeft ? null : unitData },
    right: { label: 'After', revision: 2, unitData }
  }
}
