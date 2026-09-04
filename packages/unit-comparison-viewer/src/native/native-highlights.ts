import type { Univer } from '@univerjs/core'
import { getBoardElementRenderObjectKey } from '@univerjs-pro/boards-ui'
import { buildDrawingOKey } from '@univerjs-pro/slides-ui'
import { getDrawingShapeKeyByDrawingSearch } from '@univerjs/drawing'
import { VIEWPORT_KEY as DOCS_VIEWPORT_KEY } from '@univerjs/docs-ui'
import {
  IRenderManagerService,
  Rect,
  SHEET_VIEWPORT_KEY,
  type IRender,
  type Scene
} from '@univerjs/engine-render'
import {
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SHEET,
  UNIT_TYPE_SLIDE,
  type UnitType
} from '../unit-types.js'
import type { ComparisonSide, ComparisonTone } from './document-decoration'
import type { UnitStructuralDiffItem } from '../shared/structural-diff.js'

interface HighlightBounds {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
  readonly angle?: number
}

interface HighlightTarget {
  readonly id: string
  readonly tone: ComparisonTone
  readonly bounds: HighlightBounds
  readonly emphasized: boolean
  /** Geometry-only edits need a locator, not a translucent mask over unchanged content. */
  readonly outlineOnly?: boolean
}

interface OverlayBinding {
  readonly scene: Scene
  readonly shape: Rect
}

interface ObjectTargetResolution {
  readonly complete: boolean
  readonly targets: HighlightTarget[]
}

interface BaseCanvasComponent {
  getRealBound(): HighlightBounds
  getController?(): BaseCanvasController
  /** Compatibility with the currently published Bases UI; the local SDK adds getController(). */
  readonly _controller?: BaseCanvasController
}

interface BaseCanvasController {
  getHitRegions(): Array<{
    rect: { x: number; y: number; width: number; height: number }
    result: Record<string, unknown>
  }>
}

const HIGHLIGHT_LAYER = 1000
const TONE_STYLE: Record<ComparisonTone, { fill: string; stroke: string }> = {
  delete: { fill: 'rgba(220, 38, 38, 0.28)', stroke: 'rgba(185, 28, 28, 0.95)' },
  insert: { fill: 'rgba(22, 163, 74, 0.28)', stroke: 'rgba(21, 128, 61, 0.95)' },
  update: { fill: 'rgba(37, 99, 235, 0.24)', stroke: 'rgba(29, 78, 216, 0.95)' }
}
const EMPHASIZED_TONE_STYLE: Record<ComparisonTone, { fill: string; stroke: string }> = {
  delete: { fill: 'rgba(220, 38, 38, 0.46)', stroke: 'rgba(153, 27, 27, 1)' },
  insert: { fill: 'rgba(22, 163, 74, 0.46)', stroke: 'rgba(20, 83, 45, 1)' },
  update: { fill: 'rgba(37, 99, 235, 0.42)', stroke: 'rgba(30, 64, 175, 1)' }
}

export interface NativeComparisonHighlightController {
  refresh(): Promise<void>
  setSelectedItem(itemId: string | undefined): Promise<void>
  dispose(): void
}

