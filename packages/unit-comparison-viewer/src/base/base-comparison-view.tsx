import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type UIEvent
} from 'react'
import { Badge } from '../ui/badge.js'
import {
  buildBaseDiffGridLayout,
  baseDiffFieldLabel,
  buildBaseTableDiff,
  getBaseDiffCell,
  type BaseDiffCell,
  type BaseDiffField,
  type BaseDiffRecord,
  type BaseTableDiff
} from './base-table-diff'
import {
  baseTableIdOfDiffItem,
  filterBaseTableDiffItems,
  type UnitStructuralDiffItem,
  type UnitStructuralDiffKind
} from '../shared/structural-diff.js'
import { cn } from '../ui/cn.js'
import { useUnitComparisonViewerMessages } from '../i18n/messages.js'
import { ComparisonPageTabs } from '../shared/scope-tabs'
import { useEnsureSelectedDiffVisible } from '../shared/use-ensure-selected-diff-visible'
import { structuralDiffItemLabel } from '../shared/structural-diff-item-label'

export function BaseTableDiffViewer(input: {
  readonly fidelity: 'history' | 'snapshot'
  readonly items: readonly UnitStructuralDiffItem[]
  readonly left: unknown
  readonly leftLabel: string
  readonly leftSourceControl: ReactNode
  readonly right: unknown
  readonly rightLabel: string
}): ReactElement {
  const tables = useMemo(
    () => buildBaseTableDiff(input.left, input.right, input.items),
    [input.left, input.right, input.items]
  )
  const visibleItems = useMemo(
    () => input.items.filter((item) => isVisibleBaseDiffItem(item, tables)),
    [input.items, tables]
  )
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>(undefined)
  const activeTable = tables.find((table) => table.id === activeTableId) ?? tables[0] ?? null
  const scopedItems = useMemo(
    () => (activeTable === null ? [] : filterBaseTableDiffItems(visibleItems, activeTable.id)),
    [activeTable, visibleItems]
  )
  const selectedItem = scopedItems.find((item) => item.id === selectedItemId)

  useEffect(() => {
    if (activeTable === null) setActiveTableId(null)
    else if (activeTable.id !== activeTableId) setActiveTableId(activeTable.id)
  }, [activeTable, activeTableId])

  useEffect(() => {
    if (selectedItemId !== undefined && selectedItem === undefined) setSelectedItemId(undefined)
  }, [selectedItem, selectedItemId])

  const selectItem = (item: UnitStructuralDiffItem): void => {
    setSelectedItemId(item.id)
    const tableId = baseTableIdOfDiffItem(item)
    if (tableId !== null && tables.some((table) => table.id === tableId)) setActiveTableId(tableId)
  }
  const selectTable = (tableId: string): void => {
    setSelectedItemId(undefined)
    setActiveTableId(tableId)
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-2">
      <div className="grid h-full min-h-[420px] grid-cols-[240px_minmax(720px,1fr)] overflow-hidden rounded-xl border border-border bg-border shadow-[0_12px_32px_rgb(15_23_42/0.08),0_1px_2px_rgb(15_23_42/0.06)] max-[1023px]:grid-cols-1 max-[1023px]:grid-rows-1">
        <BaseDiffSidebar
          fidelity={input.fidelity}
          items={scopedItems}
          selectedItemId={selectedItem?.id}
          tables={tables}
          onSelect={selectItem}
        />
        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)] bg-card">
          <BaseDiffPanes
            activeTable={activeTable}
            activeTableId={activeTable?.id ?? null}
            leftLabel={input.leftLabel}
            leftSourceControl={input.leftSourceControl}
            rightLabel={input.rightLabel}
            selectedItem={selectedItem}
            tables={tables}
            onSelectTable={selectTable}
          />
        </div>
      </div>
    </div>
  )
}

