import { FUniver } from '@univerjs/core/facade'
import '@univerjs-pro/collaboration-client/facade'
import '@univer/render-preset/facades'

import {
  IAuthzIoService,
  ICommandService,
  LocaleService,
  IPermissionService,
  IUniverInstanceService,
  IUndoRedoService,
  ThemeService,
  type LocaleType,
  Univer,
  UniverInstanceType
} from '@univerjs/core'
import { SetDocZoomRatioOperation } from '@univerjs/docs-ui'
import type { IBoardData } from '@univerjs-pro/boards'
import { SetSlideZoomRatioOperation, type ISlidePageSize } from '@univerjs-pro/slides'
import type {
  IBaseSnapshot,
  ICellData,
  IObjectMatrixPrimitiveType,
  IWorkbookData,
  ITableSnapshot
} from '@univerjs/core'
import type { IDeserializedSheetBlock, ISheetBlock, ISnapshot } from '@univerjs/protocol'
import {
  transformSnapshotToDocumentData,
  transformSnapshotToSlideData,
  transformSnapshotToWorkbookData,
  UniverCollaborationPlugin
} from '@univerjs-pro/collaboration'
import { UniverCollaborationClientPlugin } from '@univerjs-pro/collaboration-client'
import { UniverCollaborationEmbedPlugin } from '@univerjs-pro/collaboration-embed'
import { UniverBasesHistoryUIPlugin } from '@univerjs-pro/bases-history-ui'
import { UniverBoardsHistoryUIPlugin } from '@univerjs-pro/boards-history-ui'
import { UniverDocsHistoryUIPlugin } from '@univerjs-pro/docs-history-ui'
import { UniverSheetsHistoryUIPlugin } from '@univerjs-pro/sheets-history-ui'
import { UniverSlidesHistoryUIPlugin } from '@univerjs-pro/slides-history-ui'
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin
} from '@univerjs-pro/collaboration-client-ui'
import {
  EmbedModelService,
  EmbedReferencedUnitMaterializeService,
  IReferencedUnitManagerService
} from '@univerjs-pro/embed'
import {
  FormulaCalculationSessionService,
  SetTriggerFormulaCalculationStartMutation
} from '@univerjs/engine-formula'
import { TEST_LICENSE, ViewAssetIoOwner, registerViewRendering } from '@univer/render-preset'
import {
  buildRuntimeConfig,
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SHEET,
  UNIT_TYPE_SLIDE,
  type UnitType
} from '@univer/collab-gateway-contract'
import {
  blockLocalEditingCommands,
  enforceSheetViewerReadOnlyPermissions,
  resolveViewerReadOnlyEnforcement,
  resolveViewerWorkbenchChrome
} from './viewer-readonly'
import { createCollaborationSheetResourceRefDataProvider } from './collaboration-sheet-resource-ref-data-provider'
import { installHistoryShapeFormulaCompatibility } from './history-shape-formula-compatibility'
import { loadViewerLocale } from './locales/generated/load'
import { initializeDocumentViewPosition } from './document-view-position'

installHistoryShapeFormulaCompatibility()

export interface ViewerOptions {
  /** DOM id of the (already-empty) element UniverUIPlugin mounts into. */
  container: string
  origin: string
  univerfile: string
  gatewayFileKey?: string
  /** Given = view that worktree; omitted = view the current version (trunk). */
  worktreeId?: string
  unitId: string
  unitType: UnitType
  /** Allow the user to edit this unit (generate changesets). Default false = read-only viewer. */
  editable?: boolean
  /** Which language the Univer UI initially renders in. */
  locale: LocaleType
  /** Initial Univer appearance. Later changes use ViewerHandle.setDarkMode without rebuilding. */
  darkMode: boolean
}

export interface ViewerHandle {
  setDarkMode(isDarkMode: boolean): void
  setLocale(locale: LocaleType): Promise<void>
  dispose(): void
}

type ViewerDebugAPI = ReturnType<typeof FUniver.newAPI>

declare global {
  interface Window {
    univer?: Univer
    univerAPI?: ViewerDebugAPI
  }
}

