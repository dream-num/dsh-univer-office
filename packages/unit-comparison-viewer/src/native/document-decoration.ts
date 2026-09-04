import type {
  IDocumentBody,
  IDocumentData,
  IParagraph,
  ITableRow,
  ITextStyle
} from '@univerjs/core'
import {
  BooleanNumber,
  DataStreamTreeTokenType,
  getBlockRangeInterval,
  getBodySliceForTextXAction,
  getColumnGroupRangeInterval,
  getTableCellTokenInterval,
  getTableRowTokenInterval,
  getTableRangeInterval,
  PresetListType,
  TextDecoration,
  TextX,
  TextXActionType,
  Tools
} from '@univerjs/core'
import type {
  DocumentComparisonParagraph,
  DocumentComparisonRow,
  UnitStructuralDiffItem
} from '../shared/structural-diff.js'
import type { IUnitComparisonChange, UnitComparisonProductContext } from '../comparison-types.js'

export interface DocumentComparisonInput {
  readonly items: readonly UnitStructuralDiffItem[]
  readonly alignment: Extract<
    UnitComparisonProductContext,
    { kind: 'doc' }
  >['paragraphAlignment']['rows']
  readonly selectedItemId?: string
}

export type ComparisonSide = 'left' | 'right'
export type ComparisonTone = 'delete' | 'insert' | 'update'

interface ParagraphSpan {
  readonly index: number
  readonly id: string
  readonly start: number
  readonly end: number
  readonly paragraph: IParagraph
}

interface ToneRange {
  readonly start: number
  readonly end: number
  readonly tone: ComparisonTone
  readonly emphasized?: boolean
}

interface StructuralRange {
  readonly entityType: 'table-range' | 'column-group' | 'block-range'
  readonly stableId: string
  readonly startOffset: number
  readonly endOffset: number
}

interface ParagraphContainer {
  readonly kind: 'row' | 'cell' | 'column' | 'block'
  readonly parentId: string
  readonly nativeId: string | undefined
  readonly index: number
  readonly rowIndex?: number
  readonly startOffset: number
  readonly endOffset: number
  readonly contentEnd: number
}

interface TableSources {
  readonly current: IDocumentData['tableSource']
  readonly peer: IDocumentData['tableSource']
}

const TONE_STYLE: Record<ComparisonTone, ITextStyle> = {
  delete: {
    bg: { rgb: 'rgba(220, 38, 38, 0.24)' },
    st: {
      s: BooleanNumber.TRUE,
      c: BooleanNumber.FALSE,
      cl: { rgb: '#dc2626' },
      t: TextDecoration.SINGLE
    }
  },
  insert: { bg: { rgb: 'rgba(22, 163, 74, 0.24)' } },
  update: { bg: { rgb: 'rgba(37, 99, 235, 0.22)' } }
}

const EMPHASIZED_TONE_STYLE: Record<ComparisonTone, ITextStyle> = {
  delete: {
    bg: { rgb: 'rgba(220, 38, 38, 0.46)' },
    st: {
      s: BooleanNumber.TRUE,
      c: BooleanNumber.FALSE,
      cl: { rgb: '#b91c1c' },
      t: TextDecoration.SINGLE
    }
  },
  insert: { bg: { rgb: 'rgba(22, 163, 74, 0.46)' } },
  update: { bg: { rgb: 'rgba(37, 99, 235, 0.42)' } }
}

const PARAGRAPH_TONE_COLOR: Record<ComparisonTone, string> = {
  delete: 'rgba(220, 38, 38, 0.12)',
  insert: 'rgba(22, 163, 74, 0.12)',
  update: 'rgba(37, 99, 235, 0.10)'
}

const EMPHASIZED_PARAGRAPH_TONE_COLOR: Record<ComparisonTone, string> = {
  delete: 'rgba(220, 38, 38, 0.28)',
  insert: 'rgba(22, 163, 74, 0.28)',
  update: 'rgba(37, 99, 235, 0.25)'
}

/** Clone one Doc comparison side and paint character-level changes into native text runs. */
export function decorateDocumentComparisonSide(
  current: IDocumentData,
  peer: IDocumentData,
  side: ComparisonSide,
  comparison: DocumentComparisonInput
): IDocumentData {
  const decorated = Tools.deepClone(current)
  copyMissingRootObjects(decorated, peer, comparison.items, side)
  // Paint native indexes before render-only structural slots change their positions.
  decorateTables(decorated, comparison.items, side, comparison.selectedItemId)
  const tables: TableSources = { current: decorated.tableSource, peer: peer.tableSource }
  decorateBody(decorated.body, peer.body, side, comparison, tables)
  for (const [segmentId, header] of Object.entries(decorated.headers ?? {})) {
    decorateBody(header.body, peer.headers?.[segmentId]?.body, side, comparison, tables, [
      'headers',
      segmentId,
      'body'
    ])
  }
  for (const [segmentId, footer] of Object.entries(decorated.footers ?? {})) {
    decorateBody(footer.body, peer.footers?.[segmentId]?.body, side, comparison, tables, [
      'footers',
      segmentId,
      'body'
    ])
  }
  return decorated
}

