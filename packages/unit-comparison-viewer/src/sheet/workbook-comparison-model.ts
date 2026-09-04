import type { IRange, IWorkbookData } from '@univerjs/core'

export type {
  WorkbookCompareFxDiffContentKind,
  WorkbookCompareFxDiffPane,
  WorkbookCompareFxDiffSegment,
  WorkbookComparePaneFxState
} from './workbook-fx-diff.js'
import type { WorkbookComparePaneFxState } from './workbook-fx-diff.js'

export type WorkbookCompareDiffKind = 'delete' | 'insert' | 'update'
export type WorkbookCompareMode = 'structure' | 'style' | 'value'
export type WorkbookCompareCategory =
  | 'cell'
  | 'chart'
  | 'condition-format'
  | 'data-validation'
  | 'move'
  | 'pivot'
  | 'row-column'
  | 'shape'
  | 'sparkline'
  | 'table'
  | 'workbook'
  | 'worksheet'
export type WorkbookComparePaneRole = 'base' | 'current'
export type WorkbookCompareSheetTabStatus = 'default' | WorkbookCompareDiffKind

/** Language-neutral message codes for application-owned comparison UI. */
export const WorkbookCompareTitleCode = {
  ColumnsMoved: 'columns-moved',
  ColumnChanged: 'column-changed',
  DeletedColumns: 'deleted-columns',
  DeletedRows: 'deleted-rows',
  InsertedColumns: 'inserted-columns',
  InsertedRows: 'inserted-rows',
  RowsMoved: 'rows-moved',
  RowChanged: 'row-changed',
  SheetAdded: 'sheet-added',
  SheetDeleted: 'sheet-deleted',
  SheetRenamed: 'sheet-renamed',
  WorkbookRenamed: 'workbook-renamed'
} as const
export type WorkbookCompareTitleCode =
  (typeof WorkbookCompareTitleCode)[keyof typeof WorkbookCompareTitleCode]

export interface WorkbookCompareRangeTarget {
  readonly endColumn: number
  readonly endRow: number
  readonly sheetId: string
  readonly startColumn: number
  readonly startRow: number
}

export interface WorkbookCompareSelectionTarget {
  readonly base: WorkbookCompareRangeTarget | null
  readonly current: WorkbookCompareRangeTarget | null
}

export interface WorkbookCompareSelectionMapping {
  readonly rowAlignment?: readonly WorkbookCompareAxisAlignment[]
  readonly columnAlignment?: readonly WorkbookCompareAxisAlignment[]
}

/** Native coordinate runs supplied by the semantic SDK, not inferred by the presentation layer. */
export interface WorkbookCompareAxisAlignment {
  readonly leftStart: number | null
  readonly rightStart: number | null
  readonly count: number
}

export interface WorkbookCompareScrollTarget {
  readonly offsetX: number
  readonly offsetY: number
  readonly sheetId: string
  readonly sheetViewStartColumn: number
  readonly sheetViewStartRow: number
}

export interface WorkbookCompareDetailLine {
  readonly after?: string | null
  readonly before?: string | null
  readonly kind?: WorkbookCompareDiffKind | null
  readonly label: string
  /** Semantic property path used by applications for i18n and Agent explanations. */
  readonly semanticPath: readonly string[]
}

export interface WorkbookCompareItem {
  readonly address?: string
  readonly category: WorkbookCompareCategory
  readonly detailLines: readonly WorkbookCompareDetailLine[]
  readonly id: string
  readonly kind: WorkbookCompareDiffKind
  readonly mode: WorkbookCompareMode
  readonly range?: IRange
  readonly selection: WorkbookCompareSelectionTarget | null
  readonly sheetId?: string
  readonly sheetName?: string
  readonly subtitle?: string
  readonly title: string
  readonly titleCode?: WorkbookCompareTitleCode
  readonly titleParameters?: Readonly<Record<string, string | number>>
}

export interface WorkbookCompareCellChange {
  readonly address: string
  readonly formula: { readonly base: string | null; readonly current: string | null }
  readonly kind: WorkbookCompareDiffKind | null
  readonly selection: WorkbookCompareSelectionTarget
  readonly styles: readonly WorkbookCompareDetailLine[]
  readonly value: { readonly base: string | null; readonly current: string | null }
}

