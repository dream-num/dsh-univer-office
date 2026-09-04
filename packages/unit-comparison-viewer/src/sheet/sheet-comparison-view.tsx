import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import type { IWorkbookData } from '@univerjs/core'
import type {
  IUnitComparisonResult as UnitComparisonContext,
  UnitComparisonUniverFactory
} from '../comparison-types.js'
import { BookOpen, ChevronRight, FunctionSquare, Table2 } from 'lucide-react'
import {
  isWorkbookCompareDetailVisible,
  isWorkbookCompareResourceCategory,
  workbookComparisonFromContext
} from './workbook-comparison-context.js'
import {
  buildWorkbookCompareSidebarTree,
  collectWorkbookCompareSidebarItemIds,
  createWorkbookComparePaneFxStates,
  mapScrollTargetAcrossPanes,
  mapSelectionTargetAcrossPanes,
  WorkbookCompareTitleCode,
  type WorkbookCompareCategory,
  type WorkbookCompareFxDiffPane,
  type WorkbookCompareItem,
  type WorkbookCompareMode,
  type WorkbookCompareModel,
  type WorkbookComparePaneFxState,
  type WorkbookComparePaneFxStates,
  type WorkbookComparePaneRole,
  type WorkbookCompareRangeTarget,
  type WorkbookCompareScrollTarget,
  type WorkbookCompareSheetGapConfig,
  type WorkbookCompareRangeHighlight,
  type WorkbookCompareSidebarTreeLabels,
  type WorkbookCompareSidebarTreeNode
} from './workbook-comparison-model.js'
import { cn } from '../ui/cn.js'
import {
  useUnitComparisonViewerMessages,
  type IUnitComparisonViewerMessages
} from '../i18n/messages.js'
import { ComparisonPageTabs } from '../shared/scope-tabs.js'
import { formatComparisonValue } from '../shared/comparison-value.js'
import { shouldClearDiffSidebarSelection } from '../shared/sidebar-selection.js'
import { structuralDiffItemsFromContext } from '../comparison-presentation.js'
import { WorkbookDiffFxStrip } from './workbook-fx-strip.js'
import { useEnsureSelectedDiffVisible } from '../shared/use-ensure-selected-diff-visible.js'
import {
  ReadonlyUniverWorkbookView,
  type ReadonlyWorkbookControlledScroll,
  type ReadonlyWorkbookControlledSelection,
  type ReadonlyWorkbookScrollPayload,
  type ReadonlyWorkbookSelectionPayload
} from './readonly-workbook-pane.js'

type DisplayMode = Extract<WorkbookCompareMode, 'style' | 'value'>
type SidebarTab = 'workbook' | 'worksheet'