function decorateBody(
  current: IDocumentBody | undefined,
  peer: IDocumentBody | undefined,
  side: ComparisonSide,
  comparison: DocumentComparisonInput,
  tables: TableSources,
  segmentPath?: readonly string[]
): void {
  if (current === undefined) return
  const left = side === 'left' ? current : peer
  const right = side === 'right' ? current : peer
  const items = comparison.items.filter((item) =>
    segmentPath === undefined
      ? item.path[0] !== 'headers' && item.path[0] !== 'footers'
      : item.path.slice(0, 3).join('\0') === segmentPath.join('\0')
  )
  const leftById = new Map(paragraphSpans(left).map((span) => [span.id, span]))
  const rightById = new Map(paragraphSpans(right).map((span) => [span.id, span]))
  const rows: DocumentComparisonRow[] = comparison.alignment
    .filter((row) => row.segmentPath?.join('\0') === segmentPath?.join('\0'))
    .map((row) => ({
      id: row.id,
      stableId: row.stableId,
      kind: row.kind,
      moved: row.moved,
      left: projectParagraph(left, row.stableId, leftById.get(row.leftNativeStableId ?? '')),
      right: projectParagraph(right, row.stableId, rightById.get(row.rightNativeStableId ?? ''))
    }))
  const ghostParagraphIds = insertMissingContent(current, peer, side, rows, items, tables)
  const ranges: ToneRange[] = []
  current.textRuns ??= []
  clearCheckedListCompletionStrike(current)
  // Container-level blue is a background layer; missing and inline content takes precedence.
  decorateStructuredRanges(current, items, side, comparison.selectedItemId)
  const decoratedById = new Map(paragraphSpans(current).map((span) => [span.id, span]))
  const paragraphItems = new Map(
    items.filter((item) => item.entityType === 'paragraph').map((item) => [item.stableId, item])
  )
  const styleItems = new Map(
    items.filter((item) => item.entityType === 'text-style').map((item) => [item.stableId, item])
  )

  for (const row of rows) {
    const own = side === 'left' ? row.left : row.right
    const ownId = own?.paragraphId ?? ghostParagraphIds.get(row.id)
    const rendered = ownId === undefined ? undefined : decoratedById.get(ownId)
    if (rendered === undefined) continue
    const paragraphItem = paragraphItems.get(row.stableId)
    const styleItem = styleItems.get(row.stableId)
    const emphasized =
      comparison.selectedItemId !== undefined &&
      (paragraphItem?.id === comparison.selectedItemId ||
        styleItem?.id === comparison.selectedItemId)
    if (row.left === null || row.right === null) {
      const tone: ComparisonTone = own === null ? 'delete' : row.moved ? 'update' : 'insert'
      ranges.push({ start: rendered.start, end: rendered.end, tone, emphasized })
      applyParagraphTone(rendered.paragraph, tone, emphasized)
      continue
    }
    const textChange = paragraphItem?.changes.find(
      (change) => change.path.length === 1 && change.path[0] === 'text'
    )
    if (textChange?.segments !== undefined) {
      const textRanges = buildTextRanges(textChange.segments, rendered.start, rendered.start)
      ranges.push(...textRanges[side].map((range) => ({ ...range, emphasized })))
    } else if (textChange !== undefined) {
      // A whole-string API replacement is still authoritative; do not run another text diff here.
      ranges.push({ start: rendered.start, end: rendered.end, tone: 'update', emphasized })
    } else if (paragraphItem !== undefined || styleItem !== undefined) {
      ranges.push({ start: rendered.start, end: rendered.end, tone: 'update', emphasized })
      applyParagraphTone(rendered.paragraph, 'update', emphasized)
    }
  }
  for (const range of mergeAdjacentRanges(ranges)) applyTone(current, range)
  decorateCellPresence(current, tables.current, rows, side, ghostParagraphIds)
}

function projectParagraph(
  body: IDocumentBody | undefined,
  stableId: string,
  span: ParagraphSpan | undefined
): DocumentComparisonParagraph | null {
  if (body === undefined || span === undefined) return null
  const structure = [
    ...(body.tables ?? []),
    ...(body.columnGroups ?? []),
    ...(body.blockRanges ?? [])
  ].find((range) => span.end > range.startIndex && span.end < range.endIndex)
  return {
    stableId,
    paragraphId: span.id,
    index: span.index,
    start: span.start,
    end: span.end,
    text: body.dataStream.slice(span.start, span.end),
    value: span.paragraph,
    ...(structure === undefined ? {} : { structureId: stableId })
  }
}

/** Keep the checked glyph, but reserve strikethrough for actual deletions in Compare. */
function clearCheckedListCompletionStrike(body: IDocumentBody): void {
  for (const paragraph of paragraphSpans(body)) {
    if (paragraph.paragraph.bullet?.listType !== PresetListType.CHECK_LIST_CHECKED) continue
    const length = paragraph.end - paragraph.start
    if (length <= 0) continue
    applyTextStyle(body, paragraph.start, paragraph.end, { st: { s: BooleanNumber.FALSE } })
  }
}

function structuralRanges(body: IDocumentBody): StructuralRange[] {
  return [
    ...(body.tables ?? []).map((range) => ({
      entityType: 'table-range' as const,
      stableId: range.tableId,
      ...getTableRangeInterval(range)
    })),
    ...(body.columnGroups ?? []).map((range) => ({
      entityType: 'column-group' as const,
      stableId: range.columnGroupId,
      ...getColumnGroupRangeInterval(range)
    })),
    ...(body.blockRanges ?? []).map((range) => ({
      entityType: 'block-range' as const,
      stableId: range.blockId,
      ...getBlockRangeInterval(range)
    }))
  ]
}