export interface WorkbookCompareGapItem {
  readonly color?: string
  readonly size: number
  readonly stripeColor?: string
}

export interface WorkbookCompareSheetGapConfig {
  readonly colGaps?: Record<number, WorkbookCompareGapItem>
  readonly rowGaps?: Record<number, WorkbookCompareGapItem>
}

export interface WorkbookCompareDimensionOverlay {
  readonly index: number
  readonly kind: 'hidden-mask' | 'size-delta'
  readonly size: number
}

export interface WorkbookCompareSheetOverlayConfig {
  readonly columnOverlays?: readonly WorkbookCompareDimensionOverlay[]
  readonly rowOverlays?: readonly WorkbookCompareDimensionOverlay[]
}

export interface WorkbookCompareCellHighlight {
  readonly column: number
  readonly kind: WorkbookCompareDiffKind
  readonly row: number
}

export interface WorkbookCompareRangeHighlight {
  readonly kind: WorkbookCompareDiffKind
  readonly range: IRange
}

export interface WorkbookCompareSheetPresentation {
  readonly baseCellHighlights: readonly WorkbookCompareCellHighlight[]
  readonly baseColumnHighlights: readonly number[]
  readonly baseGaps: WorkbookCompareSheetGapConfig | null
  readonly baseOverlayConfig: WorkbookCompareSheetOverlayConfig | null
  readonly baseRangeHighlights: readonly WorkbookCompareRangeHighlight[]
  readonly baseRowHighlights: readonly number[]
  readonly currentCellHighlights: readonly WorkbookCompareCellHighlight[]
  readonly currentColumnHighlights: readonly number[]
  readonly currentGaps: WorkbookCompareSheetGapConfig | null
  readonly currentOverlayConfig: WorkbookCompareSheetOverlayConfig | null
  readonly currentRangeHighlights: readonly WorkbookCompareRangeHighlight[]
  readonly currentRowHighlights: readonly number[]
}

export interface WorkbookCompareSheetData {
  readonly categories: Record<Exclude<WorkbookCompareCategory, 'workbook'>, WorkbookCompareItem[]>
  readonly cellChanges: readonly WorkbookCompareCellChange[]
  readonly cellItemByCurrentPosition: Record<string, WorkbookCompareItem>
  readonly items: readonly WorkbookCompareItem[]
  readonly presentation: WorkbookCompareSheetPresentation
  readonly selectionMapping: WorkbookCompareSelectionMapping
  readonly sheetId: string
  readonly sheetName: string
}

export interface WorkbookCompareInfo {
  readonly snapshotAlignmentDegraded: boolean
  readonly workbookItems: readonly WorkbookCompareItem[]
  readonly worksheets: Record<string, WorkbookCompareSheetData>
}

export interface WorkbookCompareSheetOption {
  readonly baseSheet: WorkbookSheetMeta | null
  readonly currentSheet: WorkbookSheetMeta | null
  readonly label: string
  readonly sheetId: string
  readonly sortOrder: number
  readonly status: WorkbookCompareSheetTabStatus
}

export interface WorkbookSheetMeta {
  readonly hidden: boolean
  readonly name: string
  readonly order: number
  readonly sheetId: string
  readonly tabColor: string
  readonly zoomRatio: number
}

export interface WorkbookCompareSummary {
  readonly changedCells: number
  readonly changedSheets: number
  readonly deletedColumns: number
  readonly deletedRows: number
  readonly hasChanges: boolean
  readonly insertedColumns: number
  readonly insertedRows: number
  readonly resourceChanges: number
  readonly styleChanges: number
}

export interface WorkbookCompareModel {
  readonly schemaVersion: 1
  readonly compareInfo: WorkbookCompareInfo
  readonly displayedSnapshots: {
    readonly base: IWorkbookData | null
    readonly current: IWorkbookData | null
  }
  readonly itemById: Record<string, WorkbookCompareItem>
  readonly items: readonly WorkbookCompareItem[]
  readonly itemsByCategory: Record<WorkbookCompareCategory, WorkbookCompareItem[]>
  readonly preferredSheetId: string | null
  readonly readiness: 'degraded' | 'ready'
  readonly sheetOptions: readonly WorkbookCompareSheetOption[]
  readonly summary: WorkbookCompareSummary
  readonly unsupportedMutationIds: readonly string[]
  readonly worksheets: readonly WorkbookCompareSheetData[]
}

