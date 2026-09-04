import { UNIT_TYPE_BOARD, UNIT_TYPE_SLIDE } from '../unit-types.js'
import {
  filterSlidePageDiffItems,
  slidePageIdOfDiffItem,
  type UnitStructuralDiffItem
} from '../shared/structural-diff.js'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactElement,
  type ReactNode
} from 'react'
import { Badge } from '../ui/badge.js'
import { Spinner } from '../ui/spinner.js'
import { structuralDiffItemsFromContext } from '../comparison-presentation'
import { structuralDiffFocusTarget } from './comparison-focus'
import { useUnitComparisonViewerMessages } from '../i18n/messages.js'
import { cn } from '../ui/cn.js'
import { ComparisonPageTabs, type ComparisonPageTabOption } from '../shared/scope-tabs'
import { shouldClearDiffSidebarSelection } from '../shared/sidebar-selection'
import {
  structuralDiffItemEntityLabel,
  structuralDiffItemLabel
} from '../shared/structural-diff-item-label'
import { useEnsureSelectedDiffVisible } from '../shared/use-ensure-selected-diff-visible'
import type { NativeComparisonViewerValue, UnitComparisonUniverFactory } from '../comparison-types'
import { createComparisonPane, type ComparisonPaneHandle } from './comparison-pane'

const EMPTY_PARAGRAPH_ALIGNMENT = [] as const

