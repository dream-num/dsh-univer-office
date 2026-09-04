import { FUniver } from '@univerjs/core/facade'
import {
  ICommandService,
  IUniverInstanceService,
  Tools,
  UniverInstanceType,
  type DocumentDataModel,
  type IBaseSnapshot,
  type IDocumentData,
  type IWorkbookData,
  type LocaleType
} from '@univerjs/core'
import {
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SHEET,
  UNIT_TYPE_SLIDE,
  type UnitType
} from '../unit-types.js'
import type { IBoardData } from '@univerjs-pro/boards'
import { IBoardUIStateService } from '@univerjs-pro/boards-ui'
import {
  SetSlideZoomRatioOperation,
  type ISlideData,
  type ISlidePageSize
} from '@univerjs-pro/slides'
import { ISlideDrawingStateService } from '@univerjs-pro/slides-ui'
import { SetDocZoomRatioOperation } from '@univerjs/docs-ui'
import type { UnitStructuralDiffItem } from '../shared/structural-diff.js'
import type { UnitComparisonUniverFactory } from '../comparison-types'
import {
  decorateDocumentComparisonSide,
  type ComparisonSide,
  type DocumentComparisonInput
} from './document-decoration'
import { createNativeComparisonHighlightController } from './native-highlights'
import { focusPreviewComparisonTarget, type PreviewFocusTarget } from './comparison-focus'

type ComparisonUnitData = IWorkbookData | IDocumentData | ISlideData | IBaseSnapshot | IBoardData

export interface ICreateComparisonPaneOptions {
  readonly container: HTMLElement
  readonly createUniver: UnitComparisonUniverFactory
  readonly unitType: UnitType
  readonly unitData: ComparisonUnitData
  readonly peerUnitData?: ComparisonUnitData
  readonly side: ComparisonSide
  readonly items: readonly UnitStructuralDiffItem[]
  readonly paragraphAlignment: DocumentComparisonInput['alignment']
  readonly selectedItemId?: string
  readonly initialSlideId?: string
  readonly locale: LocaleType
  readonly darkMode: boolean
}

export interface ComparisonPaneHandle {
  setComparisonSelection(itemId: string | undefined): Promise<void>
  focusComparisonTarget(target: PreviewFocusTarget): Promise<boolean>
  getBoardViewport(): BoardComparisonViewport | null
  setBoardViewport(viewport: BoardComparisonViewport): void
  subscribeBoardViewport(listener: (viewport: BoardComparisonViewport) => void): () => void
  dispose(): void
}

export interface BoardComparisonViewport {
  readonly zoomRatio: number
  readonly panOffset: { readonly x: number; readonly y: number }
}