function BaseDiffPanes(input: {
  readonly activeTable: BaseTableDiff | null
  readonly activeTableId: string | null
  readonly leftLabel: string
  readonly leftSourceControl: ReactNode
  readonly rightLabel: string
  readonly selectedItem: UnitStructuralDiffItem | undefined
  readonly tables: readonly BaseTableDiff[]
  readonly onSelectTable: (tableId: string) => void
}): ReactElement {
  const leftScrollRef = useRef<HTMLDivElement | null>(null)
  const rightScrollRef = useRef<HTMLDivElement | null>(null)
  const syncingRef = useRef<'left' | 'right' | null>(null)
  const bindLeftScroll = useCallback((node: HTMLDivElement | null): void => {
    leftScrollRef.current = node
  }, [])
  const bindRightScroll = useCallback((node: HTMLDivElement | null): void => {
    rightScrollRef.current = node
  }, [])
  useEffect(() => {
    syncingRef.current = null
    for (const element of [leftScrollRef.current, rightScrollRef.current]) {
      if (element === null) continue
      element.scrollLeft = 0
      element.scrollTop = 0
    }
  }, [input.activeTableId])
  const syncScroll = (side: 'left' | 'right', event: UIEvent<HTMLDivElement>): void => {
    if (syncingRef.current !== null && syncingRef.current !== side) return
    const target = side === 'left' ? rightScrollRef.current : leftScrollRef.current
    if (target === null) return
    syncingRef.current = side
    const source = event.currentTarget
    if (target.scrollLeft !== source.scrollLeft) target.scrollLeft = source.scrollLeft
    if (target.scrollTop !== source.scrollTop) target.scrollTop = source.scrollTop
    requestAnimationFrame(() => {
      syncingRef.current = null
    })
  }
  const tabs = input.tables.map((table) => ({
    id: table.id,
    label: table.label,
    status: table.status
  }))
  return (
    <div
      className="grid min-h-0 grid-cols-2 gap-px bg-border max-[1023px]:h-full max-[1023px]:grid-cols-1 max-[1023px]:grid-rows-2"
      data-testid="base-diff-panes"
    >
      <BaseDiffPane
        activeTable={input.activeTable}
        activeTableId={input.activeTableId}
        label={input.leftLabel}
        bindScroll={bindLeftScroll}
        selectedItem={input.selectedItem}
        side="left"
        sourceControl={input.leftSourceControl}
        tabs={tabs}
        onScroll={(event) => syncScroll('left', event)}
        onSelectTable={input.onSelectTable}
      />
      <BaseDiffPane
        activeTable={input.activeTable}
        activeTableId={input.activeTableId}
        label={input.rightLabel}
        bindScroll={bindRightScroll}
        selectedItem={input.selectedItem}
        side="right"
        sourceControl={undefined}
        tabs={tabs}
        onScroll={(event) => syncScroll('right', event)}
        onSelectTable={input.onSelectTable}
      />
    </div>
  )
}

function BaseDiffPane(input: {
  readonly activeTable: BaseTableDiff | null
  readonly activeTableId: string | null
  readonly label: string
  readonly bindScroll: (node: HTMLDivElement | null) => void
  readonly selectedItem: UnitStructuralDiffItem | undefined
  readonly side: 'left' | 'right'
  readonly sourceControl: ReactNode | undefined
  readonly tabs: readonly {
    readonly id: string
    readonly label: string
    readonly status: UnitStructuralDiffKind
  }[]
  readonly onScroll: (event: UIEvent<HTMLDivElement>) => void
  readonly onSelectTable: (tableId: string) => void
}): ReactElement {
  const messages = useUnitComparisonViewerMessages()
  return (
    <section className="grid min-h-0 grid-rows-[56px_auto_minmax(0,1fr)] bg-background">
      <header className="flex min-w-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
        {input.sourceControl ?? (
          <div className="grid min-w-0 gap-0.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
              {messages.rightCurrentVersion}
            </span>
            <span
              className="truncate text-[12px] font-semibold text-foreground"
              title={input.label}
            >
              {input.label}
            </span>
          </div>
        )}
        <span className="rounded-full border border-border bg-muted/55 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          {messages.readOnly}
        </span>
      </header>
      <ComparisonPageTabs
        activeId={input.activeTableId}
        ariaLabel={`${messages.side[input.side]} · ${messages.changedBaseTables}`}
        options={input.tabs}
        onSelect={input.onSelectTable}
      />
      {input.activeTable === null ? (
        <div className="grid place-items-center bg-card px-6 text-center text-sm text-muted-foreground">
          {messages.noRawTableChanges}
        </div>
      ) : (
        <BaseRawTableGrid
          bindScroll={input.bindScroll}
          selectedItem={input.selectedItem}
          side={input.side}
          table={input.activeTable}
          onScroll={input.onScroll}
        />
      )}
    </section>
  )
}

