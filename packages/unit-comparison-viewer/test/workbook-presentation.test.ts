import type { IWorkbookData } from '@univerjs/core'
import { describe, expect, it } from 'vitest'
import {
  buildWorkbookCompareSidebarTree,
  buildWorkbookCompareModel,
  mapSelectionTargetAcrossPanes,
  mapScrollTargetAcrossPanes
} from '../src/sheet/workbook-comparison-model.js'

describe('Sheet presentation boundary', () => {
  it('does not infer a semantic change from snapshots absent SDK items', () => {
    const left = { name: 'Before', sheetOrder: [], sheets: {} } as unknown as IWorkbookData
    const right = { name: 'After', sheetOrder: [], sheets: {} } as unknown as IWorkbookData
    const model = buildWorkbookCompareModel({
      baseSnapshot: left,
      targetSnapshot: right,
      compareInfo: { worksheets: {}, workbookItems: [], snapshotAlignmentDegraded: false }
    })
    expect(model.items).toEqual([])
    expect(model.summary.hasChanges).toBe(false)
    expect(model.displayedSnapshots.base).toBe(left)
    expect(model.displayedSnapshots.current).toBe(right)
  })

  it('preserves native coordinates when the SDK has no mapping for the sheet', () => {
    const compareInfo = { worksheets: {}, workbookItems: [], snapshotAlignmentDegraded: false }
    const range = { sheetId: 'sheet', startRow: 10, endRow: 20, startColumn: 3, endColumn: 4 }
    const scroll = {
      sheetId: 'sheet',
      sheetViewStartRow: 10,
      sheetViewStartColumn: 3,
      offsetX: 12,
      offsetY: 5
    }
    expect(
      mapSelectionTargetAcrossPanes({ compareInfo, sourceRole: 'base', target: range })
    ).toEqual(range)
    expect(
      mapScrollTargetAcrossPanes({ compareInfo, sourceRole: 'current', target: scroll })
    ).toEqual(scroll)
  })

  it('keeps scroll synchronization when one viewport axis starts inside an inserted gap', () => {
    const compareInfo = {
      snapshotAlignmentDegraded: false,
      workbookItems: [],
      worksheets: {
        sheet: {
          selectionMapping: {
            columnAlignment: [
              { leftStart: null, rightStart: 0, count: 4 },
              { leftStart: 0, rightStart: 4, count: 8 }
            ],
            rowAlignment: [{ leftStart: 0, rightStart: 0, count: 45 }]
          }
        }
      }
    } as never

    expect(
      mapScrollTargetAcrossPanes({
        compareInfo,
        sourceRole: 'current',
        target: {
          sheetId: 'sheet',
          sheetViewStartRow: 25,
          sheetViewStartColumn: 0,
          offsetX: 0,
          offsetY: 7
        }
      })
    ).toEqual({
      sheetId: 'sheet',
      sheetViewStartRow: 25,
      sheetViewStartColumn: 0,
      offsetX: 0,
      offsetY: 7
    })
  })

  it('groups cell changes into ordered, collapsible row nodes like the legacy Compare tree', () => {
    const item = (id: string, row: number, column: number) => ({
      category: 'cell' as const,
      detailLines: [],
      id,
      kind: 'update' as const,
      mode: 'value' as const,
      selection: {
        base: {
          sheetId: 'sheet',
          startRow: row,
          endRow: row,
          startColumn: column,
          endColumn: column
        },
        current: {
          sheetId: 'sheet',
          startRow: row,
          endRow: row,
          startColumn: column,
          endColumn: column
        }
      },
      sheetId: 'sheet',
      title: id
    })
    const tree = buildWorkbookCompareSidebarTree({
      activeSheetId: 'sheet',
      items: [item('B3', 2, 1), item('A1', 0, 0), item('C3', 2, 2)],
      labels: {
        categories: { cell: 'Cells' },
        emptyText: 'Empty',
        noActiveSheetLabel: 'No worksheet',
        noCompareDataLabel: 'No changes',
        rowLabel: (index) => `Row ${index}`,
        styleGroupLabel: 'Formatting',
        workbookRootLabel: 'Workbook'
      },
      model: { worksheets: [{ sheetId: 'sheet', sheetName: 'Plan' }] } as never,
      searchQuery: '',
      tab: 'worksheet'
    })

    expect(tree[0]?.children?.[0]).toMatchObject({
      label: 'Cells (3)',
      children: [
        { id: 'sheet:cell:row:0', label: 'Row 1 (1)', children: [{ itemId: 'A1' }] },
        {
          id: 'sheet:cell:row:2',
          label: 'Row 3 (2)',
          children: [{ itemId: 'B3' }, { itemId: 'C3' }]
        }
      ]
    })
  })
})