export interface WorkbookCompareSidebarTreeLabels {
  readonly categories: Partial<Record<WorkbookCompareCategory, string>>
  readonly emptyText: string
  readonly noActiveSheetLabel: string
  readonly noCompareDataLabel: string
  readonly rowLabel: (index: number) => string
  readonly styleGroupLabel: string
  readonly workbookRootLabel: string
}

export interface WorkbookCompareSidebarTreeNode {
  readonly children?: readonly WorkbookCompareSidebarTreeNode[]
  readonly details: readonly WorkbookCompareDetailLine[]
  readonly id: string
  readonly itemId: string | null
  readonly kind: WorkbookCompareDiffKind
  readonly label: string
  readonly type: 'detail' | 'group' | 'item' | 'root'
}

export interface WorkbookCompareFxState {
  readonly activeCellLabel: string
  readonly baseDisplayValue: string
  readonly baseFormula: string
  readonly currentDisplayValue: string
  readonly currentFormula: string
  readonly selectionLabel: string
}

export interface WorkbookComparePaneFxStates {
  readonly base: WorkbookComparePaneFxState
  readonly current: WorkbookComparePaneFxState
}

export interface BuildWorkbookCompareModelInput {
  /** Native semantic results are supplied by the Pro History SDK. */
  readonly compareInfo: WorkbookCompareInfo
  readonly baseSnapshot: IWorkbookData | null
  readonly preferredSheetId?: string | null
  readonly targetSnapshot: IWorkbookData | null
}

const CATEGORY_ORDER: WorkbookCompareCategory[] = [
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
  'pivot',
  'workbook'
]