/** Paint changed native objects, records, and fields inside the product canvas. */
export function createNativeComparisonHighlightController(input: {
  readonly univer: Univer
  readonly unitId: string
  readonly unitType: UnitType
  readonly side: ComparisonSide
  readonly items: readonly UnitStructuralDiffItem[]
  readonly selectedItemId?: string
}): NativeComparisonHighlightController {
  const renderManager = input.univer.__getInjector().get(IRenderManagerService)
  let bindings: OverlayBinding[] = []
  let generation = 0
  let observedScene: Scene | undefined
  let sceneTransformSubscription: { unsubscribe(): void } | undefined
  let scheduledRefresh: number | undefined
  let selectedItemId = input.selectedItemId

  const scheduleRefresh = (): void => {
    if (scheduledRefresh !== undefined) return
    scheduledRefresh = requestAnimationFrame(() => {
      scheduledRefresh = undefined
      void refresh()
    })
  }

  const clear = (): void => {
    for (const binding of bindings) {
      binding.scene.removeObject(binding.shape)
      binding.scene.makeDirty(true)
    }
    bindings = []
  }

  const refresh = async (): Promise<void> => {
    const ownGeneration = ++generation
    clear()
    const render = await waitForRenderUnit(
      renderManager,
      input.unitId,
      ownGeneration,
      () => generation
    )
    if (render === null || ownGeneration !== generation) return
    if (input.unitType === UNIT_TYPE_SLIDE && observedScene !== render.scene) {
      sceneTransformSubscription?.unsubscribe()
      observedScene = render.scene
      // Slides recalculate the logical page offset and rebuild drawing objects whenever zoom
      // changes. Re-read object bounds on the next frame so overlays follow that new coordinate
      // space instead of retaining their mount-time bounds.
      sceneTransformSubscription = render.scene.onTransformChange$.subscribeEvent(scheduleRefresh)
    }
    const paintTargets = (targets: readonly HighlightTarget[]): void => {
      if (ownGeneration !== generation) return
      clear()
      bindings = targets.map((target) => {
        const style = target.emphasized
          ? EMPHASIZED_TONE_STYLE[target.tone]
          : TONE_STYLE[target.tone]
        const shape = new Rect(`comparison-highlight-${input.side}-${target.id}`, {
          ...target.bounds,
          fill:
            target.outlineOnly && target.tone === 'update' && !target.emphasized
              ? 'rgba(37, 99, 235, 0.06)'
              : style.fill,
          stroke: style.stroke,
          strokeWidth: target.emphasized ? 5 : 3,
          evented: false,
          zIndex: HIGHLIGHT_LAYER
        })
        render.scene.addObject(shape, HIGHLIGHT_LAYER)
        return { scene: render.scene, shape }
      })
      const selectedTarget = targets.find((target) => target.emphasized)
      if (selectedTarget !== undefined) {
        const viewportKey =
          input.unitType === UNIT_TYPE_SHEET
            ? SHEET_VIEWPORT_KEY.VIEW_MAIN
            : input.unitType === UNIT_TYPE_DOC
              ? DOCS_VIEWPORT_KEY.VIEW_MAIN
              : undefined
        if (viewportKey !== undefined) {
          scrollTargetIntoView(render.scene, viewportKey, selectedTarget.bounds)
        }
      }
      render.scene.makeDirty(true)
    }
    if (input.unitType === UNIT_TYPE_BASE) {
      const targets = await buildBaseTargets(
        render.scene,
        render.mainComponent,
        input.items,
        input.side,
        selectedItemId
      )
      paintTargets(targets)
      return
    }
    const initial = resolveObjectTargets(
      render.scene,
      input.unitId,
      input.unitType,
      input.items,
      input.side,
      selectedItemId
    )
    paintTargets(initial.targets)
    if (!initial.complete) {
      void retryObjectTargets({
        scene: render.scene,
        unitId: input.unitId,
        unitType: input.unitType,
        items: input.items,
        side: input.side,
        selectedItemId,
        ownGeneration,
        currentGeneration: () => generation,
        initialTargetCount: initial.targets.length,
        paintTargets
      })
    }
  }

  return {
    refresh,
    setSelectedItem: async (itemId) => {
      selectedItemId = itemId
      await refresh()
    },
    dispose: () => {
      generation += 1
      if (scheduledRefresh !== undefined) cancelAnimationFrame(scheduledRefresh)
      scheduledRefresh = undefined
      sceneTransformSubscription?.unsubscribe()
      sceneTransformSubscription = undefined
      observedScene = undefined
      clear()
    }
  }
}