export function NativeComparisonView(input: {
  readonly comparison: NativeComparisonViewerValue
  readonly createUniver: UnitComparisonUniverFactory
  readonly darkMode: boolean
  readonly leftHeaderControl?: ReactNode
  readonly locale: Parameters<UnitComparisonUniverFactory>[0]['locale']
}): ReactElement {
  const messages = useUnitComparisonViewerMessages()
  const { comparison } = input
  const { result } = comparison
  const unitType = result.unit.type
  const leftRef = useRef<HTMLDivElement | null>(null)
  const rightRef = useRef<HTMLDivElement | null>(null)
  const leftHandleRef = useRef<ComparisonPaneHandle | null>(null)
  const rightHandleRef = useRef<ComparisonPaneHandle | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>(undefined)
  const [activePageId, setActivePageId] = useState<string | null>(null)
  const selectedItemIdRef = useRef<string | undefined>(selectedItemId)
  const selectedPageIdRef = useRef<string | null>(activePageId)
  const [nativePanesReady, setNativePanesReady] = useState(unitType !== UNIT_TYPE_BOARD)
  const [renderError, setRenderError] = useState<string | null>(null)
  const items = useMemo(() => structuralDiffItemsFromContext(result), [result])
  const pageTabs = useMemo(
    () =>
      unitType === UNIT_TYPE_SLIDE
        ? (result.scopes ?? [])
            .filter((scope) => scope.entityType === 'slide')
            .map((scope) => ({
              id: scope.stableId,
              label: scope.displayName,
              status: scope.kind
            }))
        : [],
    [result.scopes, unitType]
  )
  const selectedPageId =
    activePageId !== null && pageTabs.some((page) => page.id === activePageId)
      ? activePageId
      : (pageTabs[0]?.id ?? null)
  const scopedItems = useMemo(
    () =>
      unitType === UNIT_TYPE_SLIDE && selectedPageId !== null
        ? filterSlidePageDiffItems(items, selectedPageId)
        : items,
    [items, selectedPageId, unitType]
  )
  const selectedItem = scopedItems.find((item) => item.id === selectedItemId)
  const firstSlideId = pageTabs[0]?.id
  const paragraphAlignment =
    result.productContext.kind === 'doc'
      ? result.productContext.paragraphAlignment.rows
      : EMPTY_PARAGRAPH_ALIGNMENT
  useEffect(() => {
    selectedItemIdRef.current = selectedItemId
    selectedPageIdRef.current = selectedPageId
  }, [selectedItemId, selectedPageId])

  useEffect(() => {
    if (selectedItemId !== undefined && !scopedItems.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(undefined)
    }
  }, [scopedItems, selectedItemId])

  useEffect(() => {
    if (activePageId === null && selectedPageId !== null) setActivePageId(selectedPageId)
  }, [activePageId, selectedPageId])

  useEffect(() => {
    const handles = new Set<ComparisonPaneHandle>()
    let disposeLinkedBoardViewport = (): void => undefined
    let disposed = false
    let failed = false
    const mountSelectedItemId = selectedItemIdRef.current
    const mountSlideId = selectedPageIdRef.current ?? firstSlideId
    setNativePanesReady(unitType !== UNIT_TYPE_BOARD)
    setRenderError(null)

    const mount = async (
      target: HTMLDivElement | null,
      unitData: typeof comparison.left.unitData,
      peerUnitData: typeof comparison.right.unitData,
      handleRef: MutableRefObject<ComparisonPaneHandle | null>,
      side: 'left' | 'right'
    ): Promise<void> => {
      if (target === null || unitData === null) return
      const handle = await createComparisonPane({
        container: target,
        createUniver: input.createUniver,
        unitType,
        unitData,
        ...(peerUnitData === null ? {} : { peerUnitData }),
        side,
        items: scopedItems,
        paragraphAlignment,
        ...(mountSelectedItemId === undefined ? {} : { selectedItemId: mountSelectedItemId }),
        ...(unitType === UNIT_TYPE_SLIDE &&
        mountSlideId !== undefined &&
        slidePagePresent(unitData, mountSlideId)
          ? { initialSlideId: mountSlideId }
          : {}),
        locale: input.locale,
        darkMode: input.darkMode
      })
      if (disposed || failed) {
        handle.dispose()
        return
      }
      handleRef.current = handle
      handles.add(handle)
    }

    void nextTask()
      .then(async () => {
        if (disposed) return
        await Promise.all([
          mount(
            leftRef.current,
            comparison.left.unitData,
            comparison.right.unitData,
            leftHandleRef,
            'left'
          ),
          mount(
            rightRef.current,
            comparison.right.unitData,
            comparison.left.unitData,
            rightHandleRef,
            'right'
          )
        ])
      })
      .then(async () => {
        if (disposed) return
        if (unitType === UNIT_TYPE_BOARD) {
          await waitForNativeCanvases(
            [
              comparison.left.unitData === null ? null : leftRef.current,
              comparison.right.unitData === null ? null : rightRef.current
            ],
            () => disposed
          )
        }
        if (disposed) return
        disposeLinkedBoardViewport = attachLinkedBoardViewport(
          leftRef.current,
          rightRef.current,
          leftHandleRef.current,
          rightHandleRef.current
        )
        const currentSelectedItemId = selectedItemIdRef.current
        const currentSlideId = selectedPageIdRef.current ?? firstSlideId
        await Promise.all([
          leftHandleRef.current?.setComparisonSelection(currentSelectedItemId),
          rightHandleRef.current?.setComparisonSelection(currentSelectedItemId)
        ])
        const initialItem =
          scopedItems.find((item) => item.id === currentSelectedItemId) ??
          (unitType === UNIT_TYPE_BOARD
            ? undefined
            : currentSlideId === undefined
              ? scopedItems[0]
              : (scopedItems.find((item) => item.entityType === 'slide-element') ??
                scopedItems.find((item) => item.entityType === 'slide')))
        if (initialItem !== undefined) {
          await Promise.all([
            leftHandleRef.current?.focusComparisonTarget(
              structuralDiffFocusTarget(initialItem, 'left')
            ),
            rightHandleRef.current?.focusComparisonTarget(
              structuralDiffFocusTarget(initialItem, 'right')
            )
          ])
        }
        if (!disposed) setNativePanesReady(true)
      })
      .catch((error: unknown) => {
        if (disposed) return
        failed = true
        disposeLinkedNavigation()
        disposeLinkedBoardViewport()
        for (const handle of handles) setTimeout(() => handle.dispose(), 0)
        handles.clear()
        leftHandleRef.current = null
        rightHandleRef.current = null
        setRenderError(error instanceof Error ? error.message : String(error))
      })

    const disposeLinkedNavigation =
      unitType === UNIT_TYPE_BOARD
        ? () => undefined
        : attachLinkedWheelNavigation(leftRef.current, rightRef.current)
    return () => {
      disposed = true
      disposeLinkedNavigation()
      disposeLinkedBoardViewport()
      for (const handle of handles) setTimeout(() => handle.dispose(), 0)
      handles.clear()
      leftHandleRef.current = null
      rightHandleRef.current = null
    }
  }, [
    comparison.left.unitData,
    comparison.right.unitData,
    firstSlideId,
    input.createUniver,
    input.darkMode,
    input.locale,
    paragraphAlignment,
    scopedItems,
    unitType
  ])

  useEffect(() => {
    void Promise.all([
      leftHandleRef.current?.setComparisonSelection(selectedItemId),
      rightHandleRef.current?.setComparisonSelection(selectedItemId)
    ])
  }, [selectedItemId])

  const focusItem = useCallback((item: UnitStructuralDiffItem): void => {
    setSelectedItemId(item.id)
    const pageId = slidePageIdOfDiffItem(item)
    if (pageId !== null) setActivePageId(pageId)
    void Promise.all([
      leftHandleRef.current?.setComparisonSelection(item.id),
      rightHandleRef.current?.setComparisonSelection(item.id)
    ]).then(() =>
      Promise.all([
        leftHandleRef.current?.focusComparisonTarget(structuralDiffFocusTarget(item, 'left')),
        rightHandleRef.current?.focusComparisonTarget(structuralDiffFocusTarget(item, 'right'))
      ])
    )
  }, [])

  const clearFocusedItem = useCallback((): void => {
    setSelectedItemId(undefined)
  }, [])

  const bindLeftHost = useCallback((node: HTMLDivElement | null): void => {
    leftRef.current = node
  }, [])
  const bindRightHost = useCallback((node: HTMLDivElement | null): void => {
    rightRef.current = node
  }, [])

  const focusPage = useCallback(
    (pageId: string): void => {
      setActivePageId(pageId)
      const pageItems = filterSlidePageDiffItems(items, pageId)
      const pageItem =
        pageItems.find((item) => item.entityType === 'slide-element') ??
        pageItems.find((item) => item.entityType === 'slide')
      setSelectedItemId(pageItem?.id)
      void Promise.all([
        leftHandleRef.current?.setComparisonSelection(pageItem?.id),
        rightHandleRef.current?.setComparisonSelection(pageItem?.id)
      ]).then(() =>
        Promise.all([
          leftHandleRef.current?.focusComparisonTarget({ category: 'slide', stableId: pageId }),
          rightHandleRef.current?.focusComparisonTarget({ category: 'slide', stableId: pageId })
        ])
      )
    },
    [items]
  )

  if (renderError !== null) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-8 text-sm text-destructive">
        {messages.renderFailed}: {renderError}
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-2">
      <div className="grid h-full min-h-[420px] grid-cols-[240px_minmax(720px,1fr)] overflow-hidden rounded-xl border border-border bg-border shadow-[0_12px_32px_rgb(15_23_42/0.08),0_1px_2px_rgb(15_23_42/0.06)] max-[1023px]:grid-cols-1 max-[1023px]:grid-rows-1">
        <NativeDiffSidebar
          items={scopedItems}
          fidelity={result.fidelity}
          selectedItemId={selectedItem?.id}
          onClear={clearFocusedItem}
          onSelect={focusItem}
        />
        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)] bg-card">
          <div
            className="grid min-h-0 grid-cols-2 gap-px bg-border max-[1023px]:h-full max-[1023px]:grid-cols-1 max-[1023px]:grid-rows-2"
            data-testid="native-diff-panes"
          >
            <NativeDiffSide
              activePageId={selectedPageId}
              contentReady={nativePanesReady}
              bindHost={bindLeftHost}
              hideSlideAddControl={unitType === UNIT_TYPE_SLIDE}
              itemCount={scopedItems.length}
              label={comparisonSideLabel(comparison.left, messages.revision)}
              leftHeaderControl={input.leftHeaderControl}
              pagePresent={slidePagePresent(comparison.left.unitData, selectedPageId)}
              pageTabs={pageTabs}
              side="left"
              unitPresent={comparison.left.unitData !== null}
              onSelectPage={focusPage}
            />
            <NativeDiffSide
              activePageId={selectedPageId}
              contentReady={nativePanesReady}
              bindHost={bindRightHost}
              hideSlideAddControl={unitType === UNIT_TYPE_SLIDE}
              itemCount={scopedItems.length}
              label={comparisonSideLabel(comparison.right, messages.revision)}
              pagePresent={slidePagePresent(comparison.right.unitData, selectedPageId)}
              pageTabs={pageTabs}
              side="right"
              unitPresent={comparison.right.unitData !== null}
              onSelectPage={focusPage}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