const WORKSHEET_CATEGORIES: Exclude<WorkbookCompareCategory, 'workbook'>[] = [
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

export function buildWorkbookCompareModel(
  input: BuildWorkbookCompareModelInput
): WorkbookCompareModel {
  const compareInfo = input.compareInfo
  const sheetOptions = deriveCompareSheetOptions({
    baseSnapshot: input.baseSnapshot,
    compareInfo,
    currentSnapshot: input.targetSnapshot
  })
  const items = [
    ...compareInfo.workbookItems,
    ...Object.values(compareInfo.worksheets).flatMap((sheet) => sheet.items)
  ]
  const itemsByCategory = groupItemsByCategoryFilled(items)
  const summary = buildSummary(compareInfo)

  return {
    schemaVersion: 1,
    compareInfo,
    displayedSnapshots: { base: input.baseSnapshot, current: input.targetSnapshot },
    itemById: Object.fromEntries(items.map((item) => [item.id, item])),
    items,
    itemsByCategory,
    preferredSheetId: input.preferredSheetId ?? getDefaultCompareSheetId(sheetOptions),
    readiness: compareInfo.snapshotAlignmentDegraded ? 'degraded' : 'ready',
    sheetOptions,
    summary,
    unsupportedMutationIds: [],
    worksheets: Object.values(compareInfo.worksheets)
  }
}

export function deriveCompareSheetOptions(input: {
  readonly baseSnapshot: IWorkbookData | null
  readonly compareInfo: WorkbookCompareInfo
  readonly currentSnapshot: IWorkbookData | null
}): WorkbookCompareSheetOption[] {
  const baseMeta = readWorkbookMeta(input.baseSnapshot)
  const currentMeta = readWorkbookMeta(input.currentSnapshot)
  const sheetIds = new Set<string>([...baseMeta.sheetIds, ...currentMeta.sheetIds])
  const statusMap = new Map<string, WorkbookCompareSheetTabStatus>()

  for (const [sheetId, sheetData] of Object.entries(input.compareInfo?.worksheets ?? {})) {
    sheetIds.add(sheetId)
    if (sheetData.items.length > 0) {
      const nextStatus = sheetData.categories.worksheet.some((item) => item.kind === 'insert')
        ? 'insert'
        : sheetData.categories.worksheet.some((item) => item.kind === 'delete')
          ? 'delete'
          : 'update'
      statusMap.set(sheetId, mergeSheetStatus(statusMap.get(sheetId), nextStatus))
    }
  }

  return [...sheetIds]
    .map((sheetId) => {
      const baseSheet = baseMeta.sheets[sheetId] ?? null
      const currentSheet = currentMeta.sheets[sheetId] ?? null
      return {
        baseSheet,
        currentSheet,
        label: currentSheet?.name ?? baseSheet?.name ?? sheetId,
        sheetId,
        sortOrder: Math.min(
          baseSheet?.order ?? Number.MAX_SAFE_INTEGER,
          currentSheet?.order ?? Number.MAX_SAFE_INTEGER
        ),
        status: statusMap.get(sheetId) ?? 'default'
      }
    })
    .sort((left, right) =>
      left.sortOrder === right.sortOrder
        ? left.label.localeCompare(right.label)
        : left.sortOrder - right.sortOrder
    )
}

export function getDefaultCompareSheetId(
  sheetOptions: readonly WorkbookCompareSheetOption[]
): string | null {
  return (
    (
      sheetOptions.find((option) => option.currentSheet !== null && !option.currentSheet.hidden) ??
      sheetOptions.find((option) => option.baseSheet !== null && !option.baseSheet.hidden) ??
      sheetOptions[0] ??
      null
    )?.sheetId ?? null
  )
}

export function mapSelectionTargetAcrossPanes(input: {
  readonly compareInfo: WorkbookCompareInfo
  readonly sourceRole: WorkbookComparePaneRole
  readonly target: WorkbookCompareRangeTarget
}): WorkbookCompareRangeTarget | null {
  const mapping = input.compareInfo.worksheets[input.target.sheetId]?.selectionMapping
  if (mapping === undefined) {
    return input.target
  }
  return mapRangeTargetAcrossAxes(mapping, input.sourceRole, input.target)
}

export function mapScrollTargetAcrossPanes(input: {
  readonly compareInfo: WorkbookCompareInfo
  readonly sourceRole: WorkbookComparePaneRole
  readonly target: WorkbookCompareScrollTarget
}): WorkbookCompareScrollTarget | null {
  const mapping = input.compareInfo.worksheets[input.target.sheetId]?.selectionMapping
  if (mapping === undefined) return input.target
  const sheetViewStartRow = mapScrollAlignedAxis(
    mapping.rowAlignment,
    input.sourceRole,
    input.target.sheetViewStartRow
  )
  const sheetViewStartColumn = mapScrollAlignedAxis(
    mapping.columnAlignment,
    input.sourceRole,
    input.target.sheetViewStartColumn
  )
  return sheetViewStartRow === null || sheetViewStartColumn === null
    ? null
    : { ...input.target, sheetViewStartRow, sheetViewStartColumn }
}

/**
 * Scroll remains continuous while crossing an inserted/deleted gap. Unlike a cell selection,
 * a viewport origin does not require an exact peer cell, so use the nearest aligned boundary.
 */
function mapScrollAlignedAxis(
  runs: readonly WorkbookCompareAxisAlignment[] | undefined,
  role: WorkbookComparePaneRole,
  index: number
): number | null {
  if (runs === undefined) return index

  for (let runIndex = 0; runIndex < runs.length; runIndex += 1) {
    const run = runs[runIndex]!
    const source = role === 'base' ? run.leftStart : run.rightStart
    const target = role === 'base' ? run.rightStart : run.leftStart
    if (source === null || index < source || index >= source + run.count) continue
    if (target !== null) return target + index - source

    for (let nextIndex = runIndex + 1; nextIndex < runs.length; nextIndex += 1) {
      const next = runs[nextIndex]!
      const nextTarget = role === 'base' ? next.rightStart : next.leftStart
      if (nextTarget !== null) return nextTarget
    }
    for (let previousIndex = runIndex - 1; previousIndex >= 0; previousIndex -= 1) {
      const previous = runs[previousIndex]!
      const previousTarget = role === 'base' ? previous.rightStart : previous.leftStart
      if (previousTarget !== null) return Math.max(0, previousTarget + previous.count - 1)
    }
    return null
  }

  return null
}

export function createEmptyWorkbookCompareFxState(): WorkbookCompareFxState {
  return {
    activeCellLabel: '--',
    baseDisplayValue: '',
    baseFormula: '',
    currentDisplayValue: '',
    currentFormula: '',
    selectionLabel: '--'
  }
}

export function createWorkbookCompareFxState(input: {
  readonly compareInfo: WorkbookCompareInfo
  readonly item: WorkbookCompareItem | null
}): WorkbookCompareFxState {
  const item = input.item
  if (item?.category !== 'cell' || item.sheetId === undefined) {
    return createEmptyWorkbookCompareFxState()
  }
  const sheet = input.compareInfo.worksheets[item.sheetId]
  const change = sheet?.cellChanges.find((candidate) => candidate.address === item.address) ?? null
  if (change === null) {
    return createEmptyWorkbookCompareFxState()
  }
  return {
    activeCellLabel: change.address,
    baseDisplayValue: change.value.base ?? '',
    baseFormula: change.formula.base ?? '',
    currentDisplayValue: change.value.current ?? '',
    currentFormula: change.formula.current ?? '',
    selectionLabel: item.address ?? '--'
  }
}

export function createWorkbookComparePaneFxStates(input: {
  readonly compareInfo: WorkbookCompareInfo
  readonly item: WorkbookCompareItem | null
}): WorkbookComparePaneFxStates {
  const fx = createWorkbookCompareFxState(input)
  const selection = input.item?.selection ?? null
  return {
    base: createWorkbookComparePaneFxState({
      displayValue: fx.baseDisplayValue,
      fallbackLabel: fx.activeCellLabel,
      formula: fx.baseFormula,
      selection: selection?.base ?? null
    }),
    current: createWorkbookComparePaneFxState({
      displayValue: fx.currentDisplayValue,
      fallbackLabel: fx.activeCellLabel,
      formula: fx.currentFormula,
      selection: selection?.current ?? null
    })
  }
}

function createWorkbookComparePaneFxState(input: {
  readonly displayValue: string
  readonly fallbackLabel: string
  readonly formula: string
  readonly selection: WorkbookCompareRangeTarget | null
}): WorkbookComparePaneFxState {
  const selection = input.selection
  if (selection === null) {
    return {
      activeCellLabel: input.fallbackLabel,
      displayValue: input.displayValue,
      formula: input.formula,
      selectionLabel: input.fallbackLabel
    }
  }

  const start = formatCellAddress(selection.startRow, selection.startColumn)
  const end = formatCellAddress(selection.endRow, selection.endColumn)
  return {
    activeCellLabel: start,
    displayValue: input.displayValue,
    formula: input.formula,
    selectionLabel: start === end ? start : `${start}:${end}`
  }
}

export function buildWorkbookCompareSidebarTree(input: {
  readonly activeSheetId: string | null
  readonly items: readonly WorkbookCompareItem[]
  readonly labels: WorkbookCompareSidebarTreeLabels
  readonly model: Pick<WorkbookCompareModel, 'worksheets'>
  readonly searchQuery: string
  readonly tab: 'workbook' | 'worksheet'
}): WorkbookCompareSidebarTreeNode[] {
  const query = input.searchQuery.trim()
  const items = input.items.filter((item) => matchesSidebarSearch(item, query))
  const buckets = groupItemsByCategoryFilled(items)
  const categories = input.tab === 'workbook' ? (['workbook'] as const) : WORKSHEET_CATEGORIES
  const categoryNodes = categories.flatMap((category) => {
    const categoryItems = buckets[category] ?? []
    const children =
      category === 'cell'
        ? buildCellRowTreeNodes(categoryItems, input.activeSheetId, input.labels)
        : categoryItems.map((item) => buildItemTreeNode(item))
    if (children.length === 0) {
      return []
    }
    return [
      {
        children,
        details: [],
        id: `category:${category}`,
        itemId: null,
        kind: 'update' as const,
        label: `${input.labels.categories[category] ?? category} (${categoryItems.length})`,
        type: 'group' as const
      }
    ]
  })
  if (categoryNodes.length === 0) {
    return []
  }
  const activeWorksheet =
    input.activeSheetId === null
      ? null
      : (input.model.worksheets.find((worksheet) => worksheet.sheetId === input.activeSheetId) ??
        null)
  return [
    {
      children: categoryNodes,
      details: [],
      id: input.tab === 'workbook' ? 'root:workbook' : `root:${input.activeSheetId ?? 'none'}`,
      itemId: null,
      kind: 'update',
      label:
        input.tab === 'workbook'
          ? input.labels.workbookRootLabel
          : activeWorksheet?.sheetName || input.labels.noActiveSheetLabel,
      type: 'root'
    }
  ]
}

function buildCellRowTreeNodes(
  items: readonly WorkbookCompareItem[],
  activeSheetId: string | null,
  labels: WorkbookCompareSidebarTreeLabels
): WorkbookCompareSidebarTreeNode[] {
  const itemsByRow = new Map<number, WorkbookCompareItem[]>()
  const ungroupedItems: WorkbookCompareItem[] = []

  for (const item of items) {
    const row = item.selection?.current?.startRow ?? item.selection?.base?.startRow
    if (row === undefined) {
      ungroupedItems.push(item)
      continue
    }
    const rowItems = itemsByRow.get(row) ?? []
    rowItems.push(item)
    itemsByRow.set(row, rowItems)
  }

  return [
    ...[...itemsByRow.entries()]
      .sort(([left], [right]) => left - right)
      .map(([row, rowItems]): WorkbookCompareSidebarTreeNode => ({
        children: rowItems.map((item) => buildItemTreeNode(item)),
        details: [],
        id: `${activeSheetId ?? 'none'}:cell:row:${row}`,
        itemId: null,
        kind: 'update',
        label: `${labels.rowLabel(row + 1)} (${rowItems.length})`,
        type: 'group'
      })),
    ...ungroupedItems.map((item) => buildItemTreeNode(item))
  ]
}

export function collectWorkbookCompareSidebarItemIds(
  nodes: readonly WorkbookCompareSidebarTreeNode[]
): string[] {
  return nodes.flatMap((node) => [
    ...(node.itemId !== null ? [node.itemId] : []),
    ...collectWorkbookCompareSidebarItemIds(node.children ?? [])
  ])
}

function groupItemsByCategory(): Record<WorkbookCompareCategory, WorkbookCompareItem[]> {
  return Object.fromEntries(CATEGORY_ORDER.map((category) => [category, []])) as unknown as Record<
    WorkbookCompareCategory,
    WorkbookCompareItem[]
  >
}

function groupItemsByCategoryFilled(
  items: readonly WorkbookCompareItem[]
): Record<WorkbookCompareCategory, WorkbookCompareItem[]> {
  const grouped = groupItemsByCategory()
  for (const item of items) {
    grouped[item.category].push(item)
  }
  return grouped
}

function buildSummary(compareInfo: WorkbookCompareInfo): WorkbookCompareSummary {
  const items = [
    ...compareInfo.workbookItems,
    ...Object.values(compareInfo.worksheets).flatMap((sheet) => sheet.items)
  ]
  const grouped = groupItemsByCategoryFilled(items)
  const insertedRows = countAxisChanges(compareInfo, 'row', 'insert')
  const deletedRows = countAxisChanges(compareInfo, 'row', 'delete')
  const insertedColumns = countAxisChanges(compareInfo, 'column', 'insert')
  const deletedColumns = countAxisChanges(compareInfo, 'column', 'delete')
  const styleChanges = Object.values(compareInfo.worksheets).reduce(
    (total, sheet) => total + sheet.cellChanges.filter((change) => change.styles.length > 0).length,
    0
  )
  const resourceChanges =
    grouped.chart.length +
    grouped['condition-format'].length +
    grouped['data-validation'].length +
    grouped.pivot.length +
    grouped.shape.length +
    grouped.sparkline.length +
    grouped.table.length
  return {
    changedCells: grouped.cell.length,
    changedSheets: Object.values(compareInfo.worksheets).filter((sheet) => sheet.items.length > 0)
      .length,
    deletedColumns,
    deletedRows,
    hasChanges: items.length > 0,
    insertedColumns,
    insertedRows,
    resourceChanges,
    styleChanges
  }
}

function countAxisChanges(
  compareInfo: WorkbookCompareInfo,
  axis: 'column' | 'row',
  kind: 'insert' | 'delete'
): number {
  return Object.values(compareInfo.worksheets).reduce((total, sheet) => {
    const alignment =
      axis === 'row' ? sheet.selectionMapping.rowAlignment : sheet.selectionMapping.columnAlignment
    return (
      total +
      (alignment ?? []).reduce(
        (sum, run) =>
          sum +
          ((kind === 'insert' ? run.leftStart === null : run.rightStart === null) ? run.count : 0),
        0
      )
    )
  }, 0)
}

function mapRangeTargetAcrossAxes(
  mapping: WorkbookCompareSelectionMapping,
  sourceRole: WorkbookComparePaneRole,
  target: WorkbookCompareRangeTarget
): WorkbookCompareRangeTarget | null {
  const startRow = mapAlignedAxis(mapping.rowAlignment, sourceRole, target.startRow)
  const endRow = mapAlignedAxis(mapping.rowAlignment, sourceRole, target.endRow)
  const startColumn = mapAlignedAxis(mapping.columnAlignment, sourceRole, target.startColumn)
  const endColumn = mapAlignedAxis(mapping.columnAlignment, sourceRole, target.endColumn)
  return startRow === null || endRow === null || startColumn === null || endColumn === null
    ? null
    : { ...target, startRow, endRow, startColumn, endColumn }
}

function mapAlignedAxis(
  rows: readonly WorkbookCompareAxisAlignment[] | undefined,
  role: WorkbookComparePaneRole,
  index: number
): number | null {
  if (rows === undefined) return index
  for (const row of rows) {
    const source = role === 'base' ? row.leftStart : row.rightStart
    const target = role === 'base' ? row.rightStart : row.leftStart
    if (source !== null && index >= source && index < source + row.count) {
      return target === null ? null : target + index - source
    }
  }
  return null
}

function buildItemTreeNode(item: WorkbookCompareItem): WorkbookCompareSidebarTreeNode {
  if (item.category !== 'cell' || item.detailLines.length <= 1) {
    return {
      details: item.detailLines,
      id: item.id,
      itemId: item.id,
      kind: item.kind,
      label: item.title,
      type: 'item'
    }
  }
  return {
    children: item.detailLines.map((line, index) => ({
      details: [line],
      id: `${item.id}:detail:${index}`,
      itemId: item.id,
      kind: line.kind ?? item.kind,
      label: line.label,
      type: 'detail'
    })),
    details: [],
    id: item.id,
    itemId: item.id,
    kind: item.kind,
    label: item.title,
    type: 'item'
  }
}

function matchesSidebarSearch(item: WorkbookCompareItem, query: string): boolean {
  if (query.length === 0) {
    return true
  }
  const normalizedQuery = query.toLowerCase().replace(/\s+/g, '')
  const text = [
    item.title,
    item.subtitle,
    item.address,
    item.sheetName,
    ...item.detailLines.flatMap((line) => [line.label, line.before ?? '', line.after ?? ''])
  ]
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, '')
  return text.includes(normalizedQuery)
}