const WORKBOOK_CATEGORIES: WorkbookCompareCategory[] = ['workbook']
const WORKSHEET_CATEGORIES: WorkbookCompareCategory[] = [
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

const EMPTY_PANE_FX_STATE: WorkbookComparePaneFxState = {
  activeCellLabel: '--',
  displayValue: '',
  formula: '',
  selectionLabel: '--'
}

const EMPTY_PANE_FX_STATES: WorkbookComparePaneFxStates = {
  base: EMPTY_PANE_FX_STATE,
  current: EMPTY_PANE_FX_STATE
}

interface WorkbookDiffViewerProps {
  readonly compare: {
    readonly leftLabel: string
    readonly leftWorkbookData: IWorkbookData | null
    readonly rightLabel: string
    readonly rightWorkbookData: IWorkbookData | null
    readonly context: UnitComparisonContext
    readonly degradedReason?: string
  }
  readonly createUniver: UnitComparisonUniverFactory
  readonly darkMode: boolean
  readonly leftSourceControl?: ReactNode
  readonly locale: Parameters<UnitComparisonUniverFactory>[0]['locale']
  readonly unitLabel: string
}

export function WorkbookDiffViewer(input: WorkbookDiffViewerProps): ReactElement {
  const messages = useUnitComparisonViewerMessages()
  if (input.compare.rightWorkbookData === null && input.compare.leftWorkbookData === null) {
    return (
      <section className="grid min-h-0 content-center gap-3 rounded-lg border border-border bg-card p-8 text-center">
        <p className="m-0 text-[11px] font-bold uppercase text-muted-foreground">
          {messages.workbookTitle}
        </p>
        <h2 className="m-0 text-xl font-semibold">{messages.invalidPayloadTitle}</h2>
        <p className="m-0 text-sm leading-normal text-muted-foreground">
          {messages.invalidPayloadBody}
        </p>
      </section>
    )
  }
  return <WorkbookDiffViewerContent {...input} />
}

function WorkbookDiffViewerContent(input: WorkbookDiffViewerProps): ReactElement {
  const messages = useUnitComparisonViewerMessages()
  const sidebarTreeLabels = useMemo(() => createSidebarTreeLabels(messages), [messages])
  const targetWorkbookData = input.compare.rightWorkbookData
  const [displayMode, setDisplayMode] = useState<DisplayMode>('value')
  const [showFormulaText, setShowFormulaText] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('worksheet')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const sidebarScrollRef = useEnsureSelectedDiffVisible<HTMLDivElement>(selectedItemId)
  const sidebarRef = useRef<HTMLElement | null>(null)
  const [selectionSync, setSelectionSync] = useState<ReadonlyWorkbookControlledSelection | null>(
    null
  )
  const [scrollSync, setScrollSync] = useState<ReadonlyWorkbookControlledScroll | null>(null)
  const [fxByPane, setFxByPane] = useState<WorkbookComparePaneFxStates>(EMPTY_PANE_FX_STATES)
  const diffModel = useMemo(
    () =>
      workbookComparisonFromContext({
        left: input.compare.leftWorkbookData,
        mode: displayMode,
        context: input.compare.context,
        right: targetWorkbookData
      }),
    [displayMode, input.compare.context, input.compare.leftWorkbookData, targetWorkbookData]
  )
  useEffect(() => {
    const sidebar = sidebarRef.current
    if (sidebar === null) return
    const clearBlankSelection = (event: MouseEvent): void => {
      if (shouldClearDiffSidebarSelection(event.target)) setSelectedItemId(null)
    }
    sidebar.addEventListener('click', clearBlankSelection)
    return () => sidebar.removeEventListener('click', clearBlankSelection)
  }, [diffModel])
  const changedSheetOptions = diffModel.sheetOptions.filter(
    (worksheet) => worksheet.status !== 'default'
  )
  const selectedSheetId = resolveSelectedWorksheetId(
    {
      preferredSheetId: diffModel.preferredSheetId,
      sheetOptions: changedSheetOptions.length > 0 ? changedSheetOptions : diffModel.sheetOptions
    },
    activeSheetId
  )
  const floatingItems = useMemo(
    () =>
      structuralDiffItemsFromContext(input.compare.context).filter(
        (item) => item.entityType === 'shape' || item.entityType === 'chart'
      ),
    [input.compare.context]
  )
  const scopedItems = useMemo(
    () =>
      filterDiffItems({
        displayMode,
        items: projectSidebarItemsForDisplayMode(diffModel.items, displayMode).map((item) =>
          localizeWorkbookCompareItem(item, messages)
        ),
        query: searchQuery,
        sheetId: sidebarTab === 'worksheet' ? selectedSheetId : null,
        tab: sidebarTab
      }),
    [diffModel.items, displayMode, messages, searchQuery, selectedSheetId, sidebarTab]
  )
  const localizedItemById = useMemo(
    () =>
      Object.fromEntries(
        projectSidebarItemsForDisplayMode(diffModel.items, displayMode)
          .map((item) => localizeWorkbookCompareItem(item, messages))
          .map((item) => [item.id, item])
      ),
    [diffModel.items, displayMode, messages]
  )
  const sidebarTree = useMemo(
    () =>
      buildWorkbookCompareSidebarTree({
        activeSheetId: selectedSheetId,
        items: scopedItems,
        labels: sidebarTreeLabels,
        model: diffModel,
        searchQuery,
        tab: sidebarTab
      }),
    [diffModel, scopedItems, searchQuery, selectedSheetId, sidebarTab, sidebarTreeLabels]
  )
  const visibleItemIds = useMemo(
    () => new Set(collectWorkbookCompareSidebarItemIds(sidebarTree)),
    [sidebarTree]
  )
  const selectedItem =
    selectedItemId !== null && visibleItemIds.has(selectedItemId)
      ? (localizedItemById[selectedItemId] ?? null)
      : null
  const changeCounts = diffModel.items.reduce(
    (counts, item) => ({ ...counts, [item.kind]: counts[item.kind] + 1 }),
    { delete: 0, insert: 0, update: 0 }
  )
  const selectedFxByPane = useMemo(
    () =>
      createWorkbookComparePaneFxStates({
        compareInfo: diffModel.compareInfo,
        item: selectedItem
      }),
    [diffModel.compareInfo, selectedItem]
  )
  const fxDiffByPane = useMemo(
    () => projectFxPanes(fxByPane, input.compare.context, selectedSheetId),
    [fxByPane, input.compare.context, selectedSheetId]
  )

  useEffect(() => {
    if (selectedItem?.sheetId !== undefined && selectedItem.sheetId !== null) {
      setActiveSheetId(selectedItem.sheetId)
    }
  }, [selectedItem?.sheetId])

  useEffect(() => {
    setFxByPane(selectedFxByPane)
  }, [selectedFxByPane])

  const handlePaneSelectionChange = (
    role: WorkbookComparePaneRole,
    payload: ReadonlyWorkbookSelectionPayload
  ): void => {
    setFxByPane((previous) => ({
      ...previous,
      [role]: toPaneFxState(payload)
    }))
    if (payload.reason !== 'user') {
      return
    }
    setActiveSheetId(payload.sheetId)
    const matchedItem = findCompareItemByCellSelection({
      model: diffModel,
      role,
      sheetId: payload.sheetId,
      startColumn: payload.startColumn,
      startRow: payload.startRow
    })
    if (matchedItem !== null) {
      setSelectedItemId(matchedItem.id)
      setSidebarTab('worksheet')
    }

    const target = mapSelectionTargetAcrossPanes({
      compareInfo: diffModel.compareInfo,
      sourceRole: role,
      target: {
        endColumn: payload.endColumn,
        endRow: payload.endRow,
        sheetId: payload.sheetId,
        startColumn: payload.startColumn,
        startRow: payload.startRow
      }
    })
    setSelectionSync(target === null ? null : toControlledSelection(target, role))
  }

  const handlePaneScrollChange = (
    role: WorkbookComparePaneRole,
    payload: ReadonlyWorkbookScrollPayload
  ): void => {
    if (payload.sheetId !== selectedSheetId) {
      return
    }
    const target = mapScrollTargetAcrossPanes({
      compareInfo: diffModel.compareInfo,
      sourceRole: role,
      target: {
        offsetX: payload.offsetX,
        offsetY: payload.offsetY,
        sheetId: payload.sheetId,
        sheetViewStartColumn: payload.sheetViewStartColumn,
        sheetViewStartRow: payload.sheetViewStartRow
      }
    })
    setScrollSync(target === null ? null : toControlledScroll(target, role))
  }

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_32px_rgb(15_23_42/0.08),0_1px_2px_rgb(15_23_42/0.06)]">
      <header className="grid min-h-16 gap-2 border-b border-border bg-[linear-gradient(180deg,var(--color-card),color-mix(in_srgb,var(--color-muted)_38%,var(--color-card)))] px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 h-9 w-1 shrink-0 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_10%,transparent)]" />
            <div className="grid min-w-0 gap-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="m-0 shrink-0 text-[10px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
                  {messages.workbookTitle}
                </p>
                <h2 className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[14px] font-semibold">
                  {input.unitLabel}
                </h2>
                <DiffSummaryPills counts={changeCounts} />
              </div>
              <p className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-tight text-muted-foreground">
                {diffModel.items.length} {messages.changes}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CompactSegmentedControl
              ariaLabel={messages.displayModeLabel}
              options={[
                { label: messages.content, value: 'value' },
                { label: messages.formatting, value: 'style' }
              ]}
              value={displayMode}
              onChange={(value) => {
                setDisplayMode(value as DisplayMode)
                setScrollSync(null)
                setSelectionSync(null)
              }}
            />
            <button
              aria-pressed={showFormulaText}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                showFormulaText
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted'
              )}
              type="button"
              onClick={() => setShowFormulaText((previous) => !previous)}
            >
              <FunctionSquare aria-hidden="true" size={15} />
              {messages.showFormulas}
            </button>
          </div>
        </div>
        {input.compare.degradedReason !== undefined || !diffModel.summary.hasChanges ? (
          <div className="rounded-md border border-warning/25 bg-warning-muted px-3 py-1.5 text-[12px] leading-tight text-warning">
            {input.compare.degradedReason ?? messages.noItems}
          </div>
        ) : null}
      </header>
      <div className="grid min-h-0 grid-cols-[268px_minmax(0,1fr)_minmax(0,1fr)] gap-px overflow-hidden bg-border max-[1023px]:grid-cols-1 max-[1023px]:grid-rows-2">
        <aside
          className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-[color-mix(in_srgb,var(--color-muted)_52%,var(--color-card))] max-[1023px]:hidden"
          ref={sidebarRef}
        >
          <header className="grid gap-2 border-b border-border px-3 py-2.5">
            <CompactSegmentedControl
              ariaLabel={messages.scopeLabel}
              fullWidth
              options={[
                { label: messages.worksheet, value: 'worksheet' },
                { label: messages.workbook, value: 'workbook' }
              ]}
              value={sidebarTab}
              onChange={(value) => setSidebarTab(value as SidebarTab)}
            />
            <input
              aria-label={messages.searchChanges}
              className="h-9 w-full rounded-lg border border-input bg-card px-3 text-[12px] text-foreground shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
              placeholder={messages.searchChanges}
              type="search"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
              }}
            />
          </header>
          <div className="min-h-0 overflow-auto px-3 py-3" ref={sidebarScrollRef}>
            {sidebarTree.length === 0 ? (
              <div className="grid content-center gap-2 rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                <span>{messages.noItems}</span>
              </div>
            ) : (
              <div className="grid gap-1">
                {sidebarTree.map((node) => (
                  <SidebarTreeNode
                    key={node.id}
                    forceOpen={searchQuery.trim().length > 0}
                    itemById={localizedItemById}
                    node={node}
                    onSelectItem={setSelectedItemId}
                    selectedItemId={selectedItemId}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>
        <DiffPane
          activeSheetId={selectedSheetId}
          createUniver={input.createUniver}
          controlledScroll={scrollSync?.sourceRole === 'base' ? null : scrollSync}
          controlledSelection={selectionSync?.sourceRole === 'base' ? null : selectionSync}
          darkMode={input.darkMode}
          floatingItems={floatingItems}
          label={input.compare.leftLabel}
          locale={input.locale}
          sourceControl={input.leftSourceControl}
          gapConfig={
            selectedSheetId === null
              ? null
              : (diffModel.compareInfo.worksheets[selectedSheetId]?.presentation.baseGaps ?? null)
          }
          fx={fxByPane.base}
          fxDiff={fxDiffByPane.base}
          pane="base"
          highlights={
            selectedSheetId === null
              ? []
              : (diffModel.compareInfo.worksheets[selectedSheetId]?.presentation
                  .baseRangeHighlights ?? [])
          }
          selectedRange={selectedItem?.selection?.base ?? selectedItem?.range ?? null}
          selectedItem={selectedItem}
          snapshot={diffModel.displayedSnapshots.base}
          showFormulaText={showFormulaText}
          sheetOptions={changedSheetOptions}
          onPaneScrollChange={(payload) => {
            handlePaneScrollChange('base', payload)
          }}
          onPaneSelectionChange={(payload) => {
            handlePaneSelectionChange('base', payload)
          }}
          onSelectSheet={setActiveSheetId}
        />
        <DiffPane
          activeSheetId={selectedSheetId}
          createUniver={input.createUniver}
          controlledScroll={scrollSync?.sourceRole === 'current' ? null : scrollSync}
          controlledSelection={selectionSync?.sourceRole === 'current' ? null : selectionSync}
          darkMode={input.darkMode}
          floatingItems={floatingItems}
          label={input.compare.rightLabel}
          locale={input.locale}
          sourceControl={undefined}
          gapConfig={
            selectedSheetId === null
              ? null
              : (diffModel.compareInfo.worksheets[selectedSheetId]?.presentation.currentGaps ??
                null)
          }
          fx={fxByPane.current}
          fxDiff={fxDiffByPane.current}
          pane="target"
          highlights={
            selectedSheetId === null
              ? []
              : (diffModel.compareInfo.worksheets[selectedSheetId]?.presentation
                  .currentRangeHighlights ?? [])
          }
          selectedRange={selectedItem?.selection?.current ?? selectedItem?.range ?? null}
          selectedItem={selectedItem}
          snapshot={diffModel.displayedSnapshots.current}
          showFormulaText={showFormulaText}
          sheetOptions={changedSheetOptions}
          onPaneScrollChange={(payload) => {
            handlePaneScrollChange('current', payload)
          }}
          onPaneSelectionChange={(payload) => {
            handlePaneSelectionChange('current', payload)
          }}
          onSelectSheet={setActiveSheetId}
        />
      </div>
    </section>
  )
}

function DiffPane(input: {
  readonly highlights: readonly WorkbookCompareRangeHighlight[]
  readonly activeSheetId: string | null
  readonly createUniver: UnitComparisonUniverFactory
  readonly controlledScroll: ReadonlyWorkbookControlledScroll | null
  readonly controlledSelection: ReadonlyWorkbookControlledSelection | null
  readonly darkMode: boolean
  readonly floatingItems: ReturnType<typeof structuralDiffItemsFromContext>
  readonly fx: WorkbookComparePaneFxState
  readonly fxDiff: WorkbookCompareFxDiffPane
  readonly gapConfig: WorkbookCompareSheetGapConfig | null
  readonly label: string
  readonly locale: Parameters<UnitComparisonUniverFactory>[0]['locale']
  readonly pane: 'base' | 'target'
  readonly selectedRange: WorkbookCompareItem['range'] | null
  readonly selectedItem: WorkbookCompareItem | null
  readonly snapshot: unknown
  readonly showFormulaText: boolean
  readonly sourceControl: ReactNode | undefined
  readonly sheetOptions: WorkbookCompareModel['sheetOptions']
  readonly onPaneScrollChange: (payload: ReadonlyWorkbookScrollPayload) => void
  readonly onPaneSelectionChange: (payload: ReadonlyWorkbookSelectionPayload) => void
  readonly onSelectSheet: (sheetId: string) => void
}): ReactElement {
  const messages = useUnitComparisonViewerMessages()
  const selectedItemText = formatSelectedItemText(input.selectedItem, input.pane)
  const hasSnapshot = input.snapshot !== null

  return (
    <section className="grid min-h-[360px] min-w-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] bg-card max-[1023px]:min-h-0">
      <header className="grid h-14 grid-cols-[minmax(124px,220px)_minmax(0,1fr)] items-center gap-3 border-b border-border bg-card px-3.5">
        {input.sourceControl ?? <DiffPaneRefLabel label={input.label} pane={input.pane} />}
        <div className="flex min-w-0 items-center justify-end gap-2">
          <span className="shrink-0 rounded-full border border-border bg-muted/55 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {messages.readOnly}
          </span>
          <p className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-right text-[12px] leading-tight text-muted-foreground">
            {selectedItemText || messages.selectItemHint}
          </p>
        </div>
      </header>
      <SheetTabStrip
        activeSheetId={input.activeSheetId}
        pane={input.pane}
        sheetOptions={input.sheetOptions}
        onSelectSheet={input.onSelectSheet}
      />
      <WorkbookDiffFxStrip
        activeCellLabel={input.fx.activeCellLabel}
        pane={input.pane}
        segments={input.fxDiff.segments}
        text={input.fxDiff.text}
      />
      <div className="min-h-0 overflow-hidden">
        {!hasSnapshot ? (
          <div className="grid h-full content-center gap-2 px-6 text-center text-sm text-muted-foreground">
            <span>{messages.snapshotUnavailable}</span>
          </div>
        ) : (
          <ReadonlyUniverWorkbookView
            activeSheetId={input.activeSheetId}
            createUniver={input.createUniver}
            darkMode={input.darkMode}
            comparison={{
              items: input.floatingItems,
              side: input.pane === 'base' ? 'left' : 'right',
              ...(input.selectedItem === null ? {} : { selectedItemId: input.selectedItem.id })
            }}
            controlledScroll={input.controlledScroll}
            controlledSelection={input.controlledSelection}
            gapConfig={input.gapConfig}
            highlights={input.highlights}
            locale={input.locale}
            onScrollChange={input.onPaneScrollChange}
            onSelectionChange={input.onPaneSelectionChange}
            selectedKind={
              input.selectedItem === null ||
              isWorkbookCompareResourceCategory(input.selectedItem.category)
                ? null
                : input.selectedItem.kind
            }
            selectedRange={input.selectedRange ?? null}
            showFormulaText={input.showFormulaText}
            snapshot={input.snapshot}
          />
        )}
      </div>
    </section>
  )
}

function SheetTabStrip(input: {
  readonly activeSheetId: string | null
  readonly pane: 'base' | 'target'
  readonly sheetOptions: WorkbookCompareModel['sheetOptions']
  readonly onSelectSheet: (sheetId: string) => void
}): ReactElement {
  const messages = useUnitComparisonViewerMessages()
  return (
    <ComparisonPageTabs
      activeId={input.activeSheetId}
      ariaLabel={`${messages.side[input.pane === 'base' ? 'left' : 'right']} · ${messages.worksheet}`}
      options={input.sheetOptions.flatMap((worksheet) =>
        worksheet.status === 'default'
          ? []
          : [{ id: worksheet.sheetId, label: worksheet.label, status: worksheet.status }]
      )}
      {...(input.pane === 'base' ? { testId: 'workbook-diff-sheet-tab' } : {})}
      onSelect={input.onSelectSheet}
    />
  )
}

function DiffPaneRefLabel(input: {
  readonly label: string
  readonly pane: 'base' | 'target'
}): ReactElement {
  const messages = useUnitComparisonViewerMessages()
  return (
    <div
      className="flex min-h-0 min-w-0 items-center justify-start gap-2 text-left"
      data-testid={`${input.pane}-diff-ref-label`}
      title={input.label}
    >
      <span
        className={cn(
          'size-2 shrink-0 rounded-full shadow-[0_0_0_3px_currentColor]',
          input.pane === 'base'
            ? 'text-diff-delete/15 bg-diff-delete'
            : 'text-diff-insert/15 bg-diff-insert'
        )}
      />
      <div className="grid min-w-0 gap-0.5">
        <span className="text-[9px] font-bold uppercase leading-none text-muted-foreground">
          {input.pane === 'base' ? messages.base : messages.current}
        </span>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold leading-[1.1] text-foreground">
          {input.label}
        </span>
      </div>
    </div>
  )
}

function CompactSegmentedControl<T extends string>(input: {
  readonly ariaLabel: string
  readonly fullWidth?: boolean
  readonly onChange: (value: T) => void
  readonly options: readonly { readonly label: string; readonly value: T }[]
  readonly value: T
}): ReactElement {
  return (
    <div
      aria-label={input.ariaLabel}
      className={cn(
        'inline-grid rounded-md border border-border bg-muted p-0.5 shadow-xs',
        input.fullWidth && 'w-full min-w-0'
      )}
      role="tablist"
    >
      <div className="flex items-center gap-1">
        {input.options.map((option) => (
          <button
            key={option.value}
            aria-selected={input.value === option.value}
            className={cn(
              'rounded-[7px] px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/25',
              input.fullWidth && 'min-w-0 flex-1 text-center',
              input.value === option.value && 'bg-card text-foreground shadow-xs'
            )}
            role="tab"
            type="button"
            onClick={() => {
              input.onChange(option.value)
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function DiffSummaryPills(input: {
  readonly counts: { readonly delete: number; readonly insert: number; readonly update: number }
}): ReactElement {
  const messages = useUnitComparisonViewerMessages()
  return (
    <div className="flex items-center gap-1" aria-label={messages.summaryLabel}>
      <span className="rounded-full border border-diff-insert/20 bg-diff-insert-muted/70 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-diff-insert">
        +{input.counts.insert}
      </span>
      <span className="rounded-full border border-diff-delete/20 bg-diff-delete-muted/70 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-diff-delete">
        −{input.counts.delete}
      </span>
      <span className="rounded-full border border-diff-update/20 bg-diff-update-muted/70 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-diff-update">
        ~{input.counts.update}
      </span>
    </div>
  )
}

function SidebarTreeNode(input: {
  readonly forceOpen: boolean
  readonly node: WorkbookCompareSidebarTreeNode
  readonly itemById: WorkbookCompareModel['itemById']
  readonly onSelectItem: (itemId: string) => void
  readonly selectedItemId: string | null
}): ReactElement {
  const messages = useUnitComparisonViewerMessages()
  const hasChildren = Array.isArray(input.node.children) && input.node.children.length > 0
  const [expanded, setExpanded] = useState(input.node.type === 'root')
  const item = input.node.itemId === null ? null : (input.itemById[input.node.itemId] ?? null)
  const semanticText =
    item?.kind === 'insert'
      ? 'text-diff-insert'
      : item?.kind === 'delete'
        ? 'text-diff-delete'
        : item?.kind === 'update'
          ? 'text-diff-update'
          : 'text-muted-foreground'

  if (!hasChildren) {
    return (
      <button
        key={input.node.id}
        data-diff-sidebar-selected={input.node.itemId === input.selectedItemId ? 'true' : undefined}
        className={cn(
          'grid w-full grid-cols-[14px_minmax(0,1fr)] gap-x-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/25',
          input.node.itemId === input.selectedItemId
            ? 'bg-accent text-foreground'
            : 'hover:bg-accent/70'
        )}
        type="button"
        onClick={() => {
          if (input.node.itemId !== null) {
            input.onSelectItem(input.node.itemId)
          }
        }}
      >
        <span
          aria-hidden="true"
          className={cn('mt-[6px] size-1.5 rounded-full bg-current', semanticText)}
        />
        <span className={cn('min-w-0 truncate text-[12px] font-medium', semanticText)}>
          {input.node.label}
        </span>
        {input.node.details.length > 0 ? (
          <span className="col-start-2 grid min-w-0 gap-0.5 text-[11px] text-muted-foreground">
            {input.node.details.slice(0, 4).map((detail, index) => (
              <span
                className="truncate"
                title={detail.semanticPath.join('.')}
                key={`${input.node.id}:${detail.label}:${index}`}
              >
                {detail.label}: {formatDetailTransition(detail, messages)}
              </span>
            ))}
          </span>
        ) : null}
      </button>
    )
  }

  const RootIcon =
    input.node.type === 'root' && input.node.id === 'root:workbook' ? BookOpen : Table2
  const containsSelectedItem =
    input.selectedItemId !== null && sidebarNodeContainsItem(input.node, input.selectedItemId)
  const open = input.forceOpen || expanded || containsSelectedItem
  return (
    <details
      className="group/tree min-w-0"
      open={open}
      onToggle={(event) => {
        if (!input.forceOpen && !containsSelectedItem) {
          setExpanded(event.currentTarget.open)
        }
      }}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-semibold text-foreground outline-none hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring/25 [&::-webkit-details-marker]:hidden',
          input.node.type === 'root' && 'mb-1 text-[13px]'
        )}
      >
        <ChevronRight
          className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/tree:rotate-90"
          aria-hidden="true"
        />
        {input.node.type === 'root' ? (
          <RootIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : null}
        <span className="min-w-0 truncate">{input.node.label}</span>
      </summary>
      {open ? (
        <div className={cn('grid gap-0.5', input.node.type === 'root' ? 'ml-5' : 'ml-4')}>
          {input.node.children?.map((child) => (
            <SidebarTreeNode
              key={child.id}
              forceOpen={input.forceOpen}
              node={child}
              itemById={input.itemById}
              onSelectItem={input.onSelectItem}
              selectedItemId={input.selectedItemId}
            />
          ))}
        </div>
      ) : null}
    </details>
  )
}

function sidebarNodeContainsItem(node: WorkbookCompareSidebarTreeNode, itemId: string): boolean {
  return (
    node.itemId === itemId ||
    (node.children?.some((child) => sidebarNodeContainsItem(child, itemId)) ?? false)
  )
}

function createSidebarTreeLabels(
  viewerMessages: IUnitComparisonViewerMessages
): WorkbookCompareSidebarTreeLabels {
  const messages = viewerMessages.sheetTree
  return {
    categories: {
      chart: messages.categories.chart,
      cell: messages.categories.cell,
      'condition-format': messages.categories.conditionFormat,
      'data-validation': messages.categories.dataValidation,
      move: messages.categories.move,
      pivot: messages.categories.pivot,
      'row-column': messages.categories.rowColumn,
      shape: messages.categories.shape,
      sparkline: messages.categories.sparkline,
      table: messages.categories.table,
      workbook: messages.categories.workbook,
      worksheet: messages.categories.worksheet
    },
    emptyText: messages.emptyText,
    noActiveSheetLabel: messages.noActiveSheet,
    noCompareDataLabel: messages.noCompareData,
    rowLabel: messages.row,
    styleGroupLabel: messages.styles,
    workbookRootLabel: messages.workbookRoot
  }
}

function filterDiffItems(input: {
  readonly displayMode: DisplayMode
  readonly items: readonly WorkbookCompareItem[]
  readonly query: string
  readonly sheetId: string | null
  readonly tab: SidebarTab
}): WorkbookCompareItem[] {
  const query = input.query.trim().toLowerCase()

  return input.items.filter((item) => {
    const matchesTab =
      input.tab === 'workbook'
        ? WORKBOOK_CATEGORIES.includes(item.category)
        : WORKSHEET_CATEGORIES.includes(item.category)
    const matchesSheet = !input.sheetId || !item.sheetId || item.sheetId === input.sheetId
    const matchesMode =
      item.mode === 'structure' ||
      item.mode === input.displayMode ||
      hasCellDetailForDisplayMode(item, input.displayMode)
    const matchesQuery =
      !query ||
      [
        item.title,
        item.subtitle,
        item.address,
        item.sheetName,
        ...item.detailLines.flatMap((line) => [line.label, line.before, line.after])
      ].some((value) => value?.toLowerCase().includes(query))

    return matchesTab && matchesSheet && matchesMode && matchesQuery
  })
}

function projectSidebarItemsForDisplayMode(
  items: readonly WorkbookCompareItem[],
  displayMode: DisplayMode
): WorkbookCompareItem[] {
  return items.flatMap((item) => {
    if (item.category !== 'cell') {
      return [item]
    }

    const detailLines = item.detailLines.filter((detail) =>
      isDetailVisibleForDisplayMode(detail, displayMode)
    )
    if (detailLines.length === 0) {
      return []
    }

    return [
      {
        ...item,
        detailLines,
        mode: displayMode
      }
    ]
  })
}

function hasCellDetailForDisplayMode(item: WorkbookCompareItem, displayMode: DisplayMode): boolean {
  return (
    item.category === 'cell' &&
    item.detailLines.some((detail) => isDetailVisibleForDisplayMode(detail, displayMode))
  )
}

function isDetailVisibleForDisplayMode(
  detail: WorkbookCompareItem['detailLines'][number],
  displayMode: DisplayMode
): boolean {
  return isWorkbookCompareDetailVisible(detail.semanticPath, displayMode)
}

function resolveSelectedWorksheetId(
  diffModel: Pick<WorkbookCompareModel, 'preferredSheetId' | 'sheetOptions'>,
  activeSheetId: string | null
): string | null {
  const worksheetIds = new Set(diffModel.sheetOptions.map((worksheet) => worksheet.sheetId))
  if (activeSheetId !== null && worksheetIds.has(activeSheetId)) {
    return activeSheetId
  }
  if (diffModel.preferredSheetId !== null && worksheetIds.has(diffModel.preferredSheetId)) {
    return diffModel.preferredSheetId
  }
  return diffModel.sheetOptions[0]?.sheetId ?? diffModel.preferredSheetId
}

function toControlledSelection(
  target: WorkbookCompareRangeTarget,
  sourceRole: WorkbookComparePaneRole
): ReadonlyWorkbookControlledSelection {
  return {
    ...target,
    key: buildProgrammaticSelectionKey(target),
    sourceRole
  }
}

function toControlledScroll(
  target: WorkbookCompareScrollTarget,
  sourceRole: WorkbookComparePaneRole
): ReadonlyWorkbookControlledScroll {
  return {
    ...target,
    key: buildProgrammaticScrollKey(target),
    sourceRole
  }
}

function buildProgrammaticSelectionKey(target: WorkbookCompareRangeTarget): string {
  return [
    target.sheetId,
    target.startRow,
    target.startColumn,
    target.endRow,
    target.endColumn,
    target.startRow,
    target.startColumn
  ].join(':')
}

function buildProgrammaticScrollKey(target: WorkbookCompareScrollTarget): string {
  return [
    target.sheetId,
    target.sheetViewStartRow,
    target.sheetViewStartColumn,
    target.offsetX,
    target.offsetY
  ].join(':')
}

function findCompareItemByCellSelection(input: {
  readonly model: WorkbookCompareModel
  readonly role: WorkbookComparePaneRole
  readonly sheetId: string
  readonly startColumn: number
  readonly startRow: number
}): WorkbookCompareItem | null {
  const sheet = input.model.compareInfo.worksheets[input.sheetId]
  if (sheet === undefined) {
    return null
  }

  if (input.role === 'current') {
    const indexed = sheet.cellItemByCurrentPosition[`${input.startRow}:${input.startColumn}`]
    if (indexed !== undefined) {
      return indexed
    }
  }

  return (
    sheet.categories.cell.find((item) =>
      isCellSelectionWithinRange({
        column: input.startColumn,
        item,
        role: input.role,
        row: input.startRow,
        sheetId: input.sheetId
      })
    ) ?? null
  )
}

function isCellSelectionWithinRange(input: {
  readonly column: number
  readonly item: WorkbookCompareItem
  readonly role: WorkbookComparePaneRole
  readonly row: number
  readonly sheetId: string
}): boolean {
  const range = input.item.selection?.[input.role] ?? input.item.range ?? null
  return (
    range !== null &&
    range.sheetId === input.sheetId &&
    input.row >= range.startRow &&
    input.row <= range.endRow &&
    input.column >= range.startColumn &&
    input.column <= range.endColumn
  )
}

function toPaneFxState(payload: ReadonlyWorkbookSelectionPayload): WorkbookComparePaneFxState {
  return {
    activeCellLabel: payload.activeCellLabel,
    displayValue: payload.displayValue,
    formula: payload.formula,
    selectionLabel: payload.selectionLabel
  }
}

function formatDetailTransition(
  detail: WorkbookCompareItem['detailLines'][number],
  messages: IUnitComparisonViewerMessages
): string {
  return `${detail.before ?? messages.sheetTree.emptyText} → ${
    detail.after ?? messages.sheetTree.emptyText
  }`
}

function localizeWorkbookCompareItem(
  item: WorkbookCompareItem,
  messages: IUnitComparisonViewerMessages
): WorkbookCompareItem {
  const title = localizeWorkbookCompareTitle(item, messages)
  return {
    ...item,
    title,
    detailLines: item.detailLines.map((detail) => ({
      ...detail,
      ...(detail.before === undefined
        ? {}
        : {
            before:
              detail.before === null
                ? null
                : formatComparisonValue(
                    detail.before,
                    ['value', 'formula'].includes(detail.semanticPath[0] ?? '')
                      ? 'text'
                      : 'unknown',
                    { entityType: item.category, path: detail.semanticPath },
                    messages
                  )
          }),
      ...(detail.after === undefined
        ? {}
        : {
            after:
              detail.after === null
                ? null
                : formatComparisonValue(
                    detail.after,
                    ['value', 'formula'].includes(detail.semanticPath[0] ?? '')
                      ? 'text'
                      : 'unknown',
                    { entityType: item.category, path: detail.semanticPath },
                    messages
                  )
          }),
      label: messages.changePath(detail.semanticPath)
    }))
  }
}

function localizeWorkbookCompareTitle(
  item: WorkbookCompareItem,
  messages: IUnitComparisonViewerMessages
): string {
  const title = messages.sheetTree.titles
  const index = Number(item.titleParameters?.index ?? 0)
  const name = String(item.titleParameters?.name ?? item.sheetName ?? '')
  switch (item.titleCode) {
    case WorkbookCompareTitleCode.ColumnsMoved:
      return title.columnsMoved
    case WorkbookCompareTitleCode.ColumnChanged:
      return title.columnChanged(index)
    case WorkbookCompareTitleCode.DeletedColumns:
      return title.deletedColumns
    case WorkbookCompareTitleCode.DeletedRows:
      return title.deletedRows
    case WorkbookCompareTitleCode.InsertedColumns:
      return title.insertedColumns
    case WorkbookCompareTitleCode.InsertedRows:
      return title.insertedRows
    case WorkbookCompareTitleCode.RowsMoved:
      return title.rowsMoved
    case WorkbookCompareTitleCode.RowChanged:
      return title.rowChanged(index)
    case WorkbookCompareTitleCode.SheetAdded:
      return title.sheetAdded(name)
    case WorkbookCompareTitleCode.SheetDeleted:
      return title.sheetDeleted(name)
    case WorkbookCompareTitleCode.SheetRenamed:
      return title.sheetRenamed
    case WorkbookCompareTitleCode.WorkbookRenamed:
      return title.workbookRenamed
    default:
      return (
        item.title ||
        (item.category === 'worksheet' ? item.sheetName : undefined) ||
        messages.entity(item.category)
      )
  }
}

function formatSelectedItemText(item: WorkbookCompareItem | null, pane: 'base' | 'target'): string {
  if (item === null) {
    return ''
  }

  const detail = item.detailLines[0] ?? null
  if (detail === null) {
    return item.title
  }

  const value = pane === 'base' ? detail.before : detail.after
  return value ? `${detail.label}: ${value}` : item.title
}

function projectFxPanes(
  states: WorkbookComparePaneFxStates,
  context: UnitComparisonContext,
  sheetId: string | null
): { base: WorkbookCompareFxDiffPane; current: WorkbookCompareFxDiffPane } {
  const source = context.items.find(
    (item) =>
      item.entityType === 'cell' &&
      item.parentStableId === sheetId &&
      (item.locations.left === null ||
        item.locations.left.stableId === states.base.activeCellLabel) &&
      (item.locations.right === null ||
        item.locations.right.stableId === states.current.activeCellLabel)
  )
  const pane = (role: 'base' | 'current'): WorkbookCompareFxDiffPane => {
    const state = states[role]
    const kind = state.formula ? 'formula' : 'value'
    const text = state.formula || state.displayValue
    const segments = source?.changes.find((change) => change.path[0] === kind)?.segments?.[
      role === 'base' ? 'left' : 'right'
    ]
    // Formatted cell display may differ from raw SDK text: don't apply offsets to a different string.
    return {
      kind,
      text,
      segments: segments?.map((segment) => segment.text).join('') === text ? segments : null
    }
  }
  return { base: pane('base'), current: pane('current') }
}