function BaseRawTableGrid(input: {
  readonly bindScroll: (node: HTMLDivElement | null) => void
  readonly selectedItem: UnitStructuralDiffItem | undefined
  readonly side: 'left' | 'right'
  readonly table: BaseTableDiff
  readonly onScroll: (event: UIEvent<HTMLDivElement>) => void
}): ReactElement {
  const { bindScroll, onScroll, selectedItem, side, table } = input
  const layout = buildBaseDiffGridLayout(table)
  return (
    <div ref={bindScroll} className="min-h-0 overflow-auto bg-card" onScroll={onScroll}>
      <div
        className="grid text-[11px]"
        style={{ gridTemplateColumns: layout.gridTemplateColumns, width: layout.totalWidth }}
        data-grid-width={layout.totalWidth}
        data-testid={`base-raw-diff-${side}`}
      >
        <div className="sticky left-0 top-0 z-30 grid h-10 place-items-center border-b border-r border-border bg-muted/85 font-bold text-muted-foreground backdrop-blur-sm">
          <span
            aria-hidden="true"
            className="size-3.5 rounded-[4px] border border-border bg-card/85 shadow-sm"
          />
        </div>
        {table.fields.map((field) => (
          <BaseFieldHeader key={field.id} field={field} selectedItem={selectedItem} side={side} />
        ))}
        {table.records.map((record, index) => (
          <BaseRecordRow
            key={record.id}
            fields={table.fields}
            index={index}
            record={record}
            selectedItem={selectedItem}
            side={side}
          />
        ))}
      </div>
    </div>
  )
}

function BaseFieldHeader(input: {
  readonly field: BaseDiffField
  readonly selectedItem: UnitStructuralDiffItem | undefined
  readonly side: 'left' | 'right'
}): ReactElement {
  const messages = useUnitComparisonViewerMessages()
  const field = input.field[input.side]
  const label = baseDiffFieldLabel(input.field, input.side)
  const fieldType = getBaseFieldType(input.field, input.side)
  const status = sideStatus(input.field.left, input.field.right, input.field.status, input.side)
  const emphasized =
    input.selectedItem?.entityType === 'field' && input.selectedItem.stableId === input.field.id
  return (
    <div
      className={cn(
        'sticky top-0 z-20 flex h-10 min-w-0 items-center border-b border-r border-border bg-muted/85 px-3 font-semibold text-foreground backdrop-blur-sm',
        toneClass(status, emphasized),
        field === null && 'italic text-muted-foreground'
      )}
      title={field === null ? messages.notPresent : label}
    >
      {field === null ? null : (
        <span
          aria-hidden="true"
          className="mr-2 grid size-4 shrink-0 place-items-center rounded text-[9px] font-bold text-muted-foreground"
        >
          {fieldTypeGlyph(fieldType)}
        </span>
      )}
      <span className="truncate">{field === null ? '—' : label}</span>
      {field === null ? null : (
        <span aria-hidden="true" className="ml-auto pl-2 text-[9px] text-muted-foreground/65">
          ⌄
        </span>
      )}
    </div>
  )
}

function BaseRecordRow(input: {
  readonly fields: readonly BaseDiffField[]
  readonly index: number
  readonly record: BaseDiffRecord
  readonly selectedItem: UnitStructuralDiffItem | undefined
  readonly side: 'left' | 'right'
}): ReactElement {
  const messages = useUnitComparisonViewerMessages()
  const rowStatus = sideStatus(
    input.record.left,
    input.record.right,
    input.record.status,
    input.side
  )
  const recordEmphasized =
    input.selectedItem?.entityType === 'record' && input.selectedItem.stableId === input.record.id
  return (
    <>
      <div
        className={cn(
          'sticky left-0 z-10 grid min-h-9 place-items-center border-b border-r border-border bg-muted/70 font-semibold tabular-nums text-muted-foreground',
          toneClass(rowStatus, recordEmphasized)
        )}
        title={`${input.record.label} · ${input.record.id}`}
      >
        {input.index + 1}
      </div>
      {input.fields.map((field) => {
        const cell = getBaseDiffCell({ field, record: input.record, side: input.side })
        const cellEmphasized =
          input.selectedItem?.entityType === 'cell' &&
          input.selectedItem.stableId === `${input.record.id}:${field.id}`
        return (
          <div
            key={`${input.record.id}:${field.id}`}
            className={cn(
              'flex min-h-9 min-w-0 items-center border-b border-r border-border bg-card px-3 leading-4 text-foreground',
              toneClass(cell.status, cellEmphasized),
              !cell.present &&
                'bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,color-mix(in_srgb,currentColor_7%,transparent)_6px,color-mix(in_srgb,currentColor_7%,transparent)_12px)]'
            )}
            title={
              cell.displayValue ||
              (cell.present ? messages.sheetTree.emptyText : messages.notPresent)
            }
          >
            <BaseCellContent cell={cell} field={field} side={input.side} />
          </div>
        )
      })}
    </>
  )
}

