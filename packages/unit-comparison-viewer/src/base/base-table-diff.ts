import type { UnitStructuralDiffItem, UnitStructuralDiffKind } from '../shared/structural-diff.js'
import { formatBaseDateValue, formatBaseNumberValue } from '@univerjs-pro/bases'
import { BaseFieldType } from '@univerjs/core'

export interface BaseDiffField {
  readonly id: string
  readonly left: Record<string, unknown> | null
  readonly right: Record<string, unknown> | null
  readonly label: string
  readonly status: UnitStructuralDiffKind | null
}

export interface BaseDiffRecord {
  readonly cellChanges: ReadonlyMap<string, UnitStructuralDiffKind>
  readonly id: string
  readonly left: Record<string, unknown> | null
  readonly right: Record<string, unknown> | null
  readonly label: string
  readonly status: UnitStructuralDiffKind | null
}

export interface BaseTableDiff {
  readonly id: string
  readonly label: string
  readonly status: UnitStructuralDiffKind
  readonly left: Record<string, unknown> | null
  readonly right: Record<string, unknown> | null
  readonly fields: readonly BaseDiffField[]
  readonly records: readonly BaseDiffRecord[]
}

export interface BaseDiffCell {
  readonly displayValue: string
  readonly present: boolean
  readonly value: unknown
  readonly status: UnitStructuralDiffKind | null
}

export interface BaseDiffGridLayout {
  readonly columnWidths: readonly number[]
  readonly gridTemplateColumns: string
  readonly totalWidth: number
}

const BASE_ROW_HEADER_WIDTH = 44
const BASE_DEFAULT_FIELD_WIDTH = 160
const BASE_MIN_FIELD_WIDTH = 80
const BASE_MAX_FIELD_WIDTH = 480

/** Preserve the original header on each side when a field has been renamed. */
export function baseDiffFieldLabel(field: BaseDiffField, side: 'left' | 'right'): string {
  const name = field[side]?.name
  return typeof name === 'string' && name.length > 0 ? name : field.label
}

/** Projects SDK differences onto one shared DOM grid; never compares snapshot values. */
export function buildBaseTableDiff(
  left: unknown,
  right: unknown,
  items: readonly UnitStructuralDiffItem[]
): BaseTableDiff[] {
  const leftTables = asRecord(asRecord(left)?.tables) ?? {}
  const rightTables = asRecord(asRecord(right)?.tables) ?? {}
  const tableIds = alignStableOrder(
    orderedIds(leftTables, asRecord(left)?.tableOrder),
    orderedIds(rightTables, asRecord(right)?.tableOrder)
  )

  return tableIds.flatMap((tableId) => {
    const leftTable = asRecord(leftTables[tableId]) ?? null
    const rightTable = asRecord(rightTables[tableId]) ?? null
    const tableItem = items.find((item) => item.entityType === 'table' && item.stableId === tableId)
    const children = items.filter((item) => item.parentStableId === tableId)
    if (tableItem === undefined && children.length === 0) return []
    const fields = buildFields(leftTable, rightTable, children)
    const records = buildRecords(leftTable, rightTable, fields, children)
    const status = tableItem?.kind ?? 'update'
    return [
      {
        id: tableId,
        label: displayName(rightTable) ?? displayName(leftTable) ?? tableId,
        status,
        left: leftTable,
        right: rightTable,
        fields,
        records
      }
    ]
  })
}

export function getBaseDiffCell(input: {
  readonly field: BaseDiffField
  readonly record: BaseDiffRecord
  readonly side: 'left' | 'right'
}): BaseDiffCell {
  const field = input.field[input.side]
  const record = input.record[input.side]
  const present = field !== null && record !== null
  const value = asRecord(record)?.values
  const cellValue = asRecord(value)?.[input.field.id]
  const kind =
    input.record.cellChanges.get(input.field.id) ??
    (input.field.status === 'insert' || input.field.status === 'delete'
      ? input.field.status
      : input.record.status === 'insert' || input.record.status === 'delete'
        ? input.record.status
        : null)
  const status =
    kind === null || kind === 'update'
      ? kind
      : (kind === 'insert') === (input.side === 'right')
        ? 'insert'
        : 'delete'
  return {
    displayValue: present ? formatBaseCellValue(cellValue, field ?? undefined) : '',
    present,
    value: cellValue,
    status
  }
}

