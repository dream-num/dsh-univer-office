import type { ICellData, IWorkbookData } from '@univerjs/core'
import { CellValueType, extractPureTextFromCell } from '@univerjs/core'
import { SHEET_CONDITIONAL_FORMATTING_PLUGIN } from '@univerjs/sheets-conditional-formatting'
import type { ITableJson } from '@univerjs/sheets-table'
import { UniverSheetsTablePlugin } from '@univerjs/sheets-table'

// The resource key is part of the snapshot format, but is not exported by Sheets.
const RANGE_THEME_RESOURCE = 'SHEET_RANGE_THEME_MODEL_PLUGIN'
const PLAIN_TABLE_THEME = 'table-comparison-content-plain'
const COMPARISON_FREEZE = { startColumn: -1, startRow: -1, xSplit: 0, ySplit: 0 }

/**
 * Create the plain, content-only Sheet comparison display copy.
 * Semantic comparison always uses the original snapshots. Keep geometry, formulas,
 * table identities and unrelated plugin data; diff colors are separate native overlays.
 */
export function createContentComparisonSnapshot(
  source: IWorkbookData | null
): IWorkbookData | null {
  if (source === null) return null
  const snapshot = structuredClone(source)
  snapshot.styles = {}
  delete snapshot.defaultStyle
  for (const sheet of Object.values(snapshot.sheets)) {
    delete sheet.defaultStyle
    for (const row of Object.values(sheet.rowData ?? {})) {
      if (row) delete row.s
    }
    for (const column of Object.values(sheet.columnData ?? {})) {
      if (column) delete column.s
    }
    for (const row of Object.values(sheet.cellData ?? {})) {
      for (const cell of Object.values<ICellData | null>(row ?? {})) {
        if (!cell) continue
        delete cell.s
        if (cell.p?.body) {
          // Use the SDK's plain-text extraction, including rich-text-only cells.
          cell.v = extractPureTextFromCell(cell).replaceAll('\r', '\n')
          cell.t = CellValueType.STRING
          delete cell.p
        }
      }
    }
  }
  if (snapshot.resources) {
    // These resources only supply visual styles; leaving them would repaint the cells.
    snapshot.resources = snapshot.resources.filter(
      (resource) =>
        resource.name !== SHEET_CONDITIONAL_FORMATTING_PLUGIN &&
        resource.name !== RANGE_THEME_RESOURCE
    )
    let hasTables = false
    for (const resource of snapshot.resources) {
      if (resource.name !== UniverSheetsTablePlugin.pluginName) continue
      let tablesBySheet: Record<string, { tables?: ITableJson[] } | ITableJson[]>
      try {
        tablesBySheet = JSON.parse(resource.data)
      } catch {
        // Leave malformed/unsupported resources to the SDK's normal loading behavior.
        continue
      }
      if (!tablesBySheet || typeof tablesBySheet !== 'object') continue
      for (const entry of Object.values(tablesBySheet)) {
        const tables = Array.isArray(entry) ? entry : entry?.tables
        if (!Array.isArray(tables)) continue
        for (const table of tables) {
          if (!table || typeof table !== 'object') continue
          // An absent style id means "use the default colored table theme" in the SDK.
          table.options = { ...table.options, tableStyleId: PLAIN_TABLE_THEME }
          hasTables = true
        }
      }
      resource.data = JSON.stringify(tablesBySheet)
    }
    if (hasTables) {
      snapshot.resources.push({
        name: RANGE_THEME_RESOURCE,
        data: JSON.stringify({
          rangeThemeStyleRuleMap: {},
          rangeThemeStyleMapJson: { [PLAIN_TABLE_THEME]: { name: PLAIN_TABLE_THEME } }
        })
      })
    }
  }
  return snapshot
}

/**
 * Create a read-only canvas snapshot for one side of Sheet Compare.
 *
 * Freeze remains part of the semantic diff, but applying different freeze states to the two
 * canvases gives them different viewport origins and makes symmetric scrolling impossible.
 */
export function createWorkbookComparisonDisplaySnapshot(
  source: IWorkbookData | null,
  mode: 'value' | 'style'
): IWorkbookData | null {
  const snapshot = mode === 'value' ? createContentComparisonSnapshot(source) : source
  if (snapshot === null) return null

  return {
    ...snapshot,
    sheets: Object.fromEntries(
      Object.entries(snapshot.sheets).map(([sheetId, sheet]) => [
        sheetId,
        { ...sheet, freeze: { ...COMPARISON_FREEZE } }
      ])
    )
  }
}
