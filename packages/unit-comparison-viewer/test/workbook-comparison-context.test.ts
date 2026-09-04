import type { IWorkbookData } from '@univerjs/core'
import { LocaleType, UniverInstanceType } from '@univerjs/core'
import { SheetsUnitComparisonAdapter } from '@univerjs-pro/sheets-history'
import type { IUnitComparisonResult as UnitComparisonContext } from '../src/comparison-types.js'
import {
  buildWorkbookCompareSidebarTree,
  createWorkbookComparePaneFxStates,
  mapScrollTargetAcrossPanes,
  mapSelectionTargetAcrossPanes
} from '../src/sheet/workbook-comparison-model.js'
import { describe, expect, it } from 'vitest'
import { workbookComparisonFromContext } from '../src/sheet/workbook-comparison-context.js'

function workbook(inserted: boolean): IWorkbookData {
  return {
    id: 'book',
    name: 'Review',
    appVersion: '1',
    locale: LocaleType.EN_US,
    styles: {},
    sheetOrder: ['sheet'],
    sheets: {
      sheet: {
        id: 'sheet',
        name: 'Plan',
        rowCount: inserted ? 4 : 3,
        columnCount: 3,
        defaultRowHeight: 24,
        rowData: inserted ? { 0: { h: 40 } } : {},
        cellData: inserted
          ? { 0: { 0: { v: 'New' } }, 1: { 0: { f: '=SUM(B1:B3)' } }, 2: { 0: { v: 'Unchanged' } } }
          : { 0: { 0: { f: '=SUM(B1:B2)' } }, 1: { 0: { v: 'Unchanged' } } }
      }
    }
  }
}

function context(left: IWorkbookData, right: IWorkbookData): UnitComparisonContext {
  const adapter = new SheetsUnitComparisonAdapter()
  const result = adapter.compare({
    unitId: 'book',
    leftData: left,
    rightData: right,
    leftChangesets: [],
    rightChangesets: [
      {
        mutations: [
          {
            id: 'sheet.mutation.insert-row',
            data: { subUnitId: 'sheet', range: { startRow: 0, endRow: 0 } }
          }
        ]
      }
    ]
  })
  if (result.productContext?.type !== UniverInstanceType.UNIVER_SHEET)
    throw new Error('Missing Sheet context')
  return {
    schemaVersion: 1,
    comparisonId: 'test',
    unit: {
      unitId: 'book',
      name: 'Review',
      type: UniverInstanceType.UNIVER_SHEET
    },
    fidelity: 'history',
    stale: false,
    detail: 'full',
    items: result.items.map((item) => ({
      ...item,
      title: item.displayName ?? item.stableId,
      details: []
    })),
    summary: {
      total: result.items.length,
      insert: 0,
      delete: 0,
      update: 0,
      moved: 0,
      byEntityType: {}
    },
    page: { offset: 0, limit: 1000, matched: result.items.length, hasMore: false },
    coverage: { supportedEntityTypes: result.supportedEntityTypes },
    diagnostics: { readiness: 'ready', unsupportedMutationIds: [], codes: [] },
    scopes: result.scopes ?? [],
    productContext: {
      kind: 'sheet',
      sheets: result.productContext.sheets.map((sheet) => ({
        ...sheet,
        id: sheet.sheetId,
        status: 'update'
      }))
    }
  }
}