/**
 * Resolve one shared Base grid geometry from both snapshots. The comparison panes must consume
 * these exact pixel tracks; letting each DOM grid size itself from its own content makes their
 * scroll widths diverge and breaks pixel-aligned horizontal scrolling.
 */
export function buildBaseDiffGridLayout(table: BaseTableDiff): BaseDiffGridLayout {
  const columnWidths = table.fields.map((field) => resolveFieldWidth(table, field))
  return {
    columnWidths,
    gridTemplateColumns: `${BASE_ROW_HEADER_WIDTH}px ${columnWidths.map((width) => `${width}px`).join(' ')}`,
    totalWidth: BASE_ROW_HEADER_WIDTH + columnWidths.reduce((total, width) => total + width, 0)
  }
}

export function formatBaseCellValue(value: unknown, field?: Record<string, unknown>): string {
  if (value === undefined || value === null) return ''
  const config = asRecord(field?.config) ?? {}
  if (
    [BaseFieldType.Date, BaseFieldType.CreatedAt, BaseFieldType.UpdatedAt].some(
      (type) => field?.type === type
    )
  ) {
    return formatBaseDateValue(value, config)
  }
  if (field?.type === BaseFieldType.Number || field?.type === BaseFieldType.Currency) {
    if (value === '') return ''
    const number = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(number) ? formatBaseNumberValue(number, config) : String(value)
  }
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value))
    return value
      .map((entry) => formatBaseCellValue(entry))
      .filter(Boolean)
      .join(', ')
  const record = asRecord(value)
  if (record === undefined) return String(value)
  const humanLabel = [
    record.name,
    record.label,
    record.title,
    record.text,
    record.url,
    record.email
  ].find((candidate): candidate is string => typeof candidate === 'string')
  return humanLabel ?? JSON.stringify(value)
}

function buildFields(
  leftTable: Record<string, unknown> | null,
  rightTable: Record<string, unknown> | null,
  items: readonly UnitStructuralDiffItem[]
): BaseDiffField[] {
  const leftFields = asRecord(leftTable?.fields) ?? {}
  const rightFields = asRecord(rightTable?.fields) ?? {}
  const leftIds = orderedIds(leftFields, leftTable?.fieldOrder).filter((id) =>
    isVisibleComparisonField(leftFields[id])
  )
  const rightIds = orderedIds(rightFields, rightTable?.fieldOrder).filter((id) =>
    isVisibleComparisonField(rightFields[id])
  )
  const ids = alignStableOrder(leftIds, rightIds)
  const changes = new Map(
    items.filter((item) => item.entityType === 'field').map((item) => [item.stableId, item.kind])
  )
  return ids.map((id) => {
    const left = asRecord(leftFields[id]) ?? null
    const right = asRecord(rightFields[id]) ?? null
    return {
      id,
      left,
      right,
      label: displayName(right) ?? displayName(left) ?? id,
      status: changes.get(id) ?? null
    }
  })
}

function isVisibleComparisonField(value: unknown): boolean {
  const field = asRecord(value)
  return field !== undefined && field.system !== true && field.type !== 'recordId'
}