function readWorkbookMeta(snapshot: IWorkbookData | null): {
  readonly name: string
  readonly sheetIds: readonly string[]
  readonly sheets: Record<string, WorkbookSheetMeta>
} {
  const sheets: Record<string, WorkbookSheetMeta> = {}
  const order: string[] = Array.isArray(snapshot?.sheetOrder) ? [...snapshot.sheetOrder] : []
  for (const [sheetId, rawSheet] of Object.entries(snapshot?.sheets ?? {})) {
    const sheet = asRecord(rawSheet)
    if (sheet === null) {
      continue
    }
    sheets[sheetId] = {
      hidden: asBoolean(sheet.hidden),
      name: asString(sheet.name) ?? sheetId,
      order: order.indexOf(sheetId) >= 0 ? order.indexOf(sheetId) : Object.keys(sheets).length,
      sheetId,
      tabColor: asString(sheet.tabColor) ?? '',
      zoomRatio: asNumber(sheet.zoomRatio) ?? 1
    }
  }
  const ordered = order.filter((sheetId) => sheetId in sheets)
  return {
    name: asString(snapshot?.name) ?? '',
    sheetIds: [...ordered, ...Object.keys(sheets).filter((sheetId) => !ordered.includes(sheetId))],
    sheets
  }
}

function mergeSheetStatus(
  current: WorkbookCompareSheetTabStatus | undefined,
  next: WorkbookCompareSheetTabStatus
): WorkbookCompareSheetTabStatus {
  const priority: Record<WorkbookCompareSheetTabStatus, number> = {
    default: 0,
    delete: 3,
    insert: 3,
    update: 2
  }
  return current === undefined || priority[next] >= priority[current] ? next : current
}

function formatCellAddress(row: number, column: number): string {
  let columnIndex = column + 1
  let label = ''
  while (columnIndex > 0) {
    const remainder = (columnIndex - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    columnIndex = Math.floor((columnIndex - 1) / 26)
  }
  return `${label}${row + 1}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 1
}
