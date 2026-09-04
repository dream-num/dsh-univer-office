import type { IWorkbookData } from '@univerjs/core'
import { BooleanNumber, CellValueType, LocaleType } from '@univerjs/core'
import { describe, expect, it } from 'vitest'
import { createContentComparisonSnapshot } from '../src/sheet/workbook-comparison-display.js'

function styledWorkbook(): IWorkbookData {
  return {
    id: 'book',
    name: 'Styled',
    appVersion: '1',
    locale: LocaleType.EN_US,
    styles: {
      heading: { bl: BooleanNumber.TRUE, bg: { rgb: '#123456' }, n: { pattern: '$0.00' } }
    },
    defaultStyle: 'heading',
    sheetOrder: ['sheet'],
    sheets: {
      sheet: {
        id: 'sheet',
        defaultStyle: { it: BooleanNumber.TRUE },
        rowCount: 1000000,
        columnCount: 100,
        defaultRowHeight: 24,
        defaultColumnWidth: 100,
        rowData: { 0: { h: 40, s: 'heading' }, 1: { ah: 32, ia: BooleanNumber.TRUE } },
        columnData: { 0: { w: 200, s: { cl: { rgb: 'red' } } } },
        mergeData: [{ startRow: 5, endRow: 5, startColumn: 0, endColumn: 2 }],
        freeze: { startRow: 1, startColumn: -1, xSplit: 0, ySplit: 1 },
        cellData: {
          0: {
            0: { v: 'Heading', s: 'heading' },
            1: { v: 12.5, t: CellValueType.NUMBER, s: { n: { pattern: '$0.00' } } }
          },
          1: { 0: { f: '=SUM(B1:B3)', si: 'shared', ref: 'A2:A3', v: 42, s: 'heading' } },
          2: { 0: { si: 'shared', v: 43 }, 1: { v: false, t: CellValueType.BOOLEAN } },
          3: {
            0: {
              p: {
                id: 'rich',
                body: {
                  dataStream: 'Rich\rtext\r\n',
                  textRuns: [{ st: 0, ed: 4, ts: { bl: BooleanNumber.TRUE } }]
                },
                documentStyle: {}
              }
            }
          },
          4: { 0: { s: 'heading' }, 1: { v: '', s: 'heading' } }
        }
      }
    }
  }
}

describe('content-only comparison snapshots', () => {
  it('clears named, inline, inherited and number styles, preserving values and sparse geometry', () => {
    const source = styledWorkbook()
    const original = structuredClone(source)
    const plain = createContentComparisonSnapshot(source)!
    const plainSheet = plain.sheets.sheet!
    const sourceSheet = source.sheets.sheet!
    expect(plain).not.toBe(source)
    expect(plain.styles).toEqual({})
    expect(plain.defaultStyle).toBeUndefined()
    expect(plainSheet.defaultStyle).toBeUndefined()
    expect(plainSheet.rowData).toEqual({ 0: { h: 40 }, 1: { ah: 32, ia: BooleanNumber.TRUE } })
    expect(plainSheet.columnData).toEqual({ 0: { w: 200 } })
    expect(plainSheet.cellData?.[0]).toEqual({
      0: { v: 'Heading' },
      1: { v: 12.5, t: CellValueType.NUMBER }
    })
    expect(plainSheet.cellData?.[4]).toEqual({ 0: {}, 1: { v: '' } })
    for (const key of [
      'rowCount',
      'columnCount',
      'mergeData',
      'freeze',
      'defaultRowHeight',
      'defaultColumnWidth'
    ] as const) {
      expect(plainSheet[key]).toEqual(sourceSheet[key])
    }
    expect(Object.keys(plainSheet.cellData!)).toHaveLength(5)
    expect(source).toEqual(original)
  })

  it('retains formula/shared-formula metadata and shows all rich text without its formatting', () => {
    const plain = createContentComparisonSnapshot(styledWorkbook())!
    const plainSheet = plain.sheets.sheet!
    expect(plainSheet.cellData?.[1]?.[0]).toEqual({
      f: '=SUM(B1:B3)',
      si: 'shared',
      ref: 'A2:A3',
      v: 42
    })
    expect(plainSheet.cellData?.[2]).toEqual({
      0: { si: 'shared', v: 43 },
      1: { v: false, t: CellValueType.BOOLEAN }
    })
    expect(plainSheet.cellData?.[3]?.[0]).toEqual({ v: 'Rich\ntext', t: CellValueType.STRING })
  })

  it.each([false, true])(
    'removes conditional/range styling but keeps tables and unrelated resources (legacy=%s)',
    (legacy) => {
      const source = styledWorkbook()
      const table = {
        id: 'table',
        name: 'Sales',
        range: { startRow: 0, endRow: 4, startColumn: 0, endColumn: 1 },
        columns: [],
        options: { tableStyleId: 'table-default-1', showHeader: true }
      }
      source.resources = [
        { name: 'SHEET_CONDITIONAL_FORMATTING_PLUGIN', data: '{"sheet":[{"style":{"bl":1}}]}' },
        { name: 'SHEET_RANGE_THEME_MODEL_PLUGIN', data: '{}' },
        {
          name: 'SHEET_TABLE_PLUGIN',
          data: JSON.stringify({ sheet: legacy ? [table] : { tables: [table] } })
        },
        { name: 'SHEET_CHART_PLUGIN', data: '{"chartId":"keep"}' },
        { name: 'SHEET_DATA_VALIDATION_PLUGIN', data: '{"rules":[]}' }
      ]
      const original = structuredClone(source)
      const plain = createContentComparisonSnapshot(source)!
      expect(
        plain.resources?.some((resource) => resource.name === 'SHEET_CONDITIONAL_FORMATTING_PLUGIN')
      ).toBe(false)
      const entry = JSON.parse(
        plain.resources!.find((resource) => resource.name === 'SHEET_TABLE_PLUGIN')!.data
      ).sheet
      const displayedTable = legacy ? entry[0] : entry.tables[0]
      expect(displayedTable).toEqual({
        ...table,
        options: { ...table.options, tableStyleId: 'table-comparison-content-plain' }
      })
      const theme = JSON.parse(
        plain.resources!.find((resource) => resource.name === 'SHEET_RANGE_THEME_MODEL_PLUGIN')!
          .data
      )
      expect(theme.rangeThemeStyleMapJson[displayedTable.options.tableStyleId]).toEqual({
        name: displayedTable.options.tableStyleId
      })
      expect(plain.resources).toEqual(expect.arrayContaining(source.resources.slice(3)))
      expect(source).toEqual(original)
    }
  )

  it('handles missing snapshots and sparse/missing sheet data', () => {
    expect(createContentComparisonSnapshot(null)).toBeNull()
    const source = styledWorkbook()
    source.sheets = { empty: {} }
    expect(createContentComparisonSnapshot(source)?.sheets).toEqual({ empty: {} })
  })

  it.each(['invalid json', 'null', '{"sheet":{"future":[]}}'])(
    'leaves unreadable table resources to the SDK: %s',
    (data) => {
      const source = styledWorkbook()
      source.resources = [{ name: 'SHEET_TABLE_PLUGIN', data }]
      expect(createContentComparisonSnapshot(source)?.resources).toEqual(source.resources)
    }
  )
})
