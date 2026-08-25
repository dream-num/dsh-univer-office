import type { Context } from '@deepseek-ai/cordis'
import { createStandardApiReference, type ApiReference } from '@univer-cli/api-reference'
import type { ResolvedConfig } from '../config.ts'
import type { WorktreeActionResult } from '../../shared/wire/actions.ts'
import type { FileState, WorktreeState, ChangedUnit } from '../../shared/wire/state.ts'
import type { EnsureGatewayResult, GatewayStatus } from '../../shared/wire/status.ts'
import { GatewayClient, gatewayErrorMessage } from '../adapters/gateway/client.ts'
import { GatewayFileApi, fileKeyOf } from '../adapters/gateway/file-api.ts'
import { GatewayWorktreeApi } from '../adapters/gateway/worktree-api.ts'
import { isRecord, mapUnits, mapWorktrees, unitKind } from '../adapters/gateway/mapping.ts'
import type {
  ApiReferenceRequest,
  ExecuteUnitContentRequest,
  ExportUnitContentRequest,
  FileStateRequest,
  FileStatusRequest,
  ImportUnitContentRequest,
  InspectUnitContentRequest,
  LintUnitLayoutRequest,
  ResourceOperationRequest,
  ScreenshotServiceResult,
  ScreenshotUnitRequest,
  CompileSvgRequest,
  JsonValue,
  NewUniverFileRequest,
  UnitOperationRequest,
  UniverApiResult,
  UniverOperationResult,
  UniverResourceResult,
  WorktreeActionRequest,
  WorktreeOperationRequest,
} from '../service/types.ts'
import { UniverError } from '../service/errors.ts'
import { UniverService } from '../service/univer-service.ts'
import { assertAuthorizedPath } from '../service/workspace.ts'
import { GatewaySupervisor } from '../processes/gateway/supervisor.ts'
import { UnitContentOperations } from './unit-content-operations.ts'
import { StateCache } from './state-cache.ts'
import { WorktreeOperations } from './worktree-operations.ts'
import { RenderOperations } from './render-operations.ts'
import { RenderSourceOperations } from './render-source-operations.ts'
import { ResourceOperations } from './resource-operations.ts'

/** Local Service Provider backed by the bundled Gateway and Unit content worker. */
export class GatewayUniverService extends UniverService {
  private readonly gatewaySupervisor: GatewaySupervisor
  private readonly unitContent: UnitContentOperations
  private readonly worktrees: WorktreeOperations
  private readonly render: RenderOperations
  private readonly renderSources: RenderSourceOperations
  private readonly resourceOperations: ResourceOperations
  private readonly stateCache: StateCache<string, FileState>
  private readonly unitCache: StateCache<string, readonly ChangedUnit[]>
  private readonly api: ApiReference

  constructor(ctx: Context, private readonly config: ResolvedConfig) {
    super(ctx)
    this.gatewaySupervisor = new GatewaySupervisor(config)
    this.unitContent = new UnitContentOperations(
      config.gatewayRequestTimeoutMs,
      config.unitContentCommitTimeoutMs,
      config.unitContentOperationTimeoutMs,
    )
    this.worktrees = new WorktreeOperations(config.gatewayRequestTimeoutMs, config.gatewayMutationTimeoutMs)
    this.render = new RenderOperations()
    this.renderSources = new RenderSourceOperations(this.unitContent, config.gatewayRequestTimeoutMs)
    this.resourceOperations = new ResourceOperations(
      config.resourceCacheRoot,
      config.resourceDownloadTimeoutMs,
    )
    this.stateCache = new StateCache(config.stateCacheTtlMs)
    this.unitCache = new StateCache(config.unitCacheTtlMs)
    this.api = createStandardApiReference()
    ctx.effect(() => async () => this.dispose(), 'univer: Gateway supervisor')
  }

  /** Current Gateway status. */
  gatewayStatus(): Promise<GatewayStatus> {
    return this.gatewaySupervisor.status()
  }

  /** Ensure the bundled Gateway is available. */
  ensureGateway(): Promise<EnsureGatewayResult> {
    return this.gatewaySupervisor.ensure()
  }

  /** Return cached collaboration state for one authorized file. */
  async fileState(request: FileStateRequest): Promise<FileState> {
    await assertAuthorizedPath(request.workspace, request.file, true)
    return this.stateCache.get(request.file, () => this.computeFileState(request.file))
  }