function BaseCellContent(input: {
  readonly cell: BaseDiffCell
  readonly field: BaseDiffField
  readonly side: 'left' | 'right'
}): ReactElement {
  const messages = useUnitComparisonViewerMessages()
  if (!input.cell.present) return <span className="truncate italic text-muted-foreground">—</span>
  const fieldType = getBaseFieldType(input.field, input.side)
  if (fieldType === 'checkbox') {
    const checked = input.cell.value === true
    return (
      <span
        aria-label={checked ? messages.checkboxState.checked : messages.checkboxState.unchecked}
        className={cn(
          'grid size-4 place-items-center rounded-[4px] border text-[10px] font-black',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'
        )}
      >
        {checked ? '✓' : ''}
      </span>
    )
  }
  if (fieldType === 'progress' && typeof input.cell.value === 'number') {
    const progress = Math.min(100, Math.max(0, input.cell.value))
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary/70" style={{ width: `${progress}%` }} />
        </div>
        <span className="w-8 shrink-0 text-right tabular-nums">{progress}%</span>
      </div>
    )
  }
  if (fieldType === 'rating' && typeof input.cell.value === 'number') {
    const rating = Math.min(5, Math.max(0, Math.round(input.cell.value)))
    return (
      <span className="truncate tracking-[0.08em] text-amber-500">
        {'★'.repeat(rating)}
        {'☆'.repeat(5 - rating)}
      </span>
    )
  }
  if (fieldType === 'singleSelect' || fieldType === 'multiSelect' || fieldType === 'group') {
    const values = Array.isArray(input.cell.value) ? input.cell.value : [input.cell.value]
    return (
      <span className="flex min-w-0 items-center gap-1 overflow-hidden">
        {values.map((value, index) => (
          <span
            key={`${formatBaseToken(value)}:${index}`}
            className="max-w-32 shrink-0 truncate rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
          >
            {formatBaseToken(value)}
          </span>
        ))}
      </span>
    )
  }
  if (fieldType === 'person' || fieldType === 'createdBy' || fieldType === 'updatedBy') {
    const label = input.cell.displayValue
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
          {label.trim().slice(0, 1).toUpperCase() || '·'}
        </span>
        <span className="truncate">{label}</span>
      </span>
    )
  }
  const linked = fieldType === 'link' || fieldType === 'email' || fieldType === 'phone'
  return (
    <span
      className={cn(
        'truncate',
        linked && 'text-primary underline decoration-primary/30 underline-offset-2'
      )}
    >
      {input.cell.displayValue}
    </span>
  )
}

function getBaseFieldType(field: BaseDiffField, side: 'left' | 'right'): string {
  const current = field[side] ?? field[side === 'left' ? 'right' : 'left']
  return typeof current?.type === 'string' ? current.type : 'text'
}

function fieldTypeGlyph(fieldType: string): string {
  if (fieldType === 'number' || fieldType === 'currency' || fieldType === 'numbering') return '#'
  if (fieldType === 'date' || fieldType === 'createdAt' || fieldType === 'updatedAt') return '▦'
  if (fieldType === 'checkbox') return '✓'
  if (fieldType === 'rating') return '★'
  if (fieldType === 'progress') return '%'
  if (fieldType === 'link' || fieldType === 'recordLink') return '↗'
  if (fieldType === 'email') return '@'
  if (fieldType === 'person' || fieldType === 'createdBy' || fieldType === 'updatedBy') return '●'
  if (fieldType === 'singleSelect' || fieldType === 'multiSelect' || fieldType === 'group')
    return '◆'
  if (fieldType === 'attachment') return '▣'
  return 'T'
}

function formatBaseToken(value: unknown): string {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const label = record.name ?? record.label ?? record.title
    if (typeof label === 'string') return label
  }
  return String(value ?? '')
}

