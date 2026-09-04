import type { IRange, IWorkbookData, IWorksheetData } from '@univerjs/core'
import type {
  IUnitComparisonAxisAlignment as UnitComparisonAxisAlignment,
  IUnitComparisonItem as UnitComparisonContextItem,
  IUnitComparisonLocation as UnitComparisonContextLocation,
  IUnitComparisonResult as UnitComparisonContext
} from '../comparison-types.js'
import { buildWorkbookCompareModel, WorkbookCompareTitleCode } from './workbook-comparison-model.js'
import { createWorkbookComparisonDisplaySnapshot } from './workbook-comparison-display.js'
import type {
  WorkbookCompareCategory,
  WorkbookCompareCellChange,
  WorkbookCompareInfo,
  WorkbookCompareItem,
  WorkbookCompareModel,
  WorkbookCompareRangeTarget,
  WorkbookCompareSheetData,
  WorkbookCompareSheetGapConfig,
  WorkbookCompareSheetPresentation
} from './workbook-comparison-model.js'

const CATEGORIES: WorkbookCompareCategory[] = [
  'workbook',
  'worksheet',
  'cell',
  'row-column',
  'move',
  'condition-format',
  'data-validation',
  'sparkline',
  'table',
  'shape',
  'chart',
  'pivot'
]

const RESOURCE_CATEGORIES = new Set<WorkbookCompareCategory>([
  'condition-format',
  'data-validation',
  'sparkline',
  'table',
  'shape',
  'chart',
  'pivot'
])

/** Resource changes navigate to their affected range, but do not imply that every cell changed. */
export function isWorkbookCompareResourceCategory(category: WorkbookCompareCategory): boolean {
  return RESOURCE_CATEGORIES.has(category)
}

/** Keep semantic content (including value type) separate from cell style in the tree and canvas. */
export function isWorkbookCompareDetailVisible(
  path: readonly string[],
  mode: 'value' | 'style'
): boolean {
  return mode === 'style' ? path[0] === 'style' : path[0] !== 'style'
}

/** Project SDK semantics into the existing native Sheet viewer. No snapshot or mutation diff runs here. */
export function workbookComparisonFromContext(input: {
  readonly context: UnitComparisonContext
  readonly left: IWorkbookData | null
  readonly right: IWorkbookData | null
  readonly mode: 'value' | 'style'
}): WorkbookCompareModel {
  const contextSheets =
    input.context.productContext.kind === 'sheet' ? input.context.productContext.sheets : []
  const items = input.context.items.map((item) => projectItem(item, input.left, input.right))
  const itemById = new Map(input.context.items.map((item) => [item.id, item]))
  const sheetIds = new Set([
    ...Object.keys(input.left?.sheets ?? {}),
    ...Object.keys(input.right?.sheets ?? {})
  ])
  const worksheets: Record<string, WorkbookCompareSheetData> = {}
  for (const sheetId of sheetIds) {
    const sheetItems = items.filter((item) => item.sheetId === sheetId)
    const categories = Object.fromEntries(
      CATEGORIES.filter((category) => category !== 'workbook').map((category) => [
        category,
        sheetItems.filter((item) => item.category === category)
      ])
    ) as WorkbookCompareSheetData['categories']
    const leftSheet = input.left?.sheets[sheetId]
    const rightSheet = input.right?.sheets[sheetId]
    const axes = contextSheets.find((sheet) => sheet.id === sheetId)
    const cellChanges: WorkbookCompareCellChange[] = categories.cell.map((item) => {
      const source = itemById.get(item.id)!
      const before = record(source.values?.left)
      const after = record(source.values?.right)
      return {
        address: item.address!,
        kind: item.kind,
        selection: item.selection!,
        formula: { base: display(before.formula), current: display(after.formula) },
        value: { base: display(before.value), current: display(after.value) },
        styles: item.detailLines.filter((line) => line.semanticPath[0] === 'style')
      }
    })
    const presentation = projectPresentation(
      sheetItems,
      leftSheet,
      rightSheet,
      axes?.rows ?? [],
      axes?.columns ?? [],
      input.mode
    )
    worksheets[sheetId] = {
      sheetId,
      sheetName: rightSheet?.name ?? leftSheet?.name ?? sheetId,
      items: sheetItems,
      categories,
      cellChanges,
      cellItemByCurrentPosition: Object.fromEntries(
        categories.cell.flatMap((item) =>
          item.selection?.current == null
            ? []
            : [[`${item.selection.current.startRow}:${item.selection.current.startColumn}`, item]]
        )
      ),
      presentation,
      selectionMapping: {
        ...(axes?.rows === undefined ? {} : { rowAlignment: axes.rows }),
        ...(axes?.columns === undefined ? {} : { columnAlignment: axes.columns })
      }
    }
  }
  const compareInfo: WorkbookCompareInfo = {
    snapshotAlignmentDegraded: input.context.diagnostics.readiness === 'degraded',
    workbookItems: items.filter((item) => item.sheetId === undefined),
    worksheets
  }
  const model = buildWorkbookCompareModel({
    baseSnapshot: input.left,
    targetSnapshot: input.right,
    compareInfo
  })
  return {
    ...model,
    displayedSnapshots: {
      base: createWorkbookComparisonDisplaySnapshot(input.left, input.mode),
      current: createWorkbookComparisonDisplaySnapshot(input.right, input.mode)
    },
    unsupportedMutationIds: input.context.diagnostics.unsupportedMutationIds
  }
}