function insertMissingContent(
  current: IDocumentBody,
  peer: IDocumentBody | undefined,
  side: ComparisonSide,
  rows: readonly DocumentComparisonRow[],
  items: readonly UnitStructuralDiffItem[],
  tables: TableSources
): Map<string, string> {
  const ghostParagraphIds = new Map<string, string>()
  if (peer === undefined) return ghostParagraphIds
  const sourceRanges = structuralRanges(peer)
  const sourceContainers = paragraphContainers(peer)
  insertMissingSlots(current, peer, sourceContainers, rows, side, ghostParagraphIds, tables)
  const peerSide = side === 'left' ? 'right' : 'left'
  const missingKind = side === 'left' ? 'insert' : 'delete'
  const missingRanges = sourceRanges.filter((range) =>
    items.some(
      (item) =>
        item.entityType === range.entityType &&
        item.kind === missingKind &&
        (item.nativeStableIds?.[peerSide] ?? item.stableId) === range.stableId
    )
  )
  // Clone the outer container once, carrying nested structures with it. Partial rows/cells/columns
  // in an existing container require their own native layout mapping, not a root-level insertion.
  const rootFragments = missingRanges
    .filter(
      (range) =>
        !sourceRanges.some(
          (parent) =>
            parent !== range &&
            parent.startOffset <= range.startOffset &&
            parent.endOffset >= range.endOffset
        )
    )
    .map((range) => {
      const rowIndices = rows.flatMap((row, index) => {
        const source = row[peerSide]
        return source !== null && source.end >= range.startOffset && source.end < range.endOffset
          ? [index]
          : []
      })
      return { range, firstRow: rowIndices[0], lastRow: rowIndices[rowIndices.length - 1] }
    })

  for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
    const row = rows[rowIndex]
    if (row === undefined || ghostParagraphIds.has(row.id)) continue
    const source = row[peerSide]
    const fragment = rootFragments.find((candidate) => candidate.firstRow === rowIndex)
    if (fragment === undefined && (row[side] !== null || source === null)) continue
    const nestedOffset =
      fragment === undefined && source?.structureId !== undefined
        ? nestedParagraphInsertionOffset(
            current,
            sourceContainers,
            rows,
            rowIndex,
            side,
            ghostParagraphIds
          )
        : undefined
    if (fragment === undefined && source?.structureId !== undefined && nestedOffset === undefined)
      continue
    const insertionBody =
      fragment === undefined
        ? paragraphInsertionBody(peer, source!)
        : Tools.deepClone(
            getBodySliceForTextXAction(
              peer,
              fragment.range.startOffset,
              fragment.range.endOffset,
              false
            )
          )
    const nextRow = (fragment?.lastRow ?? rowIndex) + 1
    const insertionOffset =
      nestedOffset ?? ghostInsertionOffset(current, rows.slice(nextRow), side, ghostParagraphIds)
    const ids = insertGhostBody(current, insertionBody, insertionOffset, side, rowIndex)
    for (const candidate of fragment === undefined ? [row] : rows.slice(rowIndex, nextRow)) {
      const sourceId = candidate[peerSide]?.paragraphId
      const ghostId = sourceId === undefined ? undefined : ids.get(sourceId)
      if (candidate[side] === null && ghostId !== undefined)
        ghostParagraphIds.set(candidate.id, ghostId)
    }
  }
  return ghostParagraphIds
}

/** Native container geometry only. The SDK rows remain the authority for missing content. */
function paragraphContainers(body: IDocumentBody): ParagraphContainer[] {
  const T = DataStreamTreeTokenType
  const containers: ParagraphContainer[] = (body.blockRanges ?? []).map((block, index) => ({
    kind: 'block',
    parentId: block.blockId,
    nativeId: block.blockId,
    index,
    ...getBlockRangeInterval(block),
    contentEnd: block.endIndex
  }))
  const sections = new Map(
    body.sectionBreaks?.map((section) => [section.startIndex, section.sectionId])
  )
  for (const table of body.tables ?? []) {
    let rowIndex = 0
    for (let offset = table.startIndex + 1; offset < table.endIndex; offset++) {
      if (body.dataStream[offset] !== T.TABLE_ROW_START) continue
      const row = getTableRowTokenInterval(body.dataStream, offset)
      if (row === null) continue
      containers.push({
        kind: 'row',
        parentId: table.tableId,
        nativeId: undefined,
        index: rowIndex,
        ...row,
        contentEnd: row.endOffset - 1
      })
      let cellIndex = 0
      for (let cellOffset = offset + 1; cellOffset < row.endOffset; cellOffset++) {
        if (body.dataStream[cellOffset] !== T.TABLE_CELL_START) continue
        const interval = getTableCellTokenInterval(body.dataStream, cellOffset)
        if (interval === null) continue
        const contentEnd =
          body.dataStream[interval.endOffset - 2] === T.SECTION_BREAK
            ? interval.endOffset - 2
            : interval.endOffset - 1
        containers.push({
          kind: 'cell',
          parentId: table.tableId,
          nativeId: sections.get(contentEnd),
          index: cellIndex++,
          rowIndex,
          ...interval,
          contentEnd
        })
        cellOffset = interval.endOffset - 1
      }
      rowIndex++
      offset = row.endOffset - 1
    }
  }
  for (const group of body.columnGroups ?? []) {
    let columnIndex = 0
    for (let offset = group.startIndex + 1; offset < group.endIndex; offset++) {
      if (body.dataStream[offset] !== T.COLUMN_START) continue
      const endOffset = columnEndOffset(body.dataStream, offset)
      if (endOffset === undefined) continue
      containers.push({
        kind: 'column',
        parentId: group.columnGroupId,
        nativeId: group.columns?.[columnIndex]?.columnId,
        index: columnIndex,
        startOffset: offset,
        endOffset,
        contentEnd: endOffset - 1
      })
      columnIndex++
      offset = endOffset - 1
    }
  }
  return containers.sort(
    (left, right) => left.endOffset - left.startOffset - (right.endOffset - right.startOffset)
  )
}