export async function createComparisonPane(
  options: ICreateComparisonPaneOptions
): Promise<ComparisonPaneHandle> {
  const runtime = await options.createUniver({
    container: options.container,
    unitType: options.unitType,
    locale: options.locale,
    darkMode: options.darkMode
  })
  const { univer } = runtime
  let api: ReturnType<typeof FUniver.newAPI> | undefined
  let comparisonHighlights: ReturnType<typeof createNativeComparisonHighlightController> | undefined

  try {
    let unitId = ''
    let docPageWidth: number | undefined
    let slidePageSize: ISlidePageSize | undefined
    let updateDocumentComparisonSelection:
      | ((itemId: string | undefined) => Promise<void>)
      | undefined

    if (options.unitType === UNIT_TYPE_DOC) {
      const source = options.unitData as IDocumentData
      const peer = options.peerUnitData as IDocumentData | undefined
      const decorate = (selectedItemId: string | undefined): IDocumentData =>
        peer === undefined
          ? Tools.deepClone(source)
          : decorateDocumentComparisonSide(source, peer, options.side, {
              items: options.items,
              alignment: options.paragraphAlignment,
              ...(selectedItemId === undefined ? {} : { selectedItemId })
            })
      const data = decorate(options.selectedItemId)
      unitId = data.id ?? ''
      docPageWidth = data.documentStyle.pageSize?.width
      univer.createUnit(UniverInstanceType.UNIVER_DOC, data)
      const documentModel = univer
        .__getInjector()
        .get(IUniverInstanceService)
        .getUnit<DocumentDataModel>(unitId, UniverInstanceType.UNIVER_DOC)
      updateDocumentComparisonSelection = async (itemId) => {
        documentModel?.reset(decorate(itemId))
        await nextFrame()
      }
    } else if (options.unitType === UNIT_TYPE_SLIDE) {
      const data = Tools.deepClone(options.unitData as ISlideData)
      if (options.initialSlideId !== undefined) data.activeSlideId = options.initialSlideId
      delete data.zoomRatio
      slidePageSize = data.defaultPageSize
      unitId = data.id ?? ''
      univer.createUnit(UniverInstanceType.UNIVER_SLIDE, data)
    } else if (options.unitType === UNIT_TYPE_BASE) {
      const data = Tools.deepClone(options.unitData as IBaseSnapshot)
      unitId = data.id ?? ''
      univer.createUnit(UniverInstanceType.UNIVER_BASE, data)
    } else if (options.unitType === UNIT_TYPE_BOARD) {
      const data = Tools.deepClone(options.unitData as IBoardData)
      unitId = data.id
      univer.createUnit(UniverInstanceType.UNIVER_BOARD, data)
    } else if (options.unitType === UNIT_TYPE_SHEET) {
      const data = Tools.deepClone(options.unitData as IWorkbookData)
      unitId = data.id ?? ''
      univer.createUnit(UniverInstanceType.UNIVER_SHEET, data)
    } else {
      throw new Error(`Unsupported comparison unit type: ${String(options.unitType)}`)
    }

    const commandService = univer.__getInjector().get(ICommandService)
    if (options.unitType === UNIT_TYPE_SLIDE && slidePageSize !== undefined) {
      await fitSlideToPane(commandService, options.container, unitId, slidePageSize)
    }
    if (options.unitType === UNIT_TYPE_DOC) {
      await fitDocToPane(commandService, options.container, unitId, docPageWidth ?? 816)
    }

    api = FUniver.newAPI(univer)
    comparisonHighlights = createNativeComparisonHighlightController({
      univer,
      unitId,
      unitType: options.unitType,
      side: options.side,
      items: options.items,
      ...(options.selectedItemId === undefined ? {} : { selectedItemId: options.selectedItemId })
    })
    void comparisonHighlights.refresh()

    const slideDrawingStateService =
      options.unitType === UNIT_TYPE_SLIDE
        ? univer.__getInjector().get(ISlideDrawingStateService)
        : undefined
    const boardUIStateService =
      options.unitType === UNIT_TYPE_BOARD
        ? univer.__getInjector().get(IBoardUIStateService)
        : undefined
    let disposed = false

    return {
      setComparisonSelection: async (itemId) => {
        await updateDocumentComparisonSelection?.(itemId)
        await comparisonHighlights?.setSelectedItem(itemId)
      },
      focusComparisonTarget: async (target) => {
        const focused = await focusPreviewComparisonTarget(
          api!,
          options.unitType,
          options.container.id,
          target,
          {
            selectSlideElement: (slideId, elementId) =>
              slideDrawingStateService?.selectDrawings(
                { unitId, subUnitId: slideId },
                [elementId],
                elementId
              )
          }
        )
        if (focused) await comparisonHighlights?.refresh()
        return focused
      },
      getBoardViewport: () => {
        if (boardUIStateService === undefined) return null
        const state = boardUIStateService.getState()
        return {
          zoomRatio: state.zoomRatio,
          panOffset: { ...state.viewportPanOffset }
        }
      },
      setBoardViewport: (viewport) => {
        boardUIStateService?.setViewportTransform({
          zoomRatio: viewport.zoomRatio,
          panOffset: { ...viewport.panOffset }
        })
      },
      subscribeBoardViewport: (listener) => {
        if (boardUIStateService === undefined) return () => undefined
        const subscription = boardUIStateService.state$.subscribe((state) => {
          listener({
            zoomRatio: state.zoomRatio,
            panOffset: { ...state.viewportPanOffset }
          })
        })
        return () => subscription.unsubscribe()
      },
      dispose: () => {
        if (disposed) return
        disposed = true
        comparisonHighlights?.dispose()
        api?.dispose()
        runtime.dispose()
      }
    }
  } catch (error) {
    comparisonHighlights?.dispose()
    api?.dispose()
    runtime.dispose()
    throw error
  }
}

async function fitDocToPane(
  commandService: ICommandService,
  container: HTMLElement,
  unitId: string,
  pageWidth: number
): Promise<void> {
  const canvas = await waitForElementSize(container, 'canvas')
  if (canvas === null || pageWidth <= 0) return
  const gutter = 20
  const zoomRatio = Math.min(1, Math.max(1, canvas.clientWidth - gutter * 2) / pageWidth)
  await commandService.executeCommand(
    SetDocZoomRatioOperation.id,
    { unitId, zoomRatio },
    { onlyLocal: true }
  )
  await nextFrame()
}

async function fitSlideToPane(
  commandService: ICommandService,
  container: HTMLElement,
  unitId: string,
  pageSize: ISlidePageSize
): Promise<void> {
  const host = await waitForElementSize(container, "[data-slide-canvas-host='true']")
  if (host === null || pageSize.width <= 0 || pageSize.height <= 0) return
  const gutter = 24
  const zoomRatio = Math.min(
    1,
    Math.max(1, host.clientWidth - gutter * 2) / pageSize.width,
    Math.max(1, host.clientHeight - gutter * 2) / pageSize.height
  )
  await commandService.executeCommand(
    SetSlideZoomRatioOperation.id,
    { unitId, zoomRatio },
    { onlyLocal: true }
  )
  await nextFrame()
}

async function waitForElementSize(
  container: HTMLElement,
  selector: string
): Promise<HTMLElement | null> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const element = container.querySelector<HTMLElement>(selector)
    if (element !== null && element.clientWidth > 0 && element.clientHeight > 0) return element
    await nextFrame()
  }
  return null
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}