/**
 * Mount a Univer instance that views one unit (sheet, doc, or slide) of trunk or a worktree, live via the
 * official collaboration-client (comb). Read-only by default; pass `editable: true` (trunk only,
 * gated by the caller) to let the user edit and submit changesets via comb. Switching context
 * (trunk<->worktree) or handling a `reset` is done by the caller disposing this and creating a fresh one.
 */
export async function createViewer(opts: ViewerOptions): Promise<ViewerHandle> {
  const editable = opts.editable === true
  const localePack = await loadViewerLocale(opts.locale)
  const readOnlyEnforcement = resolveViewerReadOnlyEnforcement(opts.unitType, editable)
  const urls = buildRuntimeConfig(
    opts.gatewayFileKey === undefined
      ? {
          origin: opts.origin,
          univerfile: opts.univerfile,
          ...(opts.worktreeId === undefined ? {} : { worktreeId: opts.worktreeId })
        }
      : {
          origin: opts.origin,
          gatewayFileKey: opts.gatewayFileKey,
          ...(opts.worktreeId === undefined ? {} : { worktreeId: opts.worktreeId })
        }
  )

  const univer = new Univer({
    locale: opts.locale,
    locales: { [opts.locale]: localePack },
    darkMode: opts.darkMode,
    // collaboration-client registers its own authz IO + (collaborative) undo/redo services;
    // null the core ones to avoid a redi "registered more than once" conflict.
    override: [
      [IAuthzIoService, null],
      [IUndoRedoService, null]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any
  })

  const sheetResourceRefDataProvider = createCollaborationSheetResourceRefDataProvider(() => {
    const injector = univer.__getInjector()
    return {
      referencedUnitManager: injector.get(IReferencedUnitManagerService),
      univerInstanceService: injector.get(IUniverInstanceService),
      commandService: injector.get(ICommandService),
      waitForFormulaResultApplied: () =>
        injector.get(FormulaCalculationSessionService).waitForLatestApplied(),
      executeFormulaCalculation: () => {
        void injector
          .get(ICommandService)
          .executeCommand(
            SetTriggerFormulaCalculationStartMutation.id,
            { commands: [], forceCalculation: true },
            { onlyLocal: true }
          )
      }
    }
  })

  registerViewRendering(univer, {
    container: opts.container,
    assetIoOwner: ViewAssetIoOwner.CollaborationClient,
    license: TEST_LICENSE,
    workbenchChrome: resolveViewerWorkbenchChrome(opts.unitType, editable),
    ribbonType: 'grid',
    unitType: toUniverInstanceType(opts.unitType),
    ...(opts.worktreeId === undefined && opts.unitType !== UNIT_TYPE_BOARD
      ? {
          exchangeClientConfig: {
            uploadFileServerUrl: urls.uploadFileServerUrl,
            getTaskServerUrl: urls.getTaskServerUrl,
            signUrlServerUrl: urls.signUrlServerUrl,
            importServerUrl: urls.importServerUrl,
            exportServerUrl: urls.exportServerUrl,
            downloadEndpointUrl: urls.downloadEndpointUrl
          }
        }
      : {}),
    resourceRefDataProviderRegistrations: [sheetResourceRefDataProvider.registration],
    // Collaboration must start before Embed core, whose command service consumes collaborative
    // undo/redo. Collaboration Embed itself depends on Embed core and belongs before Embed UI.
    registerBeforeEmbedCore: () => {
      univer.registerPlugin(UniverCollaborationPlugin)
      univer.registerPlugin(UniverCollaborationClientPlugin, {
        socketService: BrowserCollaborationSocketService,
        enableOfflineEditing: false,
        enableAuthServer: true,
        enableSingleActiveInstanceLock: false,
        loginUrlKey: '/login',
        sendChangesetTimeout: 200,
        ...urls
      })
      univer.registerPlugin(
        UniverCollaborationClientUIPlugin,
        opts.unitType === UNIT_TYPE_BASE ? { enableDocumentCollaborationUI: false } : undefined
      )
      if (opts.worktreeId === undefined) {
        const historyConfig = {
          historyServerUrl: urls.historyListServerUrl,
          univerContainerId: opts.container
        }
        if (opts.unitType === UNIT_TYPE_DOC) {
          univer.registerPlugin(UniverDocsHistoryUIPlugin, historyConfig)
        } else if (opts.unitType === UNIT_TYPE_SLIDE) {
          univer.registerPlugin(UniverSlidesHistoryUIPlugin, historyConfig)
        } else if (opts.unitType === UNIT_TYPE_BASE) {
          univer.registerPlugin(UniverBasesHistoryUIPlugin, historyConfig)
        } else if (opts.unitType === UNIT_TYPE_BOARD) {
          univer.registerPlugin(UniverBoardsHistoryUIPlugin, historyConfig)
        } else if (opts.unitType === UNIT_TYPE_SHEET) {
          univer.registerPlugin(UniverSheetsHistoryUIPlugin, historyConfig)
        }
      }
    },
    registerAfterEmbedCore: () => {
      univer.registerPlugin(UniverCollaborationEmbedPlugin)
    }
  })

  let api: ViewerDebugAPI
  try {
    api = FUniver.newAPI(univer)
  } catch (error) {
    console.error('[viewer] Failed to initialize facade', error)
    throw error
  }
  const collaboration = api.getCollaboration()
  const formulaResultAppliedSubscription = univer
    .__getInjector()
    .get(FormulaCalculationSessionService)
    .resultApplied$.subscribe((result) => {
      void sheetResourceRefDataProvider.formulaResultApplied(result)
    })

  if (opts.unitType === UNIT_TYPE_DOC) {
    await collaboration.loadDocAsync(opts.unitId)
  } else if (opts.unitType === UNIT_TYPE_SLIDE) {
    await collaboration.loadSlideAsync(opts.unitId)
  } else if (opts.unitType === UNIT_TYPE_BASE) {
    await collaboration.loadBaseAsync(opts.unitId)
  } else if (opts.unitType === UNIT_TYPE_BOARD) {
    await collaboration.loadBoardAsync(opts.unitId)
  } else if (opts.unitType === UNIT_TYPE_SHEET) {
    await collaboration.loadSheetAsync(opts.unitId)
  } else {
    throw new Error(`Unsupported viewer unit type: ${String(opts.unitType)}`)
  }

  const documentViewPosition =
    opts.unitType === UNIT_TYPE_DOC
      ? initializeDocumentViewPosition(univer, opts.unitId)
      : undefined
  await materializeHostEmbedChildren(univer, opts.unitId)
  const disposeDebugEndpoint = exposeDebugEndpoint(univer, api)

  if (readOnlyEnforcement === 'sheet-permission') {
    enforceSheetViewerReadOnlyPermissions(
      univer.__getInjector().get(IPermissionService),
      opts.unitId
    )
  } else if (readOnlyEnforcement === 'mutation-gate') {
    blockLocalEditingCommands(univer.__getInjector().get(ICommandService))
  }

  return {
    setDarkMode: (isDarkMode) => api.toggleDarkMode(isDarkMode),
    setLocale: async (locale) => {
      const pack = await loadViewerLocale(locale)
      api.loadLocales(locale, pack)
      api.setLocale(locale)
    },
    dispose: () => {
      documentViewPosition?.dispose()
      formulaResultAppliedSubscription.unsubscribe()
      sheetResourceRefDataProvider.dispose()
      disposeDebugEndpoint()
      api.dispose()
      univer.dispose()
    }
  }
}

async function materializeHostEmbedChildren(univer: Univer, hostUnitId: string): Promise<void> {
  const injector = univer.__getInjector()
  const embedModel = injector.get(EmbedModelService)
  const materializer = injector.get(EmbedReferencedUnitMaterializeService)
  const descriptors = [...embedModel.getActiveDescriptors(hostUnitId)]
  for (const descriptor of descriptors) {
    await materializer.materializeDescriptor({ descriptor })
  }
}

export interface PreviewViewerOptions {
  /** DOM id of the (already-empty) element UniverUIPlugin mounts into. */
  container: string
  unitType: UnitType
  /** Wire ISnapshot (base64 `originalMeta`) from the gateway merge-preview endpoint. */
  snapshot: unknown
  /** Deserialized sheet/base blocks; fed to the collaboration snapshot transformers. */
  sheetBlocks?: unknown[]
  /** Protocol changesets ({ mutations: { id, data }[] }) to replay on top of the snapshot. */
  changesets: unknown[]
  /** Which language the Univer UI renders in; see {@link ViewerOptions.locale}. */
  locale: LocaleType
  /** Initial Univer appearance. Later changes use ViewerHandle.setDarkMode without rebuilding. */
  darkMode: boolean
}

/**
 * Mount a read-only Univer that renders a worktree's merge preview for one unit, with NO
 * collaboration / network / socket plugins. The gateway computed the merged result as
 * snapshot + changesets (the same data a fresh client would load after the merge actually lands);
 * here we rebuild engine data from the snapshot (sheet also needs its sheet blocks), replay the
 * changesets' mutations locally, then lock editing. Disposable and non-collaborative: it never
 * opens comb and never writes back. Switching unit/worktree is done by disposing and recreating.
 */
export async function createPreviewViewer(opts: PreviewViewerOptions): Promise<ViewerHandle> {
  const localePack = await loadViewerLocale(opts.locale)
  const univer = new Univer({
    locale: opts.locale,
    locales: { [opts.locale]: localePack },
    darkMode: opts.darkMode
  })

  registerViewRendering(univer, {
    container: opts.container,
    assetIoOwner: ViewAssetIoOwner.Local,
    license: TEST_LICENSE,
    // Merge previews are inspection surfaces. The surrounding preview shell owns navigation,
    // labels and actions, so mounting an editor ribbon is both redundant and a
    // misleading affordance even though mutation commands are vetoed below.
    workbenchChrome: 'hidden',
    unitType: toUniverInstanceType(opts.unitType)
  })

  const snapshot = decodeSnapshotFromWire(opts.snapshot) as ISnapshot
  let unitId = ''
  let docPageWidth: number | undefined
  let slidePageSize: ISlidePageSize | undefined
  if (opts.unitType === UNIT_TYPE_DOC) {
    const data = transformSnapshotToDocumentData(snapshot)
    unitId = data.id ?? ''
    docPageWidth = data.documentStyle.pageSize?.width
    univer.createUnit(UniverInstanceType.UNIVER_DOC, data)
  } else if (opts.unitType === UNIT_TYPE_SLIDE) {
    const data = transformSnapshotToSlideData(snapshot)
    // An editor snapshot may persist a zoom chosen for a full-window workbench. Preview panes can
    // be narrower, so let Slides UI calculate its fit-to-pane zoom after mounting.
    delete data.zoomRatio
    slidePageSize = data.defaultPageSize
    unitId = data.id ?? ''
    univer.createUnit(UniverInstanceType.UNIVER_SLIDE, data)
  } else if (opts.unitType === UNIT_TYPE_BASE) {
    const data = decodeBaseSnapshotData(
      snapshot,
      (opts.sheetBlocks ?? []) as Array<IDeserializedSheetBlock | ISheetBlock>
    )
    unitId = data.id ?? ''
    univer.createUnit(UniverInstanceType.UNIVER_BASE, data)
  } else if (opts.unitType === UNIT_TYPE_BOARD) {
    const data = decodeBoardSnapshotData(snapshot)
    unitId = data.id
    univer.createUnit(UniverInstanceType.UNIVER_BOARD, data)
  } else if (opts.unitType === UNIT_TYPE_SHEET) {
    const data = await transformSnapshotToWorkbookData(
      snapshot,
      (opts.sheetBlocks ?? []) as Parameters<typeof transformSnapshotToWorkbookData>[1]
    )
    unitId = data.id ?? ''
    univer.createUnit(UniverInstanceType.UNIVER_SHEET, data)
  } else {
    throw new Error(`Unsupported preview unit type: ${String(opts.unitType)}`)
  }

  // Replay the merged changesets' mutations onto the freshly-built model — no undo, local only.
  const commandService = univer.__getInjector().get(ICommandService)
  for (const cs of opts.changesets as Array<{ mutations?: Array<{ id: string; data: string }> }>) {
    for (const m of cs.mutations ?? []) {
      const params = (typeof m.data === 'string' ? JSON.parse(m.data) : m.data) as object
      commandService.syncExecuteCommand(m.id, params, { onlyLocal: true })
    }
  }

  if (opts.unitType === UNIT_TYPE_SLIDE && slidePageSize !== undefined) {
    await fitSlidePreviewToPane(commandService, opts.container, unitId, slidePageSize)
  }
  if (opts.unitType === UNIT_TYPE_DOC) {
    await fitDocPreviewToPane(commandService, opts.container, unitId, docPageWidth ?? 816)
  }

  // Preview has no collaboration/authz controller, so its product-independent mutation gate is
  // the sole read-only enforcement and must cover every Unit type, including Sheet.
  blockLocalEditingCommands(univer.__getInjector().get(ICommandService))

  return {
    setDarkMode: (isDarkMode) => univer.__getInjector().get(ThemeService).setDarkMode(isDarkMode),
    setLocale: async (locale) => {
      const pack = await loadViewerLocale(locale)
      const localeService = univer.__getInjector().get(LocaleService)
      localeService.load({ [locale]: pack })
      localeService.setLocale(locale)
    },
    dispose: () => {
      univer.dispose()
    }
  }
}

async function fitDocPreviewToPane(
  commandService: ICommandService,
  containerId: string,
  unitId: string,
  pageWidth: number
): Promise<void> {
  const canvas = await waitForElementSize(containerId, 'canvas')
  if (canvas === null || pageWidth <= 0) return
  const gutter = 20
  const zoomRatio = Math.min(1, Math.max(1, canvas.clientWidth - gutter * 2) / pageWidth)
  await commandService.executeCommand(
    SetDocZoomRatioOperation.id,
    { unitId, zoomRatio },
    { onlyLocal: true }
  )
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

async function fitSlidePreviewToPane(
  commandService: ICommandService,
  containerId: string,
  unitId: string,
  pageSize: ISlidePageSize
): Promise<void> {
  const host = await waitForElementSize(containerId, "[data-slide-canvas-host='true']")
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
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

async function waitForElementSize(
  containerId: string,
  selector: string
): Promise<HTMLElement | null> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const container = document.getElementById(containerId)
    const element = container?.querySelector<HTMLElement>(selector)
    if (
      element !== undefined &&
      element !== null &&
      element.clientWidth > 0 &&
      element.clientHeight > 0
    ) {
      return element
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
  return null
}

function exposeDebugEndpoint(univer: Univer, univerAPI: ViewerDebugAPI): () => void {
  window.univer = univer
  window.univerAPI = univerAPI
  return () => {
    if (window.univer === univer) {
      delete window.univer
    }
    if (window.univerAPI === univerAPI) {
      delete window.univerAPI
    }
  }
}

/**
 * Reverse of the gateway's `encodeSnapshotForWire`: decode the base64 `originalMeta` byte fields
 * (doc / slide / workbook + each sheet) back to `Uint8Array`, which is what the snapshot transforms
 * expect. Leaves everything else untouched.
 */
function decodeSnapshotFromWire(snapshot: unknown): unknown {
  if (!snapshot || typeof snapshot !== 'object') {
    return snapshot
  }
  const dec = (meta: unknown): unknown => (typeof meta === 'string' ? base64ToBytes(meta) : meta)
  const s = snapshot as {
    doc?: { originalMeta?: unknown }
    slide?: { originalMeta?: unknown }
    board?: { originalMeta?: unknown }
    workbook?: { originalMeta?: unknown; sheets?: Record<string, { originalMeta?: unknown }> }
  }
  const out = { ...(snapshot as Record<string, unknown>) }
  if (s.doc) {
    out.doc = { ...s.doc, originalMeta: dec(s.doc.originalMeta) }
  }
  if (s.slide) {
    out.slide = { ...s.slide, originalMeta: dec(s.slide.originalMeta) }
  }
  if (s.board) {
    out.board = { ...s.board, originalMeta: dec(s.board.originalMeta) }
  }
  if (s.workbook) {
    const sheets: Record<string, unknown> = {}
    for (const [id, sheet] of Object.entries(s.workbook.sheets ?? {})) {
      sheets[id] = { ...sheet, originalMeta: dec(sheet.originalMeta) }
    }
    out.workbook = { ...s.workbook, originalMeta: dec(s.workbook.originalMeta), sheets }
  }
  return out
}

/** Decode one fully materialized Sheet comparison side into the comparison component's input. */
export async function decodeComparisonWorkbookData(
  snapshot: unknown,
  sheetBlocks: readonly unknown[] = []
): Promise<IWorkbookData> {
  return transformSnapshotToWorkbookData(
    decodeSnapshotFromWire(snapshot) as ISnapshot,
    sheetBlocks as Parameters<typeof transformSnapshotToWorkbookData>[1]
  )
}

/** Decode any fully materialized comparison side into its native Unit model data. */
export async function decodeComparisonUnitData(
  unitType: UnitType,
  snapshot: unknown,
  sheetBlocks: readonly unknown[] = []
): Promise<unknown> {
  const decoded = decodeSnapshotFromWire(snapshot) as ISnapshot
  if (unitType === UNIT_TYPE_DOC) return transformSnapshotToDocumentData(decoded)
  if (unitType === UNIT_TYPE_SLIDE) return transformSnapshotToSlideData(decoded)
  if (unitType === UNIT_TYPE_BASE) {
    return decodeBaseSnapshotData(
      decoded,
      sheetBlocks as Array<IDeserializedSheetBlock | ISheetBlock>
    )
  }
  if (unitType === UNIT_TYPE_BOARD) return decodeBoardSnapshotData(decoded)
  if (unitType === UNIT_TYPE_SHEET) {
    return decodeComparisonWorkbookData(snapshot, sheetBlocks)
  }
  throw new Error(`Unsupported comparison unit type: ${String(unitType)}`)
}

function decodeBoardSnapshotData(snapshot: ISnapshot): IBoardData {
  const meta = snapshot.board
  if (meta === undefined) {
    throw new Error('decodeBoardSnapshotData: missing board meta')
  }
  return {
    ...decodeJsonData(meta.originalMeta),
    id: snapshot.unitID || meta.unitID,
    rev: snapshot.rev || meta.rev,
    name: meta.name,
    resources: meta.resources
  } as unknown as IBoardData
}

function decodeBaseSnapshotData(
  snapshot: ISnapshot,
  blocks: readonly (IDeserializedSheetBlock | ISheetBlock)[]
): IBaseSnapshot {
  const meta = snapshot.workbook
  if (meta === undefined) {
    throw new Error('decodeBaseSnapshotData: missing workbook-shaped base meta')
  }

  const blockById = new Map<string, IDeserializedSheetBlock | ISheetBlock>()
  for (const block of blocks) {
    blockById.set(block.id, block)
  }

  const tables: Record<string, ITableSnapshot> = {}
  for (const [tableId, tableMeta] of Object.entries(meta.sheets)) {
    const cellData: IObjectMatrixPrimitiveType<ICellData> = {}
    for (const blockId of meta.blockMeta?.[tableId]?.blocks ?? []) {
      const block = blockById.get(blockId)
      if (block === undefined) {
        throw new Error(`decodeBaseSnapshotData: missing base block ${blockId}`)
      }
      Object.assign(cellData, decodeJsonData(block.data))
    }
    tables[tableId] = {
      id: tableMeta.id,
      name: tableMeta.name,
      ...decodeJsonData(tableMeta.originalMeta),
      cellData
    } as unknown as ITableSnapshot
  }

  return {
    id: snapshot.unitID || meta.unitID,
    name: meta.name,
    schemaVersion: 1,
    tableOrder: meta.sheetOrder,
    tables,
    createdAt: 0,
    updatedAt: 0,
    ...decodeJsonData(meta.originalMeta),
    rev: snapshot.rev || meta.rev
  } as unknown as IBaseSnapshot
}

function decodeJsonData(data: unknown): Record<string, unknown> {
  if (data === undefined || data === null || data === '') {
    return {}
  }
  if (typeof data === 'string') {
    return JSON.parse(new TextDecoder().decode(base64ToBytes(data))) as Record<string, unknown>
  }
  if (data instanceof Uint8Array) {
    return JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>
  }
  return data as Record<string, unknown>
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i)
  }
  return bytes
}

function toUniverInstanceType(unitType: UnitType): UniverInstanceType {
  switch (unitType) {
    case UNIT_TYPE_DOC:
      return UniverInstanceType.UNIVER_DOC
    case UNIT_TYPE_SHEET:
      return UniverInstanceType.UNIVER_SHEET
    case UNIT_TYPE_SLIDE:
      return UniverInstanceType.UNIVER_SLIDE
    case UNIT_TYPE_BASE:
      return UniverInstanceType.UNIVER_BASE
    case UNIT_TYPE_BOARD:
      return UniverInstanceType.UNIVER_BOARD
  }
}