function columnEndOffset(stream: string, start: number): number | undefined {
  let depth = 0
  for (let offset = start; offset < stream.length; offset++) {
    if (stream[offset] === DataStreamTreeTokenType.COLUMN_START) depth++
    else if (stream[offset] === DataStreamTreeTokenType.COLUMN_END && --depth === 0)
      return offset + 1
  }
  return undefined
}

function containsParagraph(container: ParagraphContainer, offset: number): boolean {
  return container.startOffset < offset && offset < container.endOffset
}

function matchingContainer(
  source: ParagraphContainer,
  sources: readonly ParagraphContainer[],
  targets: readonly ParagraphContainer[],
  rows: readonly DocumentComparisonRow[],
  side: ComparisonSide,
  spans: ReadonlyMap<string, ParagraphSpan>
): ParagraphContainer | undefined {
  const candidates = targets.filter(
    (target) => target.kind === source.kind && target.parentId === source.parentId
  )
  if (source.nativeId !== undefined) {
    const native = candidates.find((target) => target.nativeId === source.nativeId)
    if (native !== undefined) return native
  }
  if (source.kind === 'row') {
    const cellIds = new Set(
      sources
        .filter(
          (cell) =>
            cell.kind === 'cell' &&
            cell.parentId === source.parentId &&
            cell.rowIndex === source.index
        )
        .flatMap((cell) => (cell.nativeId === undefined ? [] : [cell.nativeId]))
    )
    const cell = targets.find(
      (target) =>
        target.kind === 'cell' &&
        target.parentId === source.parentId &&
        target.nativeId !== undefined &&
        cellIds.has(target.nativeId)
    )
    if (cell !== undefined)
      return candidates.find((target) => containsParagraph(target, cell.startOffset + 1))
  }
  const peerSide = side === 'left' ? 'right' : 'left'
  for (const row of rows) {
    const peer = row[peerSide]
    const id = row[side]?.paragraphId
    const own = id === undefined ? undefined : spans.get(id)
    if (peer === null || own === undefined || !containsParagraph(source, peer.end)) continue
    const target = candidates.find((candidate) => containsParagraph(candidate, own.end))
    if (target !== undefined) return target
  }
  if (source.kind === 'cell') {
    const parent = sources.find(
      (candidate) =>
        candidate.kind === 'row' &&
        candidate.parentId === source.parentId &&
        candidate.index === source.rowIndex
    )
    const targetRow =
      parent === undefined
        ? undefined
        : matchingContainer(parent, sources, targets, rows, side, spans)
    if (targetRow !== undefined) {
      const sourceCells = sources.filter(
        (candidate) =>
          candidate.kind === 'cell' &&
          candidate.parentId === source.parentId &&
          candidate.rowIndex === source.rowIndex
      )
      const targetCells = candidates.filter((candidate) => candidate.rowIndex === targetRow.index)
      // A paragraph replacement can regenerate the cell's section ID without inserting a cell.
      // In an anchored row with unchanged cell geometry, keep SDK paragraph gaps inside that slot.
      if (sourceCells.length === targetCells.length)
        return targetCells.find((candidate) => candidate.index === source.index)
    }
  }
  return undefined
}

function insertMissingSlots(
  current: IDocumentBody,
  peer: IDocumentBody,
  sources: readonly ParagraphContainer[],
  rows: readonly DocumentComparisonRow[],
  side: ComparisonSide,
  ghosts: Map<string, string>,
  tables: TableSources
): void {
  const peerSide = side === 'left' ? 'right' : 'left'
  const initialTargets = paragraphContainers(current)
  const initialSpans = new Map(paragraphSpans(current).map((span) => [span.id, span]))
  const candidates = sources.filter((source) => {
    if (source.kind === 'block') return false
    const contained = rows.filter(
      (row) => row[peerSide] !== null && containsParagraph(source, row[peerSide]!.end)
    )
    return (
      contained.length > 0 &&
      contained.every((row) => row[side] === null) &&
      matchingContainer(source, sources, initialTargets, rows, side, initialSpans) === undefined
    )
  })
  const fragments = candidates
    .filter(
      (source) =>
        !candidates.some(
          (parent) =>
            parent !== source &&
            parent.startOffset < source.startOffset &&
            parent.endOffset > source.endOffset
        )
    )
    .sort((left, right) => right.startOffset - left.startOffset)
  for (const source of fragments) {
    const targets = paragraphContainers(current)
    const spans = new Map(paragraphSpans(current).map((span) => [span.id, span]))
    const match = (candidate: ParagraphContainer): ParagraphContainer | undefined =>
      matchingContainer(candidate, sources, targets, rows, side, spans)
    const parentRow =
      source.kind === 'cell'
        ? sources.find(
            (candidate) =>
              candidate.kind === 'row' &&
              candidate.parentId === source.parentId &&
              candidate.index === source.rowIndex
          )
        : undefined
    const targetRow = parentRow === undefined ? undefined : match(parentRow)
    const parent =
      source.kind === 'cell'
        ? targetRow
        : structuralRanges(current).find(
            (range) =>
              range.stableId === source.parentId &&
              range.entityType === (source.kind === 'column' ? 'column-group' : 'table-range')
          )
    if (parent === undefined) continue
    let lastRow = -1
    rows.forEach((row, index) => {
      if (row[peerSide] !== null && containsParagraph(source, row[peerSide]!.end)) lastRow = index
    })
    // Follow the SDK's shared row order, including additions that exist only on the current side.
    // Looking only at peer siblings reverses concurrent same-position insertions across the panes.
    const next = rows.slice(lastRow + 1).flatMap((row) => {
      const id = row[side]?.paragraphId ?? ghosts.get(row.id)
      const span = id === undefined ? undefined : spans.get(id)
      if (span === undefined) return []
      const target = targets.find(
        (candidate) =>
          candidate.kind === source.kind &&
          candidate.parentId === source.parentId &&
          candidate.startOffset > parent.startOffset &&
          candidate.endOffset < parent.endOffset &&
          containsParagraph(candidate, span.end)
      )
      return target === undefined ? [] : [target]
    })[0]
    const index =
      next?.index ??
      targets.filter(
        (candidate) =>
          candidate.kind === source.kind &&
          candidate.parentId === source.parentId &&
          (source.kind !== 'cell' || candidate.rowIndex === targetRow?.index)
      ).length
    if (!insertSlotMetadata(current, peer, source, index, targetRow?.index, tables)) continue
    const insertion = Tools.deepClone(
      getBodySliceForTextXAction(peer, source.startOffset, source.endOffset, false)
    )
    const ids = insertGhostBody(
      current,
      insertion,
      next?.startOffset ?? parent.endOffset - 1,
      side,
      source.startOffset
    )
    for (const row of rows) {
      const paragraph = row[peerSide]
      if (row[side] !== null || paragraph === null || !containsParagraph(source, paragraph.end))
        continue
      const id = ids.get(paragraph.paragraphId)
      if (id !== undefined) ghosts.set(row.id, id)
    }
  }
}