async function waitForNativeCanvases(
  roots: readonly (HTMLDivElement | null)[],
  cancelled: () => boolean
): Promise<void> {
  const expectedRoots = roots.filter((root): root is HTMLDivElement => root !== null)
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (cancelled()) return
    if (expectedRoots.every((root) => root.querySelector('canvas') !== null)) {
      await nextFrame()
      return
    }
    await nextFrame()
  }
}

function attachLinkedBoardViewport(
  leftRoot: HTMLDivElement | null,
  rightRoot: HTMLDivElement | null,
  left: ComparisonPaneHandle | null,
  right: ComparisonPaneHandle | null
): () => void {
  if (leftRoot === null || rightRoot === null || left === null || right === null) {
    return () => undefined
  }
  let syncing = false
  const initial = left.getBoardViewport()
  if (initial === null || right.getBoardViewport() === null) return () => undefined
  let disposed = false
  const copy = (source: ComparisonPaneHandle, target: ComparisonPaneHandle): void => {
    if (disposed || syncing) return
    const viewport = source.getBoardViewport()
    if (viewport === null) return
    syncing = true
    try {
      target.setBoardViewport(viewport)
    } finally {
      syncing = false
    }
  }
  const scheduleCopy = (source: ComparisonPaneHandle, target: ComparisonPaneHandle): void => {
    requestAnimationFrame(() => copy(source, target))
  }
  scheduleCopy(left, right)
  const relay = (source: ComparisonPaneHandle, target: ComparisonPaneHandle): (() => void) =>
    source.subscribeBoardViewport((viewport) => {
      if (syncing) return
      syncing = true
      try {
        target.setBoardViewport(viewport)
      } finally {
        syncing = false
      }
    })
  const attachInteraction = (
    root: HTMLDivElement,
    source: ComparisonPaneHandle,
    target: ComparisonPaneHandle
  ): (() => void) => {
    const listener = (): void => scheduleCopy(source, target)
    root.addEventListener('click', listener, true)
    root.addEventListener('pointerup', listener, true)
    root.addEventListener('wheel', listener, true)
    return () => {
      root.removeEventListener('click', listener, true)
      root.removeEventListener('pointerup', listener, true)
      root.removeEventListener('wheel', listener, true)
    }
  }
  const disposeLeft = relay(left, right)
  const disposeRight = relay(right, left)
  const disposeLeftInteraction = attachInteraction(leftRoot, left, right)
  const disposeRightInteraction = attachInteraction(rightRoot, right, left)
  return () => {
    disposed = true
    disposeLeft()
    disposeRight()
    disposeLeftInteraction()
    disposeRightInteraction()
  }
}