function projectItem(
  source: UnitComparisonContextItem,
  left: IWorkbookData | null,
  right: IWorkbookData | null
): WorkbookCompareItem {
  const category = CATEGORIES.includes(source.entityType as WorkbookCompareCategory)
    ? (source.entityType as WorkbookCompareCategory)
    : 'workbook'
  const sheetId =
    category === 'workbook'
      ? undefined
      : category === 'worksheet'
        ? source.stableId
        : source.parentStableId
  const sheet =
    sheetId === undefined ? undefined : (right?.sheets[sheetId] ?? left?.sheets[sheetId])
  const selection = {
    base: locationRange(source.locations.left, source, 'left', sheetId, sheet),
    current: locationRange(source.locations.right, source, 'right', sheetId, sheet)
  }
  const target = source.locations.right?.target ?? source.locations.left?.target
  const axis = target?.kind === 'sheet-axis' ? target.axis : undefined
  const index = target?.kind === 'sheet-axis' ? target.start + 1 : 1
  let titleCode: WorkbookCompareTitleCode | undefined
  if (category === 'row-column') {
    titleCode = source.moved
      ? axis === 'row'
        ? WorkbookCompareTitleCode.RowsMoved
        : WorkbookCompareTitleCode.ColumnsMoved
      : source.kind === 'insert'
        ? axis === 'row'
          ? WorkbookCompareTitleCode.InsertedRows
          : WorkbookCompareTitleCode.InsertedColumns
        : source.kind === 'delete'
          ? axis === 'row'
            ? WorkbookCompareTitleCode.DeletedRows
            : WorkbookCompareTitleCode.DeletedColumns
          : axis === 'row'
            ? WorkbookCompareTitleCode.RowChanged
            : WorkbookCompareTitleCode.ColumnChanged
  } else if (category === 'worksheet') {
    titleCode =
      source.kind === 'insert'
        ? WorkbookCompareTitleCode.SheetAdded
        : source.kind === 'delete'
          ? WorkbookCompareTitleCode.SheetDeleted
          : undefined
    if (titleCode === undefined && source.changes.some((change) => change.path[0] === 'name'))
      titleCode = WorkbookCompareTitleCode.SheetRenamed
  } else if (
    category === 'workbook' &&
    source.changes.some((change) => change.path[0] === 'name')
  ) {
    titleCode = WorkbookCompareTitleCode.WorkbookRenamed
  }
  const address =
    category === 'cell'
      ? (source.locations.right?.stableId ?? source.locations.left?.stableId ?? source.stableId)
      : undefined
  return {
    id: source.id,
    category,
    kind: source.kind,
    mode:
      category !== 'cell'
        ? 'structure'
        : source.changes.every((change) => change.path[0] === 'style')
          ? 'style'
          : 'value',
    title: address ?? (source.title === source.stableId ? '' : source.title),
    selection,
    detailLines: source.changes.map((change) => ({
      label: '',
      semanticPath: change.path,
      kind: change.kind,
      before: display(change.before),
      after: display(change.after)
    })),
    ...(sheetId === undefined ? {} : { sheetId, sheetName: sheet?.name ?? sheetId }),
    ...(address === undefined ? {} : { address }),
    ...(titleCode === undefined
      ? {}
      : { titleCode, titleParameters: { index, name: sheet?.name ?? '' } })
  }
}