function insertSlotMetadata(
  current: IDocumentBody,
  peer: IDocumentBody,
  source: ParagraphContainer,
  index: number,
  targetRowIndex: number | undefined,
  tables: TableSources
): boolean {
  if (source.kind === 'column') {
    const group = current.columnGroups?.find(
      (candidate) => candidate.columnGroupId === source.parentId
    )
    const descriptor = peer.columnGroups?.find(
      (candidate) => candidate.columnGroupId === source.parentId
    )?.columns?.[source.index]
    if (group === undefined) return false
    if (descriptor !== undefined)
      (group.columns ??= []).splice(index, 0, Tools.deepClone(descriptor))
    return true
  }
  const table = tables.current?.[source.parentId]
  const peerTable = tables.peer?.[source.parentId]
  if (table === undefined || peerTable === undefined) return false
  let targetColumn = table.tableColumns.length
  let peerColumn = targetColumn
  if (source.kind === 'row') {
    const row = peerTable.tableRows[source.index]
    if (row === undefined) return false
    table.tableRows.splice(index, 0, Tools.deepClone(row))
  } else if (source.kind === 'cell') {
    const row = targetRowIndex === undefined ? undefined : table.tableRows[targetRowIndex]
    const peerRow = source.rowIndex === undefined ? undefined : peerTable.tableRows[source.rowIndex]
    const cell = peerRow?.tableCells[source.index]
    if (row === undefined || peerRow === undefined || cell === undefined) return false
    targetColumn = tableCellGridColumn(row, index)
    peerColumn = tableCellGridColumn(peerRow, source.index)
    row.tableCells.splice(index, 0, Tools.deepClone(cell))
  } else return false
  const width = Math.max(
    ...table.tableRows.map(
      (row) =>
        (row.gridBefore ?? 0) +
        (row.gridAfter ?? 0) +
        row.tableCells.reduce((sum, cell) => sum + (cell.columnSpan ?? 1), 0)
    )
  )
  const added = width - table.tableColumns.length
  if (added > 0) {
    const columns = peerTable.tableColumns.slice(peerColumn, peerColumn + added)
    table.tableColumns.splice(targetColumn, 0, ...Tools.deepClone(columns))
    table.size = {
      ...table.size,
      width: {
        ...table.size.width,
        v: table.tableColumns.reduce((sum, column) => sum + (column.size.width?.v ?? 0), 0)
      }
    }
  }
  return true
}

function tableCellGridColumn(row: ITableRow, index: number): number {
  // Cell ordinals are not grid columns: preceding cells can span columns or start after a gap.
  return (
    (row.gridBefore ?? 0) +
    row.tableCells.slice(0, index).reduce((sum, cell) => sum + (cell.columnSpan ?? 1), 0)
  )
}

function decorateCellPresence(
  body: IDocumentBody,
  tables: IDocumentData['tableSource'],
  rows: readonly DocumentComparisonRow[],
  side: ComparisonSide,
  ghosts: ReadonlyMap<string, string>
): void {
  const tones = new Map<string, ComparisonTone>([...ghosts.values()].map((id) => [id, 'delete']))
  for (const row of rows) {
    const own = row[side]
    if (own !== null && (row.left === null || row.right === null))
      tones.set(own.paragraphId, row.moved ? 'update' : 'insert')
  }
  const paragraphs = paragraphSpans(body)
  for (const container of paragraphContainers(body).filter(
    (candidate) => candidate.kind === 'cell'
  )) {
    const contained = paragraphs.filter((paragraph) => containsParagraph(container, paragraph.end))
    const tone = contained.length === 0 ? undefined : tones.get(contained[0]!.id)
    if (tone === undefined || !contained.every((paragraph) => tones.get(paragraph.id) === tone))
      continue
    const cell =
      tables?.[container.parentId]?.tableRows[container.rowIndex!]?.tableCells[container.index]
    if (cell !== undefined) cell.backgroundColor = { rgb: PARAGRAPH_TONE_COLOR[tone] }
  }
}