function NativeDiffSidebar(input: {
  readonly fidelity: 'history' | 'snapshot'
  readonly items: readonly UnitStructuralDiffItem[]
  readonly onClear: () => void
  readonly onSelect: (item: UnitStructuralDiffItem) => void
  readonly selectedItemId: string | undefined
}): ReactElement {
  const messages = useUnitComparisonViewerMessages()
  const sidebarRef = useEnsureSelectedDiffVisible<HTMLElement>(input.selectedItemId)
  const onClear = input.onClear
  useEffect(() => {
    const sidebar = sidebarRef.current
    if (sidebar === null) return
    const clearBlankSelection = (event: MouseEvent): void => {
      if (shouldClearDiffSidebarSelection(event.target)) onClear()
    }
    sidebar.addEventListener('click', clearBlankSelection)
    return () => sidebar.removeEventListener('click', clearBlankSelection)
  }, [onClear, sidebarRef])
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
          <span className="text-[13px] text-foreground">{messages.structuralDiff}</span>
        </div>
        <Badge>{input.items.length}</Badge>
      </div>
      {input.fidelity === 'snapshot' && (
        <div className="mb-2 rounded-md border border-warning/35 bg-warning-muted p-2 text-[11px] leading-4 text-warning">
          {messages.snapshot}
        </div>
      )}
      {input.items.length === 0 ? (
        <div className="px-1 py-3 text-xs text-muted-foreground">
          {messages.noStructuralChanges}
        </div>
      ) : (
        <div className="space-y-1.5">
          {input.items.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={input.selectedItemId === item.id}
              data-diff-sidebar-selected={input.selectedItemId === item.id ? 'true' : undefined}
              onClick={() => input.onSelect(item)}
              className={cn(
                'block w-full rounded-lg border px-2.5 py-2 text-left text-[11px] leading-4 outline-none transition-[border-color,background,box-shadow,transform] hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-ring',
                item.kind === 'insert'
                  ? 'border-diff-insert/35 bg-diff-insert-muted text-diff-insert'
                  : item.kind === 'delete'
                    ? 'border-diff-delete/35 bg-diff-delete-muted text-diff-delete'
                    : 'border-diff-update/35 bg-diff-update-muted text-diff-update',
                input.selectedItemId === item.id &&
                  'ring-2 ring-ring ring-offset-1 ring-offset-background'
              )}
              title={structuralDiffItemLabel(item, item.label, messages)}
            >
              <div className="truncate font-medium">
                {structuralDiffItemLabel(item, item.label, messages)}
              </div>
              <div className="truncate opacity-70">
                {structuralDiffItemEntityLabel(item, messages)} · {messages.kind[item.kind]}
                {item.changes.length > 0 ? ` · ${messages.changeCount(item.changes.length)}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </aside>
  )
}

export function attachLinkedWheelNavigation(
  left: HTMLDivElement | null,
  right: HTMLDivElement | null
): () => void {
  if (left === null || right === null) return () => undefined
  const linkedEvents = new WeakSet<Event>()
  const attach = (source: HTMLElement, target: HTMLElement): (() => void) => {
    const listener = (event: WheelEvent): void => {
      if (linkedEvents.has(event)) return
      const targetNode = target.querySelector('canvas') ?? target
      const targetBounds = targetNode.getBoundingClientRect()
      const linked = new WheelEvent('wheel', {
        clientX: targetBounds.left + targetBounds.width / 2,
        clientY: targetBounds.top + targetBounds.height / 2,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaZ: event.deltaZ,
        deltaMode: event.deltaMode,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        bubbles: true,
        cancelable: true
      })
      linkedEvents.add(linked)
      targetNode.dispatchEvent(linked)
    }
    source.addEventListener('wheel', listener, { capture: true, passive: true })
    return () => source.removeEventListener('wheel', listener, { capture: true })
  }
  const disposeLeft = attach(left, right)
  const disposeRight = attach(right, left)
  return () => {
    disposeLeft()
    disposeRight()
  }
}

function NativeDiffSide(input: {
  readonly activePageId: string | null
  readonly contentReady: boolean
  readonly hideSlideAddControl: boolean
  readonly bindHost: (node: HTMLDivElement | null) => void
  readonly itemCount: number
  readonly label: string
  readonly leftHeaderControl?: ReactNode
  readonly onSelectPage: (pageId: string) => void
  readonly pagePresent: boolean
  readonly pageTabs: readonly ComparisonPageTabOption[]
  readonly side: 'left' | 'right'
  readonly unitPresent: boolean
}): ReactElement {
  const messages = useUnitComparisonViewerMessages()
  const {
    activePageId,
    bindHost,
    contentReady,
    hideSlideAddControl,
    itemCount,
    label,
    leftHeaderControl,
    onSelectPage,
    pagePresent,
    pageTabs,
    side,
    unitPresent
  } = input
  return (
    <section
      className={cn(
        'grid min-h-0 bg-background',
        pageTabs.length > 0
          ? 'grid-rows-[56px_auto_minmax(0,1fr)]'
          : 'grid-rows-[56px_minmax(0,1fr)]'
      )}
    >
      <header className="flex min-w-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
        {leftHeaderControl ?? (
          <div className="grid min-w-0 gap-0.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
              {messages.rightCurrentVersion}
            </span>
            <span className="truncate text-[12px] font-semibold text-foreground" title={label}>
              {label}
            </span>
          </div>
        )}
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-border bg-muted/55 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            {messages.readOnly}
          </span>
          <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
            {messages.changeCount(itemCount)}
          </span>
        </div>
      </header>
      {pageTabs.length > 0 ? (
        <ComparisonPageTabs
          activeId={activePageId}
          ariaLabel={`${messages.side[side]} · ${messages.changedSlides}`}
          options={pageTabs}
          onSelect={onSelectPage}
        />
      ) : null}
      {unitPresent ? (
        <div className="relative min-h-0 overflow-hidden" aria-busy={!contentReady}>
          <div
            ref={bindHost}
            className={cn(
              'absolute inset-0 transition-opacity duration-100',
              contentReady ? 'opacity-100' : 'opacity-0'
            )}
            data-native-diff-host="true"
            data-native-diff-ready={contentReady ? 'true' : 'false'}
            data-native-diff-product={hideSlideAddControl ? 'slide' : 'other'}
          />
          {!contentReady && pagePresent ? (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-background">
              <Spinner className="size-5" />
            </div>
          ) : null}
          {!pagePresent ? (
            <div
              className={cn(
                'absolute inset-0 z-20 grid place-items-center px-6 text-center text-sm font-medium backdrop-blur-sm',
                side === 'left'
                  ? 'bg-diff-delete-muted/95 text-diff-delete'
                  : 'bg-diff-insert-muted/95 text-diff-insert'
              )}
            >
              {messages.notPresent}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid place-items-center bg-diff-delete-muted/40 text-sm text-diff-delete">
          {messages.notPresent}
        </div>
      )}
    </section>
  )
}

function comparisonSideLabel(
  side: { readonly label: string; readonly revision?: number },
  revisionLabel: (revision: number) => string
): string {
  return side.revision === undefined
    ? side.label
    : `${side.label} · ${revisionLabel(side.revision)}`
}

function slidePagePresent(unitData: unknown, pageId: string | null): boolean {
  if (pageId === null) return true
  if (typeof unitData !== 'object' || unitData === null || Array.isArray(unitData)) return false
  const slides = (unitData as Record<string, unknown>).slides
  return typeof slides === 'object' && slides !== null && !Array.isArray(slides) && pageId in slides
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