function buildRecords(
  leftTable: Record<string, unknown> | null,
  rightTable: Record<string, unknown> | null,
  fields: readonly BaseDiffField[],
  items: readonly UnitStructuralDiffItem[]
): BaseDiffRecord[] {
  const leftRecords = asRecord(leftTable?.records) ?? {}
  const rightRecords = asRecord(rightTable?.records) ?? {}
  const leftIds = orderedIds(leftRecords, leftTable?.recordOrder)
  const rightIds = orderedIds(rightRecords, rightTable?.recordOrder)
  const ids = alignStableOrder(leftIds, rightIds)
  const changes = new Map(
    items.filter((item) => item.entityType === 'record').map((item) => [item.stableId, item.kind])
  )
  const cellChanges = new Map(
    items.filter((item) => item.entityType === 'cell').map((item) => [item.stableId, item.kind])
  )
  const labelFieldId =
    typeof rightTable?.primaryFieldId === 'string'
      ? rightTable.primaryFieldId
      : typeof leftTable?.primaryFieldId === 'string'
        ? leftTable.primaryFieldId
        : fields[0]?.id
  return ids.map((id) => {
    const left = asRecord(leftRecords[id]) ?? null
    const right = asRecord(rightRecords[id]) ?? null
    const status = changes.get(id) ?? null
    const labelValue =
      asRecord(asRecord(right)?.values)?.[labelFieldId ?? ''] ??
      asRecord(asRecord(left)?.values)?.[labelFieldId ?? '']
    return {
      id,
      left,
      right,
      label: formatBaseCellValue(labelValue) || id,
      cellChanges: new Map(
        fields.flatMap((field) => {
          const kind = cellChanges.get(`${id}:${field.id}`)
          return kind === undefined ? [] : [[field.id, kind] as const]
        })
      ),
      status
    }
  })
}

function resolveFieldWidth(table: BaseTableDiff, field: BaseDiffField): number {
  const widths = [
    viewFieldWidth(table.left, field.id, field.left !== null),
    viewFieldWidth(table.right, field.id, field.right !== null)
  ].filter((width): width is number => width !== null)
  const width = widths.length === 0 ? BASE_DEFAULT_FIELD_WIDTH : Math.max(...widths)
  return Math.min(BASE_MAX_FIELD_WIDTH, Math.max(BASE_MIN_FIELD_WIDTH, Math.round(width)))
}

function viewFieldWidth(
  table: Record<string, unknown> | null,
  fieldId: string,
  fieldPresent: boolean
): number | null {
  if (table === null || !fieldPresent) return null
  const views = asRecord(table.views) ?? {}
  const viewIds = orderedIds(views, table.viewOrder)
  const gridViews = viewIds
    .map((id) => asRecord(views[id]))
    .filter((view): view is Record<string, unknown> => view !== undefined && view.type === 'grid')
  for (const view of gridViews) {
    const setting = asRecord(asRecord(view.fieldSettings)?.[fieldId])
    if (typeof setting?.width === 'number' && Number.isFinite(setting.width)) return setting.width
  }
  return BASE_DEFAULT_FIELD_WIDTH
}

function orderedIds(record: Record<string, unknown>, orderValue: unknown): string[] {
  const order = Array.isArray(orderValue)
    ? orderValue.filter((id): id is string => typeof id === 'string' && id in record)
    : []
  return [...order, ...Object.keys(record).filter((id) => !order.includes(id))]
}

/**
 * Use the current side as the common spine, then place left-only IDs beside their nearest stable
 * neighbour. Both panes consume this one order, so inserted/deleted fields and records always
 * occupy the same visual row or column.
 */
function alignStableOrder(left: readonly string[], right: readonly string[]): string[] {
  const result = [...right]
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const id = left[leftIndex]
    if (id === undefined) continue
    if (result.includes(id)) continue
    const nextAnchor = left.slice(leftIndex + 1).find((candidate) => result.includes(candidate))
    if (nextAnchor !== undefined) {
      result.splice(result.indexOf(nextAnchor), 0, id)
      continue
    }
    let previousAnchor: string | undefined
    for (let anchorIndex = leftIndex - 1; anchorIndex >= 0; anchorIndex -= 1) {
      const candidate = left[anchorIndex]
      if (candidate !== undefined && result.includes(candidate)) {
        previousAnchor = candidate
        break
      }
    }
    if (previousAnchor === undefined) result.push(id)
    else result.splice(result.indexOf(previousAnchor) + 1, 0, id)
  }
  return result
}

function displayName(value: Record<string, unknown> | null): string | null {
  return typeof value?.name === 'string' ? value.name : null
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
