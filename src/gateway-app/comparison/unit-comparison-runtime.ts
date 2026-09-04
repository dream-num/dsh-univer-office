import type {
  IPreparedUnitComparison,
  IUnitComparisonProductContext,
  IUnitComparisonQuery,
  IUnitComparisonResult
} from '@univerjs-pro/edit-history'
import {
  createUnitComparisonEngine,
  UnitComparisonDetailLevel,
  UnitComparisonFidelity
} from '@univerjs-pro/edit-history'
import { BasesUnitComparisonAdapter } from '@univerjs-pro/bases-history'
import { BoardsUnitComparisonAdapter } from '@univerjs-pro/boards-history'
import { DocsUnitComparisonAdapter } from '@univerjs-pro/docs-history'
import { SheetsUnitComparisonAdapter } from '@univerjs-pro/sheets-history'
import { SlidesUnitComparisonAdapter } from '@univerjs-pro/slides-history'
import { UniverInstanceType } from '@univerjs/core'
import type {
  UnitComparisonContext,
  UnitComparisonContextItem,
  UnitComparisonContextQuery,
  UnitComparisonProductContext,
  UnitComparisonSummary
} from '../contract/index.js'

export interface PreparedGatewayUnitComparison {
  readonly prepared: IPreparedUnitComparison
  readonly unit: UnitComparisonSummary
}

const comparison = createUnitComparisonEngine([
  new DocsUnitComparisonAdapter(),
  new SheetsUnitComparisonAdapter(),
  new SlidesUnitComparisonAdapter(),
  new BasesUnitComparisonAdapter(),
  new BoardsUnitComparisonAdapter()
])

export function prepareGatewayUnitComparison(input: {
  readonly comparisonId: string
  readonly unit: UnitComparisonSummary
  readonly fidelity: 'history' | 'snapshot'
  readonly commonBaseRevision?: number
  readonly stale: boolean
  readonly leftData: unknown
  readonly rightData: unknown
  readonly leftChangesets: readonly unknown[]
  readonly rightChangesets: readonly unknown[]
}): PreparedGatewayUnitComparison {
  return {
    unit: input.unit,
    prepared: comparison.prepare({
      comparisonId: input.comparisonId,
      unitId: input.unit.unitId,
      unitName: input.unit.name,
      type: input.unit.type,
      fidelity:
        input.fidelity === 'history'
          ? UnitComparisonFidelity.HISTORY
          : UnitComparisonFidelity.SNAPSHOT,
      ...(input.commonBaseRevision === undefined
        ? {}
        : { commonBaseRevision: input.commonBaseRevision }),
      stale: input.stale,
      leftData: input.leftData,
      rightData: input.rightData,
      leftChangesets: input.leftChangesets,
      rightChangesets: input.rightChangesets
    })
  }
}

export function queryGatewayUnitComparison(
  prepared: PreparedGatewayUnitComparison,
  query: UnitComparisonContextQuery
): UnitComparisonContext {
  const result = comparison.query(prepared.prepared, toSdkQuery(query))
  return {
    ...result,
    unit: prepared.unit,
    items: result.items.map(toWireItem),
    productContext: toWireProductContext(
      result,
      prepared.unit.type,
      prepared.prepared.adapterResult.items
    )
  }
}

function toSdkQuery(query: UnitComparisonContextQuery): IUnitComparisonQuery {
  const detail =
    query.detail ??
    (query.includeValues === undefined
      ? UnitComparisonDetailLevel.FULL
      : query.includeValues
        ? UnitComparisonDetailLevel.FULL
        : UnitComparisonDetailLevel.SUMMARY)
  return {
    ...(query.offset === undefined ? {} : { offset: query.offset }),
    ...(query.limit === undefined ? {} : { limit: query.limit }),
    ...(query.contextOffset === undefined ? {} : { contextOffset: query.contextOffset }),
    ...(query.contextLimit === undefined ? {} : { contextLimit: query.contextLimit }),
    ...(query.kinds === undefined ? {} : { kinds: query.kinds }),
    ...(query.entityTypes === undefined ? {} : { entityTypes: query.entityTypes }),
    ...(query.parentStableId === undefined ? {} : { parentStableId: query.parentStableId }),
    ...(query.scope === undefined ? {} : { scope: query.scope }),
    ...(query.search === undefined ? {} : { search: query.search }),
    detail
  } as IUnitComparisonQuery
}