function nestedParagraphInsertionOffset(
  current: IDocumentBody,
  sourceContainers: readonly ParagraphContainer[],
  rows: readonly DocumentComparisonRow[],
  rowIndex: number,
  side: ComparisonSide,
  ghostIds: ReadonlyMap<string, string>
): number | undefined {
  const peerSide = side === 'left' ? 'right' : 'left'
  const source = rows[rowIndex]?.[peerSide]
  if (source == null) return undefined
  const container = sourceContainers.find((candidate) => containsParagraph(candidate, source.end))
  if (container === undefined) return undefined
  const spans = new Map(paragraphSpans(current).map((span) => [span.id, span]))
  // Older column snapshots may omit column IDs. Use an SDK-paired paragraph within that column,
  // never its ordinal: an inserted adjacent cell/column must not steal this placeholder.
  const target = matchingContainer(
    container,
    sourceContainers,
    paragraphContainers(current),
    rows,
    side,
    spans
  )
  if (target === undefined) return undefined
  for (const row of rows.slice(rowIndex + 1)) {
    const id = row[side]?.paragraphId ?? ghostIds.get(row.id)
    const span = id === undefined ? undefined : spans.get(id)
    // Include current-only paragraphs in the SDK order when two replacements share a native slot.
    if (span !== undefined && containsParagraph(target, span.end))
      return paragraphInlineStart(current, span.start)
  }
  return target.contentEnd
}

function ghostInsertionOffset(
  current: IDocumentBody,
  nextRows: readonly DocumentComparisonRow[],
  side: ComparisonSide,
  ghostIds: ReadonlyMap<string, string>
): number {
  const spans = new Map(paragraphSpans(current).map((span) => [span.id, span]))
  for (const row of nextRows) {
    const id = row[side]?.paragraphId ?? ghostIds.get(row.id)
    const span = id === undefined ? undefined : spans.get(id)
    if (span === undefined) continue
    // An aligned paragraph inside a table/column/block is not a root-level insertion point.
    return structuralRanges(current).reduce(
      (offset, range) =>
        range.startOffset <= span.end && span.end < range.endOffset
          ? Math.min(offset, range.startOffset)
          : offset,
      span.start
    )
  }
  return findSentinelOffset(current)
}

function insertGhostBody(
  current: IDocumentBody,
  insertion: IDocumentBody,
  offset: number,
  side: ComparisonSide,
  rowIndex: number
): Map<string, string> {
  const existingIds = new Set(current.paragraphs?.map((paragraph) => paragraph.paragraphId))
  const ids = new Map<string, string>()
  const paragraphs = paragraphSpans(insertion)
  for (const span of paragraphs) {
    let id = span.id
    while (existingIds.has(id)) id = `comparison-ghost-${side}-${rowIndex}-${id}`
    existingIds.add(id)
    ids.set(span.id, id)
    span.paragraph.paragraphId = id
    applyParagraphTone(span.paragraph, 'delete')
    applyTone(insertion, { start: span.start, end: span.end, tone: 'delete' })
  }
  const insertedIds = new Map(
    insertion.paragraphs?.map((paragraph) => [offset + paragraph.startIndex, paragraph.paragraphId])
  )
  const existingSections = new Set(current.sectionBreaks?.map((section) => section.sectionId))
  const insertedSections = new Map<number, string>()
  for (const section of insertion.sectionBreaks ?? []) {
    if (section.sectionId === undefined) continue
    let id = section.sectionId
    while (existingSections.has(id)) id = `comparison-ghost-section-${side}-${rowIndex}-${id}`
    existingSections.add(id)
    insertedSections.set(offset + section.startIndex, id)
  }
  TextX.apply(current, [
    { t: TextXActionType.RETAIN, len: offset },
    { t: TextXActionType.INSERT, len: insertion.dataStream.length, body: insertion }
  ])
  // TextX generates fresh paragraph/section IDs. Keep render-only identities stable so later
  // slot insertions can locate cells by their section boundary and repeated renders are deterministic.
  for (const paragraph of current.paragraphs ?? []) {
    const id = insertedIds.get(paragraph.startIndex)
    if (id !== undefined) paragraph.paragraphId = id
  }
  for (const section of current.sectionBreaks ?? []) {
    const id = insertedSections.get(section.startIndex)
    if (id !== undefined) section.sectionId = id
  }
  return ids
}

function paragraphInsertionBody(
  source: IDocumentBody,
  paragraph: DocumentComparisonParagraph
): IDocumentBody {
  const start = paragraphInlineStart(source, paragraph.start)
  return Tools.deepClone(getBodySliceForTextXAction(source, start, paragraph.end + 1, false))
}

function paragraphInlineStart(body: IDocumentBody, offset: number): number {
  let start = offset
  const inlineTokens: readonly string[] = [
    DataStreamTreeTokenType.CUSTOM_RANGE_START,
    DataStreamTreeTokenType.CUSTOM_RANGE_END,
    DataStreamTreeTokenType.CUSTOM_BLOCK
  ]
  while (start > 0 && inlineTokens.includes(body.dataStream[start - 1]!)) start -= 1
  return start
}

function findSentinelOffset(body: IDocumentBody): number {
  const sentinel = (body.paragraphs ?? []).find(
    (paragraph) => body.dataStream[paragraph.startIndex] === '\0'
  )
  return (
    sentinel?.startIndex ??
    (body.dataStream.endsWith(DataStreamTreeTokenType.SECTION_BREAK)
      ? body.dataStream.length - 1
      : body.dataStream.length)
  )
}