  /** Apply a browser review decision and return the refreshed state. */
  async worktreeAction(request: WorktreeActionRequest): Promise<WorktreeActionResult> {
    await assertAuthorizedPath(request.workspace, request.file, true)
    const available = await this.ensureGateway()
    if (!available.ok) return { ok: false, reason: available.reason }
    try {
      await this.worktrees.action(available.gateway, request.file, request.worktreeId, request.action)
      this.invalidate(request.file, request.worktreeId)
      return {
        ok: true,
        action: request.action,
        worktreeId: request.worktreeId,
        state: await this.fileState({ workspace: request.workspace, file: request.file }),
      }
    } catch (error) {
      this.invalidate(request.file, request.worktreeId)
      const state = await this.fileState({ workspace: request.workspace, file: request.file }).catch(() => undefined)
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
        ...state === undefined ? {} : { state },
      }
    }
  }

  /** Create one empty Univer container without an implicit Unit. */
  async newFile(request: NewUniverFileRequest, signal?: AbortSignal): Promise<UniverOperationResult> {
    await assertAuthorizedPath(request.workspace, request.file, false)
    signal?.throwIfAborted()
    const gateway = await this.requireGateway()
    const result = await new GatewayFileApi(new GatewayClient(gateway, this.config.gatewayMutationTimeoutMs)).create(request.file)
    requireGatewaySuccess(result, 'Gateway rejected the Univer file creation.')
    signal?.throwIfAborted()
    this.stateCache.delete(request.file)
    return {
      ok: true,
      operation: 'new',
      file: request.file,
      result: { filePath: request.file, created: true },
    }
  }

  /** Return trunk and worktree identities needed before model edits. */
  async status(request: FileStatusRequest, signal?: AbortSignal): Promise<UniverOperationResult> {
    await assertAuthorizedPath(request.workspace, request.file, true)
    signal?.throwIfAborted()
    const gateway = await this.requireGateway()
    const client = new GatewayClient(gateway, this.config.gatewayRequestTimeoutMs)
    const fileApi = new GatewayFileApi(client)
    const worktreeApi = new GatewayWorktreeApi(client)
    const [trunkValue, worktreeValue] = await Promise.all([
      fileApi.listUnits(request.file),
      fileApi.listWorktrees(request.file),
    ])
    let trunkUnits = mapUnits(trunkValue)
    const worktrees = mapWorktrees(worktreeValue)
    if (request.unitId !== undefined) trunkUnits = trunkUnits.filter((unit) => unit.unitId === request.unitId)
    const selected = request.worktreeId === undefined
      ? undefined
      : worktrees.find((worktree) => worktree.worktreeId === request.worktreeId)
    if (request.worktreeId !== undefined && selected === undefined) {
      throw new UniverError(`Worktree ${request.worktreeId} was not found.`, 'WORKTREE_NOT_FOUND')
    }
    const selectedUnits = request.worktreeId === undefined
      ? undefined
      : mapUnits(await worktreeApi.listUnits(request.file, request.worktreeId))
        .filter((unit) => request.unitId === undefined || unit.unitId === request.unitId)
    signal?.throwIfAborted()
    return {
      ok: true,
      operation: 'status',
      file: request.file,
      result: {
        trunk: { units: trunkUnits.map(unitResult) },
        worktrees: worktrees.map(worktreeResult),
        ...(selected === undefined || selectedUnits === undefined
          ? {}
          : { selectedWorktree: { ...worktreeResult(selected), units: selectedUnits.map(unitResult) } }),
      },
    }
  }

  /** Create or transition one worktree. */
  async worktree(request: WorktreeOperationRequest, signal?: AbortSignal): Promise<UniverOperationResult> {
    await assertAuthorizedPath(request.workspace, request.file, true)
    signal?.throwIfAborted()
    const gateway = await this.requireGateway()
    const api = new GatewayWorktreeApi(new GatewayClient(gateway, this.config.gatewayMutationTimeoutMs))
    const result = request.action === 'create'
      ? await api.create(request.file, request.name)
      : await this.transitionWorktree(gateway, request)
    requireGatewaySuccess(result, `Gateway rejected worktree ${request.action}.`)
    signal?.throwIfAborted()
    const id = worktreeResultId(result, request)
    this.invalidate(request.file, id)
    return { ok: true, operation: 'worktree', file: request.file, result: { action: request.action, ...asRecord(result) } }
  }

  /** Create or remove one Unit inside a draft worktree. */
  async unit(request: UnitOperationRequest, signal?: AbortSignal): Promise<UniverOperationResult> {
    await assertAuthorizedPath(request.workspace, request.file, true)
    signal?.throwIfAborted()
    const gateway = await this.requireGateway()
    await this.requireWorktreeStatus(gateway, request.file, request.worktreeId, 'draft')
    const api = new GatewayWorktreeApi(new GatewayClient(gateway, this.config.gatewayMutationTimeoutMs))
    const result = request.action === 'create'
      ? await api.createUnit(request.file, request.worktreeId, request.kind, request.name)
      : await api.removeUnit(request.file, request.worktreeId, request.unitId)
    requireGatewaySuccess(result, `Gateway rejected Unit ${request.action}.`)
    signal?.throwIfAborted()
    this.invalidate(request.file, request.worktreeId)
    return { ok: true, operation: 'unit', file: request.file, result: { action: request.action, ...asRecord(result) } }
  }

  /** Inspect one explicit Unit in trunk or a worktree. */
  async inspectUnitContent(request: InspectUnitContentRequest, signal?: AbortSignal): Promise<UniverOperationResult> {
    await assertAuthorizedPath(request.workspace, request.file, true)
    const gateway = await this.requireGateway()
    return this.unitContent.inspect(gateway, request, signal)
  }

  /** Execute Facade code against one explicit Unit in a draft worktree. */
  async executeUnitContent(request: ExecuteUnitContentRequest, signal?: AbortSignal): Promise<UniverOperationResult> {
    await assertAuthorizedPath(request.workspace, request.file, true)
    const gateway = await this.requireGateway()
    await this.requireWorktreeStatus(gateway, request.file, request.worktreeId, 'draft')
    const result = await this.unitContent.execute(gateway, request.file, request.code, request.worktreeId, request.unitId, signal)
    this.invalidate(request.file, request.worktreeId)
    return result
  }

  /** Import one Office file as a new Unit in a draft worktree. */
  async importUnitContent(request: ImportUnitContentRequest, signal?: AbortSignal): Promise<UniverOperationResult> {
    await Promise.all([
      assertAuthorizedPath(request.workspace, request.file, true),
      assertAuthorizedPath(request.sourceWorkspace, request.source, true),
    ])
    const gateway = await this.requireGateway()
    await this.requireWorktreeStatus(gateway, request.file, request.worktreeId, 'draft')
    const imported = await this.unitContent.import(request.source, signal)
    const result = await new GatewayWorktreeApi(new GatewayClient(gateway, this.config.gatewayMutationTimeoutMs))
      .createUnit(request.file, request.worktreeId, imported.kind, request.name, imported.snapshot)
    requireGatewaySuccess(result, 'Gateway rejected the imported Unit.')
    signal?.throwIfAborted()
    this.invalidate(request.file, request.worktreeId)
    return {
      ok: true,
      operation: 'import',
      file: request.file,
      result: { sourcePath: request.source, ...asRecord(result) },
    }
  }

  /** Export one explicit Unit from trunk or a worktree. */
  async exportUnitContent(request: ExportUnitContentRequest, signal?: AbortSignal): Promise<UniverOperationResult> {
    await Promise.all([
      assertAuthorizedPath(request.workspace, request.file, true),
      assertAuthorizedPath(request.outputWorkspace, request.output, false),
    ])
    const gateway = await this.requireGateway()
    return this.unitContent.export(gateway, request, signal)
  }

  /** Analyze deterministic Slide layout facts without producing screenshots. */
  async lintUnitLayout(request: LintUnitLayoutRequest, signal?: AbortSignal): Promise<UniverOperationResult> {
    await assertAuthorizedPath(request.workspace, request.file, true)
    const gateway = await this.requireGateway()
    const source = await this.unitContent.renderSource(
      gateway,
      request.file,
      request.unitId,
      request.worktreeId,
      signal,
    )
    const result = await this.render.lint(source, request.pages, signal)
    return { ok: true, operation: 'lint', file: request.file, result }
  }

  /** Render one explicit Unit into workspace PNGs for model visual verification. */
  async screenshotUnit(
    request: ScreenshotUnitRequest,
    signal?: AbortSignal,
  ): Promise<ScreenshotServiceResult> {
    await Promise.all([
      assertAuthorizedPath(request.workspace, request.file, true),
      assertAuthorizedPath(request.outputWorkspace, request.output, false),
    ])
    const gateway = await this.requireGateway()
    const source = await this.renderSources.load(
      gateway,
      request.file,
      request.unitId,
      request.worktreeId,
      signal,
    )
    const result = await this.render.screenshot({
      source,
      output: request.output,
      maxPages: this.config.screenshotMaxPages,
      maxPixels: this.config.screenshotMaxPixels,
      ...(request.target === undefined ? {} : { target: request.target }),
      ...(signal === undefined ? {} : { signal }),
    })
    await Promise.all(result.images.map(async (image) => {
      await assertAuthorizedPath(request.outputWorkspace, image.path, true)
    }))
    return { ok: true, operation: 'screenshot', file: request.file, result }
  }

  /** Compile one SVG and commit the generated Slide mutations to a draft worktree. */
  async compileSvg(request: CompileSvgRequest, signal?: AbortSignal): Promise<UniverOperationResult> {
    await Promise.all([
      assertAuthorizedPath(request.workspace, request.file, true),
      assertAuthorizedPath(request.sourceWorkspace, request.source, true),
    ])
    if (!Number.isSafeInteger(request.page) || request.page < 1) {
      throw new UniverError('SVG target page must be a positive integer.', 'INVALID_REQUEST')
    }
    const gateway = await this.requireGateway()
    await this.requireWorktreeStatus(gateway, request.file, request.worktreeId, 'draft')
    const compiled = await this.render.compileSvg({
      source: request.source,
      workspace: request.sourceWorkspace,
      page: request.page,
      ...(request.mode === undefined ? {} : { mode: request.mode }),
      ...(signal === undefined ? {} : { signal }),
    })
    const execution = await this.unitContent.execute(
      gateway,
      request.file,
      compiled.code,
      request.worktreeId,
      request.unitId,
      signal,
    )
    this.invalidate(request.file, request.worktreeId)
    return {
      ok: true,
      operation: 'compile-svg',
      file: request.file,
      result: {
        sourcePath: request.source,
        page: compiled.page,
        mode: compiled.mode,
        viewport: compiled.viewport,
        warnings: [...compiled.warnings],
        lints: [...compiled.lints],
        textMeasure: compiled.textMeasure,
        execution: execution.result,
      },
    }
  }

  /** Search or show the Facade API reference bundled for this plugin version. */
  apiReference(request: ApiReferenceRequest): Promise<UniverApiResult> {
    const result = request.action === 'find'
      ? this.api.find({ terms: request.queries, ...request.unit === undefined ? {} : { unit: request.unit }, ...request.limit === undefined ? {} : { limit: request.limit } })
      : this.api.show(request.queries)
    return Promise.resolve({ ok: true, operation: 'api', result: result as unknown as JsonValue })
  }

  /** Search, read, export, or clear the bundled SVG resource library. */
  resources(request: ResourceOperationRequest, signal?: AbortSignal): Promise<UniverResourceResult> {
    return this.resourceOperations.execute(request, signal)
  }

  /** Stop Gateway ownership and clear transient state. */
  async dispose(): Promise<void> {
    this.stateCache.clear()
    this.unitCache.clear()
    await this.gatewaySupervisor.dispose()
  }

  /** Status value used by the Web Consumer. */
  async unitContentStatus(): Promise<'bundled'> {
    return 'bundled'
  }

  private async computeFileState(file: string): Promise<FileState> {
    let status = await this.gatewaySupervisor.status()
    if (status.gateway === null && this.config.autoStartGateway) {
      const started = await this.gatewaySupervisor.ensure()
      if (started.ok) status = { phase: 'running', gateway: started.gateway, owned: !started.reused }
    }
    if (status.gateway === null) throw new UniverError(status.reason ?? 'Univer Gateway is not available.', 'GATEWAY_UNAVAILABLE')
    const gateway = status.gateway
    const listing = await new GatewayFileApi(new GatewayClient(gateway, this.config.gatewayRequestTimeoutMs)).listWorktrees(file)
    const records = mapWorktrees(listing)
    const entries = await Promise.all(records.map(async (record): Promise<WorktreeState> => {
      const base = `${gateway}/?file=${encodeURIComponent(fileKeyOf(file))}`
      const worktree = encodeURIComponent(record.worktreeId)
      const openUrl = `${base}&worktree=${worktree}`
      const worktreeUrl = `${base}&worktree=${worktree}&mode=embedded&scope=worktree`
      const mergeUrl = `${base}&worktree=${worktree}&mode=embedded&scope=mergePreview`
      const changedUnits = record.status === 'draft' || record.status === 'ready'
        ? await this.unitCache.get(`${file}\u0000${record.worktreeId}`, () => this.worktrees.changedUnits(gateway, file, record.worktreeId))
        : []
      const units = changedUnits.map((unit) => ({
        ...unit,
        worktreeUrl: `${worktreeUrl}&unit=${encodeURIComponent(unit.unitId)}`,
        ...record.status === 'ready' ? { mergeUrl: `${mergeUrl}&unit=${encodeURIComponent(unit.unitId)}` } : {},
      }))
      return {
        worktreeId: record.worktreeId,
        name: record.name,
        status: record.status,
        units,
        ...record.status === 'draft' || record.status === 'ready' ? { openUrl, worktreeUrl } : {},
        ...record.status === 'ready' ? { mergeUrl } : {},
      }
    }))
    return {
      ok: true,
      file,
      gateway,
      gatewayRunning: true,
      viewerUrl: `${gateway}/?file=${encodeURIComponent(fileKeyOf(file))}`,
      worktrees: entries,
    }
  }

  private async transitionWorktree(gateway: string, request: Exclude<WorktreeOperationRequest, { action: 'create' }>): Promise<JsonValue> {
    if (request.action === 'merge') await this.requireWorktreeStatus(gateway, request.file, request.worktreeId, 'ready')
    return new GatewayWorktreeApi(new GatewayClient(gateway, this.config.gatewayMutationTimeoutMs))
      .action(request.file, request.worktreeId, request.action)
  }

  private async requireWorktreeStatus(
    gateway: string,
    file: string,
    worktreeId: string,
    expected: 'draft' | 'ready',
  ): Promise<void> {
    const listing = await new GatewayFileApi(new GatewayClient(gateway, this.config.gatewayRequestTimeoutMs)).listWorktrees(file)
    const worktree = mapWorktrees(listing).find((entry) => entry.worktreeId === worktreeId)
    if (worktree === undefined) throw new UniverError(`Worktree ${worktreeId} was not found.`, 'WORKTREE_NOT_FOUND')
    if (worktree.status !== expected) {
      throw new UniverError(`Worktree ${worktreeId} is ${worktree.status}; expected ${expected}.`, 'WORKTREE_STATUS_INVALID')
    }
  }

  private invalidate(file: string, worktreeId: string): void {
    this.stateCache.delete(file)
    this.unitCache.delete(`${file}\u0000${worktreeId}`)
  }

  private async requireGateway(): Promise<string> {
    const available = await this.ensureGateway()
    if (!available.ok) throw new UniverError(available.reason, 'GATEWAY_UNAVAILABLE')
    return available.gateway
  }
}