function toWireItem(item: IUnitComparisonResult['items'][number]): UnitComparisonContextItem {
  return {
    ...item,
    title: item.displayName ?? item.stableId,
    details: []
  }
}

function toWireProductContext(
  result: IUnitComparisonResult,
  type: UnitComparisonSummary['type'],
  allItems: IUnitComparisonResult['items']
): UnitComparisonProductContext {
  const context = result.productContext
  if (type === UniverInstanceType.UNIVER_SHEET) {
    return {
      kind: 'sheet',
      sheets:
        context !== undefined && 'sheets' in context
          ? context.sheets.map((sheet) => ({
              id: sheet.sheetId,
              name: sheet.name,
              status: sheetStatus(allItems, sheet.sheetId),
              changeCount: sheet.changeCount,
              rows: sheet.rows,
              columns: sheet.columns
            }))
          : []
    }
  }
  if (type === UniverInstanceType.UNIVER_DOC) {
    return docProductContext(context, allItems)
  }
  if (type === UniverInstanceType.UNIVER_SLIDE) return { kind: 'slide' }
  if (type === UniverInstanceType.UNIVER_BASE) {
    return { kind: 'base', visualProjection: 'raw-table-data' }
  }
  return { kind: 'board' }
}

function docProductContext(
  context: IUnitComparisonProductContext | undefined,
  allItems: IUnitComparisonResult['items']
): UnitComparisonProductContext {
  if (context === undefined || !('paragraphAlignment' in context)) {
    return {
      kind: 'doc',
      paragraphAlignment: {
        total: 0,
        rows: [],
        page: { offset: 0, limit: 1000, matched: 0, hasMore: false }
      }
    }
  }
  const itemByStableId = new Map(
    allItems
      .filter((item) => item.entityType === 'paragraph')
      .map((item) => [JSON.stringify([item.parentStableId, item.stableId]), item])
  )
  const rowOffset = context.paragraphAlignmentPage?.offset ?? 0
  const rows = context.paragraphAlignment.map((row, index) => {
    const parent =
      row.segmentPath === undefined ? undefined : `${row.segmentPath[0]}:${row.segmentPath[1]}`
    const item = itemByStableId.get(JSON.stringify([parent, row.stableId]))
    const kind: 'delete' | 'equal' | 'insert' | 'update' = item?.kind ?? 'equal'
    return {
      id: `paragraph:${parent ?? 'body'}:${row.stableId}:${rowOffset + index}`,
      stableId: row.stableId,
      kind,
      moved: item?.moved ?? false,
      leftIndex: row.leftPosition,
      rightIndex: row.rightPosition,
      leftNativeStableId: row.leftNativeStableId,
      rightNativeStableId: row.rightNativeStableId,
      ...(row.segmentPath === undefined ? {} : { segmentPath: row.segmentPath })
    }
  })
  const page = context.paragraphAlignmentPage ?? {
    offset: 0,
    limit: rows.length,
    matched: rows.length,
    hasMore: false
  }
  return { kind: 'doc', paragraphAlignment: { total: page.matched, rows, page } }
}

function sheetStatus(
  items: IUnitComparisonResult['items'],
  sheetId: string
): 'delete' | 'insert' | 'update' | 'unchanged' {
  const worksheet = items.find(
    (item) => item.entityType === 'worksheet' && item.stableId === sheetId
  )
  return worksheet?.kind ?? 'update'
}