describe('SDK Sheet presentation projection', () => {
  it.each([
    ['formula', 'value'],
    ['value', 'value'],
    ['valueType', 'value'],
    ['style', 'style']
  ] as const)('keeps %s changes in the correct canvas display mode', (root, visibleMode) => {
    const left = workbook(false)
    const right = workbook(true)
    const api = context(left, right)
    const cell = api.items.find((item) => item.entityType === 'cell' && item.kind === 'update')!
    const scoped: UnitComparisonContext = {
      ...api,
      items: [
        {
          ...cell,
          changes: [
            { path: [root], kind: 'update', valueType: 'text', before: 'before', after: 'after' }
          ]
        }
      ]
    }
    for (const mode of ['value', 'style'] as const) {
      const model = workbookComparisonFromContext({ context: scoped, left, right, mode })
      const presentation = model.compareInfo.worksheets.sheet!.presentation
      expect(presentation.baseRangeHighlights).toHaveLength(mode === visibleMode ? 1 : 0)
      expect(presentation.currentRangeHighlights).toHaveLength(mode === visibleMode ? 1 : 0)
    }
  })

  it('retains structural changes and their alignment in both display modes', () => {
    const left = workbook(false)
    const right = workbook(true)
    const api = context(left, right)
    const content = workbookComparisonFromContext({ context: api, left, right, mode: 'value' })
    const formatting = workbookComparisonFromContext({ context: api, left, right, mode: 'style' })
    const structural = formatting.items.filter((item) => item.category !== 'cell')
    expect(structural.length).toBeGreaterThan(0)
    expect(structural.every((item) => item.mode === 'structure')).toBe(true)
    expect(formatting.compareInfo.worksheets.sheet?.presentation.baseGaps).toEqual(
      content.compareInfo.worksheets.sheet?.presentation.baseGaps
    )
  })

  it('uses real SDK items, formula segments, and compact axis mapping without mutating source data', () => {
    const left = workbook(false)
    const right = workbook(true)
    const original = JSON.stringify([left, right])
    const api = context(left, right)
    const model = workbookComparisonFromContext({ context: api, left, right, mode: 'value' })
    expect(model.items.map((item) => item.id).sort()).toEqual(
      api.items.map((item) => item.id).sort()
    )
    const sheet = model.compareInfo.worksheets.sheet!
    expect(sheet.presentation.baseGaps?.rowGaps?.[0]?.size).toBe(40)
    expect(sheet.presentation.baseGaps?.rowGaps?.[0]?.color).toBe('#fee2e2')
    expect(sheet.presentation.currentRangeHighlights).toContainEqual(
      expect.objectContaining({ kind: 'insert', range: expect.objectContaining({ startRow: 0 }) })
    )
    expect(sheet.presentation.baseRangeHighlights).toContainEqual(
      expect.objectContaining({ kind: 'update', range: expect.objectContaining({ startRow: 0 }) })
    )
    expect(
      mapSelectionTargetAcrossPanes({
        compareInfo: model.compareInfo,
        sourceRole: 'base',
        target: { sheetId: 'sheet', startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 }
      })
    ).toMatchObject({ startRow: 1, endRow: 1 })
    expect(
      mapSelectionTargetAcrossPanes({
        compareInfo: model.compareInfo,
        sourceRole: 'current',
        target: { sheetId: 'sheet', startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 }
      })
    ).toBeNull()
    expect(
      api.items.flatMap((item) => item.changes).find((change) => change.path[0] === 'formula')
        ?.segments
    ).toBeDefined()
    expect(JSON.stringify([left, right])).toBe(original)
    expect(model.summary.insertedRows).toBe(1)
    expect(model.summary.deletedRows).toBe(0)
    expect(
      mapScrollTargetAcrossPanes({
        compareInfo: model.compareInfo,
        sourceRole: 'base',
        target: {
          sheetId: 'sheet',
          sheetViewStartRow: 1,
          sheetViewStartColumn: 1,
          offsetX: 7,
          offsetY: 13
        }
      })
    ).toMatchObject({ sheetViewStartRow: 2, sheetViewStartColumn: 1, offsetX: 7, offsetY: 13 })
    const formulaItem = sheet.items.find(
      (item) => item.category === 'cell' && item.kind === 'update'
    )!
    expect(
      createWorkbookComparePaneFxStates({ compareInfo: model.compareInfo, item: formulaItem })
    ).toMatchObject({
      base: { activeCellLabel: 'A1', formula: '=SUM(B1:B2)' },
      current: { activeCellLabel: 'A2', formula: '=SUM(B1:B3)' }
    })
    expect(model.sheetOptions[0]).toMatchObject({ sheetId: 'sheet', status: 'update' })
    const tree = buildWorkbookCompareSidebarTree({
      activeSheetId: 'sheet',
      items: model.items,
      model,
      searchQuery: '',
      tab: 'worksheet',
      labels: {
        categories: { cell: '单元格' },
        emptyText: '空',
        noActiveSheetLabel: '无工作表',
        noCompareDataLabel: '无差异',
        rowLabel: (index) => `行 ${index}`,
        styleGroupLabel: '格式',
        workbookRootLabel: '工作簿'
      }
    })
    expect(tree).toEqual([
      expect.objectContaining({
        label: 'Plan',
        children: expect.arrayContaining([expect.objectContaining({ label: '单元格 (2)' })])
      })
    ])
  })

  it('never discovers extra differences when the SDK items are empty', () => {
    const left = workbook(false)
    const right = workbook(true)
    const api = context(left, right)
    const model = workbookComparisonFromContext({
      context: { ...api, items: [], productContext: { kind: 'sheet', sheets: [] } },
      left,
      right,
      mode: 'value'
    })
    expect(model.items).toEqual([])
    expect(model.compareInfo.worksheets.sheet?.presentation.baseRangeHighlights).toEqual([])
    expect(model.compareInfo.worksheets.sheet?.presentation.currentRangeHighlights).toEqual([])
    expect(model.displayedSnapshots).toEqual({
      base: expect.objectContaining({
        sheets: {
          sheet: expect.objectContaining({
            freeze: { startColumn: -1, startRow: -1, xSplit: 0, ySplit: 0 }
          })
        }
      }),
      current: expect.objectContaining({
        sheets: {
          sheet: expect.objectContaining({
            freeze: { startColumn: -1, startRow: -1, xSplit: 0, ySplit: 0 }
          })
        }
      })
    })
  })

  it('navigates to Sheet resource ranges without painting every affected cell', () => {
    const left = workbook(false)
    const right = workbook(true)
    const api = context(left, right)
    const resourceItems: UnitComparisonContext['items'] = [
      {
        id: 'table:table-1',
        stableId: 'table-1',
        parentStableId: 'sheet',
        kind: 'update',
        entityType: 'table',
        path: ['sheets', 'sheet', 'tables', 'table-1'],
        title: 'Revenue table',
        moved: false,
        changes: [
          { path: ['name'], kind: 'update', valueType: 'text', before: 'Old', after: 'New' }
        ],
        details: [],
        locations: {
          left: {
            path: ['sheets', 'sheet', 'tables', 'table-1'],
            stableId: 'table-1',
            parentStableId: 'sheet',
            target: {
              kind: 'sheet-range',
              entityType: 'table',
              stableId: 'table-1',
              comparisonStableId: 'table-1',
              parentStableId: 'sheet',
              range: { startRow: 0, endRow: 7, startColumn: 0, endColumn: 5 }
            }
          },
          right: {
            path: ['sheets', 'sheet', 'tables', 'table-1'],
            stableId: 'table-1',
            parentStableId: 'sheet',
            target: {
              kind: 'sheet-range',
              entityType: 'table',
              stableId: 'table-1',
              comparisonStableId: 'table-1',
              parentStableId: 'sheet',
              range: { startRow: 0, endRow: 8, startColumn: 0, endColumn: 6 }
            }
          }
        }
      },
      {
        id: 'data-validation:validation-1',
        stableId: 'validation-1',
        parentStableId: 'sheet',
        kind: 'insert',
        entityType: 'data-validation',
        path: ['sheets', 'sheet', 'dataValidations', 'validation-1'],
        title: 'Status validation',
        moved: false,
        changes: [{ path: [], kind: 'insert', valueType: 'object', after: {} }],
        details: [],
        locations: {
          left: null,
          right: {
            path: ['sheets', 'sheet', 'dataValidations', 'validation-1'],
            stableId: 'validation-1',
            parentStableId: 'sheet',
            target: {
              kind: 'sheet-range',
              entityType: 'data-validation',
              stableId: 'validation-1',
              comparisonStableId: 'validation-1',
              parentStableId: 'sheet',
              ranges: [{ startRow: 1, endRow: 8, startColumn: 5, endColumn: 5 }]
            }
          }
        }
      }
    ]
    const model = workbookComparisonFromContext({
      context: { ...api, items: resourceItems },
      left,
      right,
      mode: 'value'
    })
    const sheet = model.compareInfo.worksheets.sheet!

    expect(sheet.items.find((item) => item.id === 'table:table-1')?.selection).toEqual({
      base: { sheetId: 'sheet', startRow: 0, endRow: 7, startColumn: 0, endColumn: 5 },
      current: { sheetId: 'sheet', startRow: 0, endRow: 8, startColumn: 0, endColumn: 6 }
    })
    expect(
      sheet.items.find((item) => item.id === 'data-validation:validation-1')?.selection?.current
    ).toEqual({ sheetId: 'sheet', startRow: 1, endRow: 8, startColumn: 5, endColumn: 5 })
    expect(sheet.presentation.baseRangeHighlights).toEqual([])
    expect(sheet.presentation.currentRangeHighlights).toEqual([])
  })

  it('keeps deleted Sheet cells red on the base side', () => {
    const left = workbook(false)
    const right = workbook(true)
    const api = context(left, right)
    const cell = api.items.find((item) => item.entityType === 'cell')!
    const deleted = {
      ...cell,
      id: 'cell:deleted',
      kind: 'delete' as const,
      locations: { left: cell.locations.left ?? cell.locations.right, right: null }
    }
    const model = workbookComparisonFromContext({
      context: { ...api, items: [deleted] },
      left,
      right,
      mode: 'value'
    })

    expect(model.compareInfo.worksheets.sheet?.presentation.baseRangeHighlights).toContainEqual(
      expect.objectContaining({ kind: 'delete' })
    )
  })

  it.each(['value', 'style'] as const)(
    'disables canvas freeze in %s mode without mutating semantic snapshots',
    (mode) => {
      const left = workbook(false)
      const right = workbook(true)
      left.sheets.sheet!.freeze = { startColumn: -1, startRow: -1, xSplit: 0, ySplit: 0 }
      right.sheets.sheet!.freeze = { startColumn: -1, startRow: 4, xSplit: 0, ySplit: 4 }
      const originalRightFreeze = structuredClone(right.sheets.sheet!.freeze)
      const api = context(left, right)
      const model = workbookComparisonFromContext({ context: api, left, right, mode })

      expect(model.displayedSnapshots.base?.sheets.sheet?.freeze).toEqual({
        startColumn: -1,
        startRow: -1,
        xSplit: 0,
        ySplit: 0
      })
      expect(model.displayedSnapshots.current?.sheets.sheet?.freeze).toEqual({
        startColumn: -1,
        startRow: -1,
        xSplit: 0,
        ySplit: 0
      })
      expect(right.sheets.sheet!.freeze).toEqual(originalRightFreeze)
    }
  )

  it('can present a removed workbook with no right snapshot', () => {
    const left = workbook(false)
    const api = context(left, workbook(true))
    const model = workbookComparisonFromContext({
      context: { ...api, items: [], productContext: { kind: 'sheet', sheets: [] } },
      left,
      right: null,
      mode: 'value'
    })
    expect(model.displayedSnapshots.current).toBeNull()
    expect(model.sheetOptions[0]?.currentSheet).toBeNull()
  })
})