function resolveObjectTargets(
  scene: Scene,
  unitId: string,
  unitType: UnitType,
  items: readonly UnitStructuralDiffItem[],
  side: ComparisonSide,
  selectedItemId: string | undefined
): ObjectTargetResolution {
  const candidates = items.flatMap((item) => {
    const tone = toneForSide(item, side)
    if (tone === undefined) return []
    const objectKey = objectKeyForItem(unitId, unitType, item, side)
    return objectKey === undefined ? [] : [{ item, tone, objectKey }]
  })
  const uniqueCandidates = [
    ...candidates
      .reduce((byObjectKey, candidate) => {
        const previous = byObjectKey.get(candidate.objectKey)
        if (previous === undefined || candidate.item.id === selectedItemId) {
          byObjectKey.set(candidate.objectKey, candidate)
        }
        return byObjectKey
      }, new Map<string, (typeof candidates)[number]>())
      .values()
  ]
  const targets = uniqueCandidates.flatMap(({ item, tone, objectKey }) => {
    const object = scene.getObjectIncludeInGroup(objectKey) ?? scene.getObject(objectKey)
    const bounds = object?.getRealBound()
    if (object === null || object === undefined || bounds === undefined) return []
    return [
      {
        id: item.id,
        tone,
        bounds: { ...bounds, angle: object.angle },
        emphasized: item.id === selectedItemId,
        outlineOnly:
          item.kind === 'update' &&
          item.changes.length > 0 &&
          item.changes.every(
            (change) => change.valueType === 'geometry' || change.valueType === 'position'
          )
      }
    ]
  })
  return { complete: targets.length === uniqueCandidates.length, targets }
}

async function retryObjectTargets(input: {
  readonly scene: Scene
  readonly unitId: string
  readonly unitType: UnitType
  readonly items: readonly UnitStructuralDiffItem[]
  readonly side: ComparisonSide
  readonly selectedItemId: string | undefined
  readonly ownGeneration: number
  readonly currentGeneration: () => number
  readonly initialTargetCount: number
  readonly paintTargets: (targets: readonly HighlightTarget[]) => void
}): Promise<void> {
  let targetCount = input.initialTargetCount
  for (let attempt = 1; attempt < 120; attempt += 1) {
    await nextFrame()
    if (input.ownGeneration !== input.currentGeneration()) return
    const resolution = resolveObjectTargets(
      input.scene,
      input.unitId,
      input.unitType,
      input.items,
      input.side,
      input.selectedItemId
    )
    if (resolution.targets.length !== targetCount) {
      targetCount = resolution.targets.length
      input.paintTargets(resolution.targets)
    }
    if (resolution.complete) return
  }
}

function scrollTargetIntoView(scene: Scene, viewportKey: string, bounds: HighlightBounds): void {
  const viewport = scene.getViewport(viewportKey)
  if (viewport === undefined) return
  const viewportWidth = viewport.width ?? 0
  const viewportHeight = viewport.height ?? 0
  if (viewportWidth <= 0 || viewportHeight <= 0) return
  const visibleLeft = viewport.viewportScrollX
  const visibleTop = viewport.viewportScrollY
  const visibleRight = visibleLeft + viewportWidth
  const visibleBottom = visibleTop + viewportHeight
  if (
    bounds.left >= visibleLeft &&
    bounds.top >= visibleTop &&
    bounds.left + bounds.width <= visibleRight &&
    bounds.top + bounds.height <= visibleBottom
  ) {
    return
  }
  viewport.scrollToViewportPos({
    viewportScrollX: Math.max(0, bounds.left - viewportWidth / 2 + bounds.width / 2),
    viewportScrollY: Math.max(0, bounds.top - viewportHeight / 2 + bounds.height / 2)
  })
}

function objectKeyForItem(
  unitId: string,
  unitType: UnitType,
  item: UnitStructuralDiffItem,
  side: ComparisonSide
): string | undefined {
  const drawingId = item.nativeStableIds?.[side] ?? item.stableId
  if (
    unitType === UNIT_TYPE_SHEET &&
    (item.entityType === 'shape' || item.entityType === 'chart') &&
    item.parentStableId !== undefined
  ) {
    return getDrawingShapeKeyByDrawingSearch({
      drawingId,
      subUnitId: item.parentStableId,
      unitId
    })
  }
  if (
    unitType === UNIT_TYPE_DOC &&
    ['drawing', 'doc-chart', 'doc-shape-resource'].includes(item.entityType)
  ) {
    return getDrawingShapeKeyByDrawingSearch({ drawingId, subUnitId: unitId, unitId })
  }
  const slideId = item.category.startsWith('slide-element:')
    ? item.category.slice('slide-element:'.length)
    : item.scope?.entityType === 'slide'
      ? item.scope.stableId
      : undefined
  if (unitType === UNIT_TYPE_SLIDE && slideId !== undefined) {
    return buildDrawingOKey(unitId, slideId, drawingId)
  }
  if (
    unitType === UNIT_TYPE_BOARD &&
    (item.category.startsWith('board-element') || item.scope?.entityType === 'board-page')
  ) {
    return getBoardElementRenderObjectKey(unitId, drawingId)
  }
  return undefined
}