function unitResult(unit: ReturnType<typeof mapUnits>[number]): { [key: string]: JsonValue } {
  return {
    unitId: unit.unitId,
    name: unit.name,
    kind: unitKind(unit.type),
    type: unit.type,
    headRevision: unit.headRev,
  }
}

function worktreeResult(worktree: ReturnType<typeof mapWorktrees>[number]): { [key: string]: JsonValue } {
  return {
    worktreeId: worktree.worktreeId,
    name: worktree.name,
    status: worktree.status,
    baseline: worktree.baseline,
    ...worktree.createdAt === undefined ? {} : { createdAt: worktree.createdAt },
    ...worktree.mergedAt === undefined ? {} : { mergedAt: worktree.mergedAt },
  }
}

function requireGatewaySuccess(value: JsonValue, fallback: string): void {
  if (isRecord(value) && isRecord(value.error) && value.error.code === 0) {
    throw new UniverError(gatewayErrorMessage(value) ?? fallback, 'GATEWAY_REQUEST_REJECTED')
  }
  if (isRecord(value) && value.ok === false) {
    throw new UniverError(gatewayErrorMessage(value) ?? fallback, 'GATEWAY_REQUEST_REJECTED')
  }
}

function asRecord(value: JsonValue): { [key: string]: JsonValue } {
  if (!isRecord(value)) throw new UniverError('Gateway result must be an object.', 'GATEWAY_INVALID_RESPONSE')
  return value
}

function worktreeResultId(value: JsonValue, request: WorktreeOperationRequest): string {
  const record = asRecord(value)
  if (typeof record.worktreeId === 'string') return record.worktreeId
  if (request.action !== 'create') return request.worktreeId
  throw new UniverError('Gateway worktree result is missing worktreeId.', 'GATEWAY_INVALID_RESPONSE')
}