function BaseDiffSidebar(input: {
  readonly fidelity: 'history' | 'snapshot'
  readonly items: readonly UnitStructuralDiffItem[]
  readonly selectedItemId: string | undefined
  readonly tables: readonly BaseTableDiff[]
  readonly onSelect: (item: UnitStructuralDiffItem) => void
}): ReactElement {
  const messages = useUnitComparisonViewerMessages()
  const sidebarRef = useEnsureSelectedDiffVisible<HTMLElement>(input.selectedItemId)
  return (
    <aside
      className="min-h-0 overflow-auto border-r bg-card p-3 max-[1023px]:hidden"
      ref={sidebarRef}
    >
      <div className="mb-3 flex items-center justify-between border-b border-border pb-3 text-xs font-semibold">
        <div className="grid gap-0.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {messages.changes}
          </span>
          <span className="text-[13px] text-foreground">{messages.rawTableData}</span>
        </div>
        <Badge>{input.items.length}</Badge>
      </div>
      <p className="mb-3 mt-0 text-[10px] leading-4 text-muted-foreground">
        {messages.baseAlignmentHint}
      </p>
      {input.fidelity === 'snapshot' ? (
        <div className="mb-2 rounded-md border border-warning/35 bg-warning-muted p-2 text-[11px] leading-4 text-warning">
          {messages.comparingMaterializedSnapshots}
        </div>
      ) : null}
      <div className="space-y-1.5">
        {input.items.map((item) => (
          <button
            key={item.id}
            aria-pressed={input.selectedItemId === item.id}
            data-diff-sidebar-selected={input.selectedItemId === item.id ? 'true' : undefined}
            className={cn(
              'block w-full rounded-lg border px-2.5 py-2 text-left text-[11px] leading-4 outline-none transition-[border-color,background,box-shadow,transform] hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-ring',
              toneClass(item.kind),
              input.selectedItemId === item.id &&
                'ring-2 ring-ring ring-offset-1 ring-offset-background'
            )}
            type="button"
            onClick={() => input.onSelect(item)}
          >
            <div className="truncate font-medium">
              {structuralDiffItemLabel(item, itemDisplayLabel(item, input.tables), messages)}
            </div>
            <div className="truncate opacity-70">
              {messages.entity(item.category)} · {messages.kind[item.kind]}
            </div>
          </button>
        ))}
      </div>
    </aside>
  )
}

function sideStatus(
  left: Record<string, unknown> | null,
  right: Record<string, unknown> | null,
  commonStatus: UnitStructuralDiffKind | null,
  side: 'left' | 'right'
): UnitStructuralDiffKind | null {
  if (left === null || right === null) return side === 'left' ? 'delete' : 'insert'
  return commonStatus
}

function toneClass(status: UnitStructuralDiffKind | null, emphasized = false): string {
  if (emphasized && status === 'delete') {
    return 'border-diff-delete/80 bg-diff-delete/30 text-diff-delete ring-2 ring-inset ring-diff-delete/70'
  }
  if (emphasized && status === 'insert') {
    return 'border-diff-insert/80 bg-diff-insert/30 text-diff-insert ring-2 ring-inset ring-diff-insert/70'
  }
  if (emphasized && status === 'update') {
    return 'border-diff-update/80 bg-diff-update/30 text-diff-update ring-2 ring-inset ring-diff-update/70'
  }
  if (status === 'delete') return 'border-diff-delete/40 bg-diff-delete-muted/80 text-diff-delete'
  if (status === 'insert') return 'border-diff-insert/40 bg-diff-insert-muted/80 text-diff-insert'
  if (status === 'update') return 'border-diff-update/40 bg-diff-update-muted/75 text-diff-update'
  return ''
}

function isVisibleBaseDiffItem(
  item: UnitStructuralDiffItem,
  tables: readonly BaseTableDiff[]
): boolean {
  if (item.category.startsWith('view:')) return false
  if (!item.category.startsWith('field:')) return true
  const table = tables.find((candidate) => candidate.id === baseTableIdOfDiffItem(item))
  return table === undefined || table.fields.some((field) => field.id === item.stableId)
}

function itemDisplayLabel(item: UnitStructuralDiffItem, tables: readonly BaseTableDiff[]): string {
  const table = tables.find((candidate) => candidate.id === baseTableIdOfDiffItem(item))
  if (table === undefined) return item.label
  if (item.category.startsWith('field:')) {
    return table.fields.find((field) => field.id === item.stableId)?.label ?? item.label
  }
  if (item.category.startsWith('record:')) {
    return table.records.find((record) => record.id === item.stableId)?.label ?? item.label
  }
  return table.label
}