async function buildBaseTargets(
  scene: Scene,
  mainComponent: unknown,
  items: readonly UnitStructuralDiffItem[],
  side: ComparisonSide,
  selectedItemId: string | undefined
): Promise<HighlightTarget[]> {
  const component = await waitForBaseComponent(scene, mainComponent)
  if (component === null) return []
  const componentBounds = component.getRealBound()
  const regions = getBaseCanvasController(component).getHitRegions()
  return items.flatMap((item) => {
    const tone = toneForSide(item, side)
    if (tone === undefined) return []
    const [category, tableId] = item.category.split(':', 2)
    // Table/view hit regions are repeated across the entire native canvas. Treating them as one
    // object would recreate the forbidden whole-pane tint; their stable entries remain navigable
    // in the sidebar while cell-level fields and row-level records receive canvas highlights.
    if (category === 'table' || category === 'view') return []
    const matching = regions.filter(({ result }) => {
      const value = result
      if (tableId !== undefined && value.tableId !== tableId) return false
      if (category === 'record') return value.recordId === item.stableId
      if (category === 'field') {
        return value.fieldId === item.stableId && value.recordId === undefined
      }
      return false
    })
    if (matching.length === 0) return []
    const left = Math.min(...matching.map(({ rect }) => rect.x))
    const top = Math.min(...matching.map(({ rect }) => rect.y))
    const right = Math.max(...matching.map(({ rect }) => rect.x + rect.width))
    const bottom = Math.max(...matching.map(({ rect }) => rect.y + rect.height))
    return [
      {
        id: item.id,
        tone,
        emphasized: item.id === selectedItemId,
        bounds: {
          left: componentBounds.left + left,
          top: componentBounds.top + top,
          width: right - left,
          // A field is represented by many per-cell and resize hit regions. Its header is the
          // stable UI object; capping the overlay there avoids painting an empty full-height band.
          height: category === 'field' ? Math.min(40, bottom - top) : bottom - top
        }
      }
    ]
  })
}

function toneForSide(
  item: UnitStructuralDiffItem,
  side: ComparisonSide
): ComparisonTone | undefined {
  if (item.kind === 'update') return 'update'
  if (item.kind === 'delete' && side === 'left') return 'delete'
  if (item.kind === 'insert' && side === 'right') return 'insert'
  return undefined
}

async function waitForRenderUnit(
  renderManager: IRenderManagerService,
  unitId: string,
  generation: number,
  currentGeneration: () => number
): Promise<IRender | null> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (generation !== currentGeneration()) return null
    const render = renderManager.getRenderUnitById(unitId)
    if (render != null) return render
    await nextFrame()
  }
  return null
}

async function waitForBaseComponent(
  scene: Scene,
  mainComponent: unknown
): Promise<BaseCanvasComponent | null> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const object =
      scene.getObject('bases-ui.canvas-render-component') ??
      scene.getAllObjects().find((candidate) => isBaseCanvasComponent(candidate)) ??
      mainComponent
    if (
      isBaseCanvasComponent(object) &&
      getBaseCanvasController(object).getHitRegions().length > 0
    ) {
      return object
    }
    await nextFrame()
  }
  return null
}

function isBaseCanvasComponent(value: unknown): value is BaseCanvasComponent {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<BaseCanvasComponent>
  return (
    typeof candidate.getRealBound === 'function' &&
    (typeof candidate.getController === 'function' ||
      typeof candidate._controller?.getHitRegions === 'function')
  )
}

function getBaseCanvasController(component: BaseCanvasComponent): BaseCanvasController {
  const controller = component.getController?.() ?? component._controller
  if (controller === undefined) {
    throw new Error('Base comparison canvas controller is unavailable')
  }
  return controller
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 16))
}