function locationRange(
  location: UnitComparisonContextLocation | null,
  item: UnitComparisonContextItem,
  side: 'left' | 'right',
  sheetId: string | undefined,
  sheet: Partial<IWorksheetData> | undefined
): WorkbookCompareRangeTarget | null {
  if (location === null || sheetId === undefined) return null
  const target = location.target
  if (item.entityType === 'cell') {
    const address = /^([A-Z]+)(\d+)$/u.exec(location.stableId)
    if (address === null) return null
    const column =
      [...address[1]!].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1
    const row = Number(address[2]) - 1
    return { sheetId, startRow: row, endRow: row, startColumn: column, endColumn: column }
  }
  if (item.entityType === 'row-column' && target?.kind === 'sheet-axis') {
    return target.axis === 'row'
      ? {
          sheetId,
          startRow: target.start,
          endRow: target.end,
          startColumn: 0,
          endColumn: Math.max(0, (sheet?.columnCount ?? 1) - 1)
        }
      : {
          sheetId,
          startColumn: target.start,
          endColumn: target.end,
          startRow: 0,
          endRow: Math.max(0, (sheet?.rowCount ?? 1) - 1)
        }
  }
  const value = record(item.values?.[side])
  const targetRange =
    target?.kind === 'sheet-range' ? (target.range ?? target.ranges?.[0]) : undefined
  const range = record(
    targetRange ?? value.range ?? (Array.isArray(value.ranges) ? value.ranges[0] : undefined)
  )
  if (
    ['startRow', 'endRow', 'startColumn', 'endColumn'].every(
      (key) => typeof range[key] === 'number'
    )
  )
    return { sheetId, ...range } as WorkbookCompareRangeTarget
  return null
}

function projectPresentation(
  items: readonly WorkbookCompareItem[],
  left: Partial<IWorksheetData> | undefined,
  right: Partial<IWorksheetData> | undefined,
  rows: readonly UnitComparisonAxisAlignment[],
  columns: readonly UnitComparisonAxisAlignment[],
  mode: 'value' | 'style'
): WorkbookCompareSheetPresentation {
  const highlights = (role: 'base' | 'current') =>
    items.flatMap((item) => {
      const range = item.selection?.[role]
      if (range == null) return []
      if (isWorkbookCompareResourceCategory(item.category)) return []
      if (item.category === 'cell') {
        const visible = item.detailLines.some((line) =>
          isWorkbookCompareDetailVisible(line.semanticPath, mode)
        )
        if (!visible) return []
      }
      return [
        {
          range: range as IRange,
          kind: item.kind
        }
      ]
    })
  return {
    baseCellHighlights: [],
    currentCellHighlights: [],
    baseRowHighlights: [],
    currentRowHighlights: [],
    baseColumnHighlights: [],
    currentColumnHighlights: [],
    baseOverlayConfig: null,
    currentOverlayConfig: null,
    baseRangeHighlights: highlights('base'),
    currentRangeHighlights: highlights('current'),
    baseGaps: axisGaps(left, right, rows, columns, 'left'),
    currentGaps: axisGaps(left, right, rows, columns, 'right')
  }
}

function axisGaps(
  left: Partial<IWorksheetData> | undefined,
  right: Partial<IWorksheetData> | undefined,
  rows: readonly UnitComparisonAxisAlignment[],
  columns: readonly UnitComparisonAxisAlignment[],
  side: 'left' | 'right'
): WorkbookCompareSheetGapConfig | null {
  const result: {
    rowGaps: Record<number, { size: number; color: string; stripeColor: string }>
    colGaps: Record<number, { size: number; color: string; stripeColor: string }>
  } = { rowGaps: {}, colGaps: {} }
  for (const [axis, runs] of [
    ['row', rows],
    ['column', columns]
  ] as const) {
    let insertionIndex = 0
    for (const run of runs) {
      const ownStart = side === 'left' ? run.leftStart : run.rightStart
      const peerStart = side === 'left' ? run.rightStart : run.leftStart
      if (ownStart !== null) {
        insertionIndex = ownStart + run.count
        continue
      }
      if (peerStart === null) continue
      const size = axisPixelSize(side === 'left' ? right : left, axis, peerStart, run.count)
      const gaps = axis === 'row' ? result.rowGaps : result.colGaps
      gaps[insertionIndex] = {
        size: (gaps[insertionIndex]?.size ?? 0) + size,
        color: '#fee2e2',
        stripeColor: '#fecaca'
      }
    }
  }
  return Object.keys(result.rowGaps).length + Object.keys(result.colGaps).length === 0
    ? null
    : result
}

function axisPixelSize(
  sheet: Partial<IWorksheetData> | undefined,
  axis: 'row' | 'column',
  start: number,
  count: number
): number {
  const fallback =
    axis === 'row' ? (sheet?.defaultRowHeight ?? 24) : (sheet?.defaultColumnWidth ?? 88)
  const data = axis === 'row' ? sheet?.rowData : sheet?.columnData
  let size = fallback * count
  for (const [key, value] of Object.entries(data ?? {})) {
    const index = Number(key)
    if (index < start || index >= start + count) continue
    const dimension = record(value)
    const custom = dimension[axis === 'row' ? 'h' : 'w']
    size += (dimension.hd === 1 ? 0 : typeof custom === 'number' ? custom : fallback) - fallback
  }
  return size
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function display(value: unknown): string | null {
  return value == null ? null : typeof value === 'string' ? value : JSON.stringify(value)
}