function paragraphSpans(body: IDocumentBody | undefined): ParagraphSpan[] {
  if (body === undefined) return []
  const indices = new Map((body.paragraphs ?? []).map((paragraph, index) => [paragraph, index]))
  const paragraphs = [...(body.paragraphs ?? [])]
    .filter((paragraph) => typeof paragraph.paragraphId === 'string')
    .sort((left, right) => left.startIndex - right.startIndex)
  return paragraphs.map((paragraph, index) => {
    let start = index === 0 ? 0 : (paragraphs[index - 1]?.startIndex ?? -1) + 1
    // Locate visible text after native table/column/control tokens; this is geometry, not diffing.
    while (start < paragraph.startIndex) {
      const code = body.dataStream.charCodeAt(start)
      if (code !== 8 && code !== 10 && code !== 11 && (code < 14 || code > 31)) break
      start += 1
    }
    return {
      id: paragraph.paragraphId!,
      index: indices.get(paragraph)!,
      start,
      end: paragraph.startIndex,
      paragraph
    }
  })
}

function buildTextRanges(
  segments: NonNullable<IUnitComparisonChange['segments']>,
  leftStart: number,
  rightStart: number
): { left: ToneRange[]; right: ToneRange[] } {
  const chunks: Array<{ kind: 'equal' | 'delete' | 'insert'; text: string }> = []
  let li = 0
  let ri = 0
  let lo = 0
  let ro = 0
  while (li < segments.left.length || ri < segments.right.length) {
    const before = segments.left[li]
    const after = segments.right[ri]
    if (before !== undefined && lo === before.text.length) {
      li += 1
      lo = 0
      continue
    }
    if (after !== undefined && ro === after.text.length) {
      ri += 1
      ro = 0
      continue
    }
    if (before?.kind === 'delete') {
      chunks.push({ kind: 'delete', text: before.text.slice(lo) })
      li += 1
      lo = 0
    } else if (after?.kind === 'insert') {
      chunks.push({ kind: 'insert', text: after.text.slice(ro) })
      ri += 1
      ro = 0
    } else if (before?.kind === 'equal' && after?.kind === 'equal') {
      // A side may coalesce two equal runs around an insertion on its peer. Consume only the
      // common remaining length; advancing both whole segments would lose alignment or loop.
      const count = Math.min(before.text.length - lo, after.text.length - ro)
      chunks.push({ kind: 'equal', text: before.text.slice(lo, lo + count) })
      lo += count
      ro += count
    } else {
      throw new Error('Invalid SDK comparison text segments')
    }
  }
  const left: ToneRange[] = []
  const right: ToneRange[] = []
  let leftOffset = leftStart
  let rightOffset = rightStart
  for (let index = 0; index < chunks.length;) {
    const chunk = chunks[index]!
    if (chunk.kind === 'equal') {
      leftOffset += chunk.text.length
      rightOffset += chunk.text.length
      index += 1
      continue
    }
    let leftLength = 0
    let rightLength = 0
    let hasDeletion = false
    let hasInsertion = false
    while (index < chunks.length) {
      const changed = chunks[index]!
      if (changed.kind === 'equal') {
        const next = chunks[index + 1]
        if (changed.text.length > 2 || next === undefined || next.kind === 'equal') break
        leftLength += changed.text.length
        rightLength += changed.text.length
      } else if (changed.kind === 'delete') {
        leftLength += changed.text.length
        hasDeletion = true
      } else {
        rightLength += changed.text.length
        hasInsertion = true
      }
      index += 1
    }
    if (leftLength > 0)
      left.push({
        start: leftOffset,
        end: leftOffset + leftLength,
        tone: hasInsertion ? 'update' : 'delete'
      })
    if (rightLength > 0)
      right.push({
        start: rightOffset,
        end: rightOffset + rightLength,
        tone: hasDeletion ? 'update' : 'insert'
      })
    leftOffset += leftLength
    rightOffset += rightLength
  }
  return { left, right }
}

function applyTone(body: IDocumentBody, range: ToneRange): void {
  applyTextStyle(
    body,
    range.start,
    range.end,
    range.emphasized ? EMPHASIZED_TONE_STYLE[range.tone] : TONE_STYLE[range.tone]
  )
}

function applyTextStyle(body: IDocumentBody, start: number, end: number, style: ITextStyle): void {
  const length = end - start
  if (length <= 0) return
  // A paint-only retain must not slice/recompose hyperlinks or other structural metadata.
  // Let native TextX merge text styles, then project only those styles back onto the render copy.
  const styled: IDocumentBody = { dataStream: body.dataStream, textRuns: body.textRuns ?? [] }
  TextX.apply(styled, [
    { t: TextXActionType.RETAIN, len: start },
    {
      t: TextXActionType.RETAIN,
      len: length,
      body: {
        dataStream: '',
        textRuns: [{ st: 0, ed: length, ts: style }]
      }
    }
  ])
  body.textRuns = styled.textRuns ?? []
}

function applyParagraphTone(paragraph: IParagraph, tone: ComparisonTone, emphasized = false): void {
  paragraph.paragraphStyle = {
    ...paragraph.paragraphStyle,
    shading: {
      backgroundColor: {
        rgb: emphasized ? EMPHASIZED_PARAGRAPH_TONE_COLOR[tone] : PARAGRAPH_TONE_COLOR[tone]
      }
    }
  }
}

function decorateStructuredRanges(
  current: IDocumentBody,
  items: readonly UnitStructuralDiffItem[],
  side: ComparisonSide,
  selectedItemId: string | undefined
): void {
  for (const [category, idKey, collection, shade] of [
    ['block-range', 'blockId', current.blockRanges, true],
    ['custom-range', 'rangeId', current.customRanges, false],
    ['column-group', 'columnGroupId', current.columnGroups, true]
  ] as const) {
    const rendered = indexedRanges(collection, idKey)
    for (const item of items.filter((item) => item.entityType === category)) {
      const range = rendered.get(item.nativeStableIds?.[side] ?? item.stableId)
      if (range === undefined) continue
      const tone: ComparisonTone =
        item.kind === 'update'
          ? 'update'
          : (item.kind === 'insert') === (side === 'right')
            ? 'insert'
            : 'delete'
      const emphasized = item.id === selectedItemId
      for (const paragraph of paragraphSpans(current)) {
        const start = Math.max(paragraph.start, range.startIndex)
        const end = Math.min(paragraph.end, range.endIndex + 1)
        if (end > start) applyTone(current, { start, end, tone, emphasized })
        if (shade && paragraph.start < range.endIndex + 1 && paragraph.end + 1 > range.startIndex) {
          applyParagraphTone(paragraph.paragraph, tone, emphasized)
        }
      }
    }
  }
}

function indexedRanges(
  value: unknown,
  idKey: 'blockId' | 'rangeId' | 'columnGroupId'
): Map<
  string,
  { readonly startIndex: number; readonly endIndex: number; readonly [key: string]: unknown }
> {
  const values = Array.isArray(value) ? value : []
  return new Map(
    values.flatMap((entry) => {
      if (typeof entry !== 'object' || entry === null) return []
      const range = entry as Record<string, unknown>
      const id = range[idKey]
      return typeof id === 'string' &&
        typeof range.startIndex === 'number' &&
        typeof range.endIndex === 'number'
        ? [
            [
              id,
              range as {
                readonly startIndex: number
                readonly endIndex: number
                readonly [key: string]: unknown
              }
            ] as const
          ]
        : []
    })
  )
}

function copyMissingRootObjects(
  decorated: IDocumentData,
  peer: IDocumentData,
  items: readonly UnitStructuralDiffItem[],
  side: ComparisonSide
): void {
  const target = decorated as IDocumentData & Record<string, unknown>
  const source = peer as IDocumentData & Record<string, unknown>
  const peerSide = side === 'left' ? 'right' : 'left'
  const missingKind = side === 'left' ? 'insert' : 'delete'
  for (const [key, entityType] of [
    ['tableSource', 'table'],
    ['drawings', 'drawing']
  ] as const) {
    const targetRecord = asRecord(target[key]) ?? {}
    const sourceRecord = asRecord(source[key]) ?? {}
    const missingIds = new Set(
      items
        .filter((item) => item.entityType === entityType && item.kind === missingKind)
        .map((item) => item.nativeStableIds?.[peerSide] ?? item.stableId)
    )
    const additions = Object.entries(sourceRecord).filter(([id]) => missingIds.has(id))
    if (additions.length === 0) continue
    Reflect.set(target, key, {
      ...Tools.deepClone(Object.fromEntries(additions)),
      ...targetRecord
    })
  }
}

function decorateTables(
  decorated: IDocumentData,
  items: readonly UnitStructuralDiffItem[],
  side: ComparisonSide,
  selectedItemId: string | undefined
): void {
  const renderedTables =
    asRecord((decorated as IDocumentData & Record<string, unknown>).tableSource) ?? {}
  for (const item of items.filter((candidate) => candidate.entityType === 'table')) {
    const table = asRecord(renderedTables[item.stableId])
    const rows = Array.isArray(table?.tableRows) ? table.tableRows : []
    const changedCells = new Set<string>()
    let wholeTable = item.kind !== 'update'
    for (const change of item.changes) {
      const path = change.sourcePath ?? change.path
      const rowIndex = path.indexOf('tableRows')
      const cellIndex = path.indexOf('tableCells')
      if (rowIndex >= 0 && cellIndex >= 0)
        changedCells.add(`${path[rowIndex + 1]}:${path[cellIndex + 1]}`)
      else wholeTable = true
    }
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = asRecord(rows[rowIndex])
      const cells = Array.isArray(row?.tableCells) ? row.tableCells : []
      for (let columnIndex = 0; columnIndex < cells.length; columnIndex += 1) {
        if (!wholeTable && !changedCells.has(`${rowIndex}:${columnIndex}`)) continue
        const cell = asRecord(cells[columnIndex])
        if (cell === undefined) continue
        const tone: ComparisonTone =
          item.kind === 'update'
            ? 'update'
            : (item.kind === 'insert') === (side === 'right')
              ? 'insert'
              : 'delete'
        cell.backgroundColor = {
          rgb:
            item.id === selectedItemId
              ? EMPHASIZED_PARAGRAPH_TONE_COLOR[tone]
              : PARAGRAPH_TONE_COLOR[tone]
        }
      }
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function mergeAdjacentRanges(ranges: readonly ToneRange[]): ToneRange[] {
  const sorted = [...ranges]
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)
  const merged: ToneRange[] = []
  for (const range of sorted) {
    const previous = merged[merged.length - 1]
    if (
      previous !== undefined &&
      previous.tone === range.tone &&
      previous.emphasized === range.emphasized &&
      previous.end >= range.start
    ) {
      merged[merged.length - 1] = { ...previous, end: Math.max(previous.end, range.end) }
    } else {
      merged.push(range)
    }
  }
  return merged
}
