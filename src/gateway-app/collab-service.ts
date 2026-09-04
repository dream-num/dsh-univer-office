import { randomUUID } from 'node:crypto'
import {
  type PinnedUnitComparisonRef,
  type UnitComparisonRefRequest,
  type UnitComparisonSession,
  type UnitType
} from './contract/index.js'
import type {
  UnitComparisonContext,
  UnitComparisonContextQuery,
  UnitComparisonSummary
} from './contract/index.js'
import { decodeComparisonUnitData } from './comparison-unit-data.js'
import {
  prepareGatewayUnitComparison,
  queryGatewayUnitComparison,
  type PreparedGatewayUnitComparison
} from './comparison/unit-comparison-runtime.js'
import type {
  CollabMemberContext,
  CreateUnitFromDataInput,
  DatabaseContext
} from '@univerjs-pro/collaboration-service'
import { UnitSnapshotMaterializer } from '@univerjs-pro/collaboration-service'
import type { ISnapshotWithBlocks } from '@univerjs-pro/exchange-node'
import type {
  IChangeset as IProtocolChangeset,
  IDeserializedSheetBlock,
  ISheetBlock,
  IMutation,
  ISnapshot
} from '@univerjs/protocol'
import { UniverType } from '@univerjs/protocol'
import type { Duplex } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  ApplyResult,
  CreateUnitInput,
  CreateUnitResult,
  MergeOutcome,
  MergePreview,
  MergePreviewUnitData,
  MergeUnitPreview,
  WorktreeCreatedUnit,
  WorktreeRecord
} from './compatibility-types.js'
import { externalizeEmbeddedImages } from './assets/externalize-embedded-images.js'
import { CollabGatewayAssetScopeNotFoundError } from './assets/errors.js'
import { GatewayFileRuntime } from './gateway-file-runtime.js'
import type { UniverfileAssetRecord, UniverfileOpenedAsset } from './univerfile-sqlite/index.js'
import {
  UNIVERFILE_UNIT_METADATA_KEY,
  type UniverfileUnitSummary
} from './univerfile-sqlite/index.js'
import {
  UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY,
  UNIVERFILE_WORKTREE_METADATA_KEY,
  type UniverfileWorktreeSummary,
  type UniverfileWorktreeUnitSummary
} from './univerfile-sqlite/index.js'
import { unitAdapter } from './univer/unit-types.js'
import { KeyedLock } from './util/lock.js'
import { GatewayExchangeService } from './exchange/gateway-exchange-service.js'

export interface CollabServiceOptions {
  /** `.univer` file path; ":memory:" (default) for an ephemeral store. */
  readonly dbPath?: string
  readonly create?: boolean
}

const INITIAL_REVISION = 1
const MAX_PINNED_COMPARISONS = 64
const MAX_PREPARED_COMPARISON_CONTEXTS = 128

interface PinnedComparisonUnit {
  readonly unitId: string
  readonly type: UniverType
  readonly name: string
  readonly revision: number
}

interface PinnedComparisonSide {
  readonly ref: PinnedUnitComparisonRef
  readonly units: ReadonlyMap<string, PinnedComparisonUnit>
  readonly baseline: Readonly<Record<string, number>>
}

interface PinnedComparisonRecord {
  readonly session: UnitComparisonSession
  readonly left: PinnedComparisonSide
  readonly right: PinnedComparisonSide & {
    readonly ref: PinnedUnitComparisonRef & { readonly kind: 'worktree' }
  }
}

export interface MaterializedComparisonSide {
  readonly present: boolean
  readonly revision?: number
  readonly snapshot?: ISnapshot
  readonly sheetBlocks?: readonly IDeserializedSheetBlock[]
}

export interface UnitComparisonData {
  readonly comparisonId: string
  readonly unit: UnitComparisonSummary
  readonly fidelity: 'history' | 'snapshot'
  readonly commonBaseRevision?: number
  readonly left: MaterializedComparisonSide
  readonly right: MaterializedComparisonSide
  readonly leftChangesets: readonly IProtocolChangeset[]
  readonly rightChangesets: readonly IProtocolChangeset[]
  readonly stale: boolean
}

/**
 * Compatibility facade over one SDK-backed {@link GatewayFileRuntime}.
 *
 * Gateway composition facade over SDK services and the Univerfile catalog.
 * Collaboration semantics are delegated to the SDK services and endpoints; the direct adapter
 * calls below are limited to synchronous catalog operations not exposed by those services.
 */
export class CollabService {
  public readonly runtime: GatewayFileRuntime
  public readonly storage: TrunkStorageCompatibility
  public readonly worktrees: WorktreeCatalogCompatibility
  public readonly exchange: GatewayExchangeService

  private readonly _lock = new KeyedLock()
  private readonly _comparisons = new Map<string, PinnedComparisonRecord>()
  private readonly _materializedComparisons = new Map<string, Promise<UnitComparisonData>>()
  private readonly _preparedComparisonContexts = new Map<
    string,
    Promise<PreparedGatewayUnitComparison>
  >()

  public constructor(options: CollabServiceOptions = {}) {
    this.runtime = new GatewayFileRuntime(options)
    this.storage = new TrunkStorageCompatibility(this.runtime)
    this.worktrees = new WorktreeCatalogCompatibility(this.runtime)
    this.exchange = new GatewayExchangeService(this)
  }

  public async createUnit(type: number, input: CreateUnitInput = {}): Promise<CreateUnitResult> {
    const unitId = input.unitId ?? newUnitId()
    const name = input.name ?? unitId
    const adapter = unitAdapter(type)
    const raw = input.data ?? adapter.defaultData(unitId, name)
    const data = withInitialIdentity(this._externalizeImages(raw, unitId), unitId)
    await this.runtime.trunkService.createUnitFromData(
      {
        type: type as UniverType,
        data
      } as CreateUnitFromDataInput,
      callOptions('local', {
        [UNIVERFILE_UNIT_METADATA_KEY]: {
          name,
          createdAtMs: Date.now()
        }
      })
    )
    const sheetOrder = adapter.sheetOrder(data)
    return {
      unitId,
      ...(sheetOrder === undefined ? {} : { sheetOrder })
    }
  }

  public listUnits(): readonly UniverfileUnitSummary[] {
    return this.runtime.trunkAdapter.listUnits()
  }

  public async materializeUnit(unitId: string, type: UniverType): Promise<ISnapshotWithBlocks> {
    const unit = this.listUnits().find((candidate) => candidate.unitId === unitId)
    if (unit === undefined || unit.type !== type) {
      throw new Error(`Unit ${unitId} was not found with type ${String(type)}`)
    }
    const loadData = await this._getTrunkLoadDataWithBlocks(unitId, type, 0, 'gateway-exchange')
    const materializer = new UnitSnapshotMaterializer()
    try {
      return await materializer.materializeSnapshot(loadData)
    } finally {
      await materializer.dispose()
    }
  }

  public createWorktree(agentId = '', name = ''): WorktreeRecord {
    const worktreeId = newWorktreeId()
    const units = this.listUnits()
    const options = callOptions(agentId || 'local', {
      [UNIVERFILE_WORKTREE_METADATA_KEY]: {
        agentId,
        name,
        createdAtMs: Date.now(),
        unitNames: Object.fromEntries(units.map((unit) => [unit.unitId, unit.name]))
      }
    })
    // Worktree creation is the sole synchronous compatibility entry; it executes the same
    // SDK-compatible adapter transaction. Subsequent lifecycle/read/submit/merge semantics are
    // SDK Service-owned.
    this.runtime.worktreeAdapter.createWorktreeForGateway(databaseContext(options), {
      record: {
        worktreeID: worktreeId,
        sid: randomUUID(),
        status: 'draft'
      },
      units: units.map((unit) => ({
        worktreeID: worktreeId,
        unitID: unit.unitId,
        type: unit.type,
        source: 'trunk',
        baselineTrunkRevision: unit.headRev,
        draftHeadRevision: unit.headRev
      }))
    })
    return requireWorktree(this.runtime, worktreeId)
  }

  public listWorktrees(status?: string): WorktreeRecord[] {
    return this.runtime.worktreeAdapter.listWorktrees(status).map(toWorktreeRecord)
  }

  public worktreeUnits(worktreeId: string): readonly UniverfileWorktreeUnitSummary[] {
    return this.runtime.worktreeAdapter.listWorktreeUnits(worktreeId)
  }

  public async worktreeGetUnitOnRev(
    worktreeId: string,
    unitId: string,
    revision: number
  ): Promise<{
    snapshot?: ISnapshot
    changesets: IProtocolChangeset[]
    error?: string
  }> {
    const unit = this._requireWorktreeUnit(worktreeId, unitId)
    try {
      const result = await this.runtime.worktreeService.getUnitLoadData(
        {
          worktreeID: worktreeId,
          unitID: unitId,
          type: unit.type,
          revision
        },
        callOptions('local')
      )
      return {
        snapshot: result.snapshot,
        changesets: [...result.changesets]
      }
    } catch (error) {
      return { changesets: [], error: asMessage(error) }
    }
  }

  public async worktreeFetchMissing(
    worktreeId: string,
    unitId: string,
    from: number,
    to: number
  ): Promise<{ changesets: IProtocolChangeset[]; latestRevision: number }> {
    const unit = this._requireWorktreeUnit(worktreeId, unitId)
    const result = await this.runtime.worktreeService.getChangesets(
      {
        worktreeID: worktreeId,
        unitID: unitId,
        type: unit.type,
        from,
        to
      },
      callOptions('local')
    )
    return {
      changesets: [...result.changesets],
      latestRevision: result.latestRevision
    }
  }

  public createUnitComparison(
    rightWorktreeId: string,
    leftRequest: UnitComparisonRefRequest = { kind: 'trunk' }
  ): UnitComparisonSession {
    const right = this._pinComparisonSide({ kind: 'worktree', worktreeId: rightWorktreeId })
    if (right.ref.kind !== 'worktree') {
      throw new Error('The right comparison ref must be a Worktree')
    }
    const left = this._pinComparisonSide(leftRequest)
    if (left.ref.kind === 'worktree' && left.ref.worktreeId === rightWorktreeId) {
      throw new Error('A Worktree cannot be compared with itself')
    }

    const unitIds = new Set([...left.units.keys(), ...right.units.keys()])
    const units = [...unitIds]
      .map((unitId): UnitComparisonSummary => {
        const leftUnit = left.units.get(unitId)
        const rightUnit = right.units.get(unitId)
        if (leftUnit !== undefined && rightUnit !== undefined && leftUnit.type !== rightUnit.type) {
          throw new Error(`Unit ${unitId} has different types on the comparison sides`)
        }
        const unit = rightUnit ?? leftUnit
        if (unit === undefined) {
          throw new Error(`Unit ${unitId} was not captured by either comparison side`)
        }
        return {
          unitId,
          type: unit.type as UnitType,
          name: unit.name,
          presence:
            leftUnit === undefined ? 'right-only' : rightUnit === undefined ? 'left-only' : 'paired'
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name) || a.unitId.localeCompare(b.unitId))
    const comparisonId = `cmp-${randomUUID()}`
    const session: UnitComparisonSession = {
      comparisonId,
      createdAt: new Date().toISOString(),
      left: left.ref,
      right: right.ref,
      units
    }
    this._comparisons.set(comparisonId, { session, left, right: { ...right, ref: right.ref } })
    while (this._comparisons.size > MAX_PINNED_COMPARISONS) {
      const oldest = this._comparisons.keys().next().value as string | undefined
      if (oldest === undefined) break
      this._comparisons.delete(oldest)
      this._deletePreparedComparisonContexts(oldest)
    }
    return session
  }

  public async getUnitComparison(
    rightWorktreeId: string,
    comparisonId: string,
    unitId: string
  ): Promise<UnitComparisonData> {
    const comparison = this._comparisons.get(comparisonId)
    if (comparison === undefined || comparison.right.ref.worktreeId !== rightWorktreeId) {
      throw new Error(`Comparison ${comparisonId} was not found`)
    }
    const unit = comparison.session.units.find((candidate) => candidate.unitId === unitId)
    if (unit === undefined) {
      throw new Error(`Unit ${unitId} is not part of comparison ${comparisonId}`)
    }

    const cacheKey = `${comparisonId}:${unitId}`
    let materialized = this._materializedComparisons.get(cacheKey)
    if (materialized === undefined) {
      materialized = this._materializeUnitComparison(comparison, unit)
      this._materializedComparisons.set(cacheKey, materialized)
      materialized.catch(() => {
        if (this._materializedComparisons.get(cacheKey) === materialized) {
          this._materializedComparisons.delete(cacheKey)
        }
      })
      while (this._materializedComparisons.size > MAX_PREPARED_COMPARISON_CONTEXTS) {
        const oldest = this._materializedComparisons.keys().next().value
        if (oldest === undefined) break
        // Expire the entire pinned session: replaying just an evicted Unit can regenerate native IDs
        // while an already delivered snapshot or semantic result still refers to the old identities.
        const expiredId = oldest.slice(0, oldest.indexOf(':'))
        this._comparisons.delete(expiredId)
        this._deletePreparedComparisonContexts(expiredId)
      }
    }
    const data = await materialized
    if (this._comparisons.get(comparisonId) !== comparison) {
      throw new Error(`Comparison ${comparisonId} has expired`)
    }
    // Native Sheet decoding consumes its block buffers; never expose the cached canonical payload.
    return { ...structuredClone(data), stale: this._isComparisonStale(comparison) }
  }

  private async _materializeUnitComparison(
    comparison: PinnedComparisonRecord,
    unit: UnitComparisonSummary
  ): Promise<UnitComparisonData> {
    const [left, right, history] = await Promise.all([
      this._materializeComparisonSide(comparison.left, unit.unitId),
      this._materializeComparisonSide(comparison.right, unit.unitId),
      this._comparisonHistory(comparison, unit.unitId)
    ])
    return {
      comparisonId: comparison.session.comparisonId,
      unit,
      fidelity: history.fidelity,
      ...(history.commonBaseRevision === undefined
        ? {}
        : { commonBaseRevision: history.commonBaseRevision }),
      left,
      right,
      leftChangesets: history.leftChangesets,
      rightChangesets: history.rightChangesets,
      stale: this._isComparisonStale(comparison)
    }
  }

  /** Build a paged, UI-independent diff context over one pinned Unit comparison. */
  public async getUnitComparisonContext(
    rightWorktreeId: string,
    comparisonId: string,
    unitId: string,
    query: UnitComparisonContextQuery = {}
  ): Promise<UnitComparisonContext> {
    const record = this._comparisons.get(comparisonId)
    if (record === undefined || record.right.ref.worktreeId !== rightWorktreeId) {
      throw new Error(`Comparison ${comparisonId} was not found`)
    }
    const cacheKey = `${comparisonId}:${unitId}`
    let preparedPromise = this._preparedComparisonContexts.get(cacheKey)
    if (preparedPromise === undefined) {
      preparedPromise = this._prepareUnitComparisonContext(rightWorktreeId, comparisonId, unitId)
      this._preparedComparisonContexts.set(cacheKey, preparedPromise)
      preparedPromise.catch(() => {
        if (this._preparedComparisonContexts.get(cacheKey) === preparedPromise) {
          this._preparedComparisonContexts.delete(cacheKey)
        }
      })
      while (this._preparedComparisonContexts.size > MAX_PREPARED_COMPARISON_CONTEXTS) {
        const oldest = this._preparedComparisonContexts.keys().next().value as string | undefined
        if (oldest === undefined) break
        this._preparedComparisonContexts.delete(oldest)
      }
    }
    const prepared = await preparedPromise
    if (this._comparisons.get(comparisonId) !== record) {
      throw new Error(`Comparison ${comparisonId} expired; create a new comparison`)
    }
    return {
      ...queryGatewayUnitComparison(prepared, query),
      stale: this._isComparisonStale(record)
    }
  }

  private async _prepareUnitComparisonContext(
    rightWorktreeId: string,
    comparisonId: string,
    unitId: string
  ): Promise<PreparedGatewayUnitComparison> {
    const comparison = await this.getUnitComparison(rightWorktreeId, comparisonId, unitId)
    const [leftData, rightData] = await Promise.all([
      comparison.left.snapshot === undefined
        ? Promise.resolve(undefined)
        : decodeComparisonUnitData(
            comparison.unit.type,
            comparison.left.snapshot,
            comparison.left.sheetBlocks ?? []
          ),
      comparison.right.snapshot === undefined
        ? Promise.resolve(undefined)
        : decodeComparisonUnitData(
            comparison.unit.type,
            comparison.right.snapshot,
            comparison.right.sheetBlocks ?? []
          )
    ])
    return prepareGatewayUnitComparison({
      comparisonId,
      unit: comparison.unit,
      fidelity: comparison.fidelity,
      ...(comparison.commonBaseRevision === undefined
        ? {}
        : { commonBaseRevision: comparison.commonBaseRevision }),
      stale: comparison.stale,
      leftData,
      rightData,
      leftChangesets: comparison.leftChangesets,
      rightChangesets: comparison.rightChangesets
    })
  }

  private _deletePreparedComparisonContexts(comparisonId: string): void {
    const prefix = `${comparisonId}:`
    for (const key of this._materializedComparisons.keys()) {
      if (key.startsWith(prefix)) this._materializedComparisons.delete(key)
    }
    for (const key of this._preparedComparisonContexts.keys()) {
      if (key.startsWith(prefix)) this._preparedComparisonContexts.delete(key)
    }
  }

  public async createWorktreeUnit(
    worktreeId: string,
    type: number,
    name: string,
    unitId = newUnitId(),
    snapshot?: object
  ): Promise<WorktreeCreatedUnit> {
    const adapter = unitAdapter(type)
    const raw = snapshot ?? adapter.defaultData(unitId, name)
    const data = withInitialIdentity(this._externalizeImages(raw, unitId, worktreeId), unitId)
    await this.runtime.worktreeService.createUnitFromData(
      { worktreeID: worktreeId, type: type as UniverType, data } as Parameters<
        typeof this.runtime.worktreeService.createUnitFromData
      >[0],
      callOptions('local', {
        [UNIVERFILE_WORKTREE_METADATA_KEY]: { unitNames: { [unitId]: name } }
      })
    )
    return { unitId, type, name }
  }

  public async submitWorktreeMutations(
    worktreeId: string,
    unitId: string,
    mutations: readonly IMutation[],
    unitName?: string
  ): Promise<IProtocolChangeset> {
    const unit = this._requireWorktreeUnit(worktreeId, unitId)
    const worktree = requireWorktree(this.runtime, worktreeId)
    const changeset: IProtocolChangeset = {
      unitID: unitId,
      type: unit.type,
      baseRev: unit.headRev,
      revision: unit.headRev + 1,
      userID: worktree.agentId || 'local',
      memberID: '',
      sid: `gateway:${worktreeId}`,
      reqId: unit.headRev,
      mutations: mutations.map((mutation) =>
        toProtocolMutation(mutation, (params) =>
          this._externalizeImages(params, unitId, worktreeId)
        )
      ),
      createTime: Date.now()
    }
    const result = await this.runtime.worktreeService.submitChangeset(
      { worktreeID: worktreeId, changeset },
      callOptions(worktree.agentId || 'local', {
        [UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY]: {
          ...(unitName === undefined ? {} : { unitName }),
          createdAtMs: Date.now()
        }
      })
    )
    if (result.status === 'rejected' || result.status === 'retry') throw result.error
    return result.changeset
  }

  public deleteWorktreeUnit(worktreeId: string, unitId: string): void {
    const options = callOptions('local', {
      [UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY]: { createdAtMs: Date.now() }
    })
    const result = this.runtime.worktreeAdapter.deleteUnit(
      databaseContext(options),
      worktreeId,
      unitId
    )
    if (result.status !== 'deleted') {
      throw new Error(`cannot delete Unit ${unitId} from Worktree ${worktreeId}: ${result.status}`)
    }
  }

  public discard(worktreeId: string): Promise<void> {
    return this._lock.run(`worktree:${worktreeId}`, async () => {
      const worktree = requireWorktree(this.runtime, worktreeId)
      if (worktree.status !== 'draft' && worktree.status !== 'ready') {
        throw new Error(`Worktree ${worktreeId} is ${worktree.status}; cannot discard`)
      }
      await this.runtime.worktreeService.discardWorktree(
        { worktreeID: worktreeId },
        callOptions('local')
      )
    })
  }

  public ready(worktreeId: string): Promise<{ status: string; worktree: WorktreeRecord }> {
    return this._lock.run(`worktree:${worktreeId}`, async () => {
      await this.runtime.worktreeService.markReady({ worktreeID: worktreeId }, callOptions('local'))
      const readyWorktree = requireWorktree(this.runtime, worktreeId)
      return { status: readyWorktree.status, worktree: readyWorktree }
    })
  }

  public reopen(worktreeId: string): Promise<{ status: string }> {
    return this._lock.run(`worktree:${worktreeId}`, async () => {
      const worktree = requireWorktree(this.runtime, worktreeId)
      if (worktree.status !== 'ready') {
        throw new Error(`Worktree ${worktreeId} is ${worktree.status}; cannot reopen`)
      }
      const result = await this.runtime.worktreeService.reopenWorktree(
        { worktreeID: worktreeId },
        callOptions('local')
      )
      return { status: result.worktree.status }
    })
  }

  public merge(worktreeId: string): Promise<MergeOutcome> {
    return this._lock.run(`worktree:${worktreeId}`, () =>
      this._lock.run('merge', async () => {
        let worktree = requireWorktree(this.runtime, worktreeId)
        const deleted = this.runtime.worktreeAdapter.listDeletedUnits(worktreeId)
        const worktreeUnitIds = this.worktreeUnits(worktreeId).map((unit) => unit.unitId)
        const trunkById = new Map(this.listUnits().map((unit) => [unit.unitId, unit]))
        const deleteConflict = deleted.find((unit) => {
          const baseline = worktree.baseline[unit.unitId]
          const trunk = trunkById.get(unit.unitId)
          return (
            unit.deleteFromTrunk &&
            baseline !== undefined &&
            trunk !== undefined &&
            trunk.headRev > baseline
          )
        })
        if (deleteConflict) {
          return {
            ok: false,
            conflict: true,
            failedUnit: deleteConflict.unitId
          }
        }
        if (worktree.status === 'draft') {
          await this.runtime.worktreeService.markReady(
            { worktreeID: worktreeId },
            callOptions('local')
          )
          worktree = requireWorktree(this.runtime, worktreeId)
        }
        const mergeUnits = this.worktreeUnits(worktreeId)
        const mergedUnitNames: Record<string, string> = {}
        const renamedUnits: UniverfileWorktreeUnitSummary[] = []
        for (const unit of mergeUnits) {
          const baselineRevision = worktree.baseline[unit.unitId]
          if (baselineRevision === undefined) {
            mergedUnitNames[unit.unitId] = unit.name
            continue
          }

          const baseline = await this.worktreeGetUnitOnRev(
            worktreeId,
            unit.unitId,
            baselineRevision
          )
          const baselineName = readSnapshotUnitName(baseline.snapshot)
          if (baselineName !== undefined && baselineName !== unit.name) {
            mergedUnitNames[unit.unitId] = unit.name
            renamedUnits.push(unit)
          }
        }
        try {
          await this.runtime.worktreeService.mergeWorktree(
            { worktreeID: worktreeId },
            callOptions(worktree.agentId || 'local', {
              [UNIVERFILE_UNIT_METADATA_KEY]: {
                unitNames: mergedUnitNames
              }
            })
          )
        } catch (error) {
          return {
            ok: false,
            conflict: true,
            failedUnit: errorUnitId(error) ?? ''
          }
        }

        const trunkDeletes = deleted.filter((unit) => unit.deleteFromTrunk)
        if (trunkDeletes.length > 0) {
          await this.runtime.trunkService.deleteUnits(
            {
              unitIDs: trunkDeletes.map((unit) => unit.unitId),
              hardDelete: false
            },
            callOptions(worktree.agentId || 'local')
          )
        }
        const deletedUnitIds = new Set(deleted.map((unit) => unit.unitId))
        this.runtime.assetStore.publishWorktreeAssets(
          worktreeId,
          worktreeUnitIds.filter((unitId) => !deletedUnitIds.has(unitId))
        )
        const mergedRevs = Object.fromEntries(
          this.runtime.trunkAdapter.listUnits().map((unit) => [unit.unitId, unit.headRev])
        )
        return {
          ok: true,
          mergedRevs,
          broadcasts: [],
          addedUnits: [],
          updatedUnits: renamedUnits.map((unit) => ({
            unitId: unit.unitId,
            name: unit.name,
            headRev: mergedRevs[unit.unitId] ?? unit.headRev
          })),
          removedUnits: trunkDeletes.map((unit) => unit.unitId)
        }
      })
    )
  }

  public async previewMerge(worktreeId: string): Promise<MergePreview> {
    const worktree = requireWorktree(this.runtime, worktreeId)
    const trunkById = new Map(this.listUnits().map((unit) => [unit.unitId, unit]))
    const deletedById = new Map(
      this.runtime.worktreeAdapter.listDeletedUnits(worktreeId).map((unit) => [unit.unitId, unit])
    )
    const units: MergeUnitPreview[] = []

    for (const unit of this.worktreeUnits(worktreeId)) {
      const baseRev = worktree.baseline[unit.unitId]
      const trunk = trunkById.get(unit.unitId)
      const baseStale = baseRev !== undefined && trunk !== undefined && trunk.headRev > baseRev
      units.push({
        unitId: unit.unitId,
        type: unit.type as UnitType,
        name: unit.name,
        status:
          baseRev === undefined ? 'created' : unit.headRev > baseRev ? 'modified' : 'unchanged',
        ...(baseRev === undefined ? {} : { baseRev }),
        ...(trunk === undefined ? {} : { trunkRev: trunk.headRev }),
        baseStale
      })
    }
    for (const deleted of deletedById.values()) {
      const baseRev = worktree.baseline[deleted.unitId]
      const trunk = trunkById.get(deleted.unitId)
      const baseStale = baseRev !== undefined && trunk !== undefined && trunk.headRev > baseRev
      units.push({
        unitId: deleted.unitId,
        type: deleted.type as UnitType,
        name: deleted.name,
        status: baseStale ? 'conflict' : 'deleted',
        ...(baseRev === undefined ? {} : { baseRev }),
        ...(trunk === undefined ? {} : { trunkRev: trunk.headRev }),
        baseStale
      })
    }
    return {
      worktreeId,
      mergeable: units.every((unit) => unit.status !== 'conflict'),
      diverged: units.some((unit) => unit.baseStale),
      units,
      conflicts: units.filter((unit) => unit.status === 'conflict').map((unit) => unit.unitId)
    }
  }

  public async getMergePreviewUnit(
    worktreeId: string,
    unitId: string
  ): Promise<MergePreviewUnitData> {
    const unit = this.worktreeUnits(worktreeId).find((candidate) => candidate.unitId === unitId)
    if (!unit) {
      const deleted = this.runtime.worktreeAdapter
        .listDeletedUnits(worktreeId)
        .find((candidate) => candidate.unitId === unitId)
      if (deleted) {
        return {
          type: deleted.type,
          changesets: [],
          error: `Unit ${unitId} is deleted in Worktree ${worktreeId}`
        }
      }
      throw new Error(`Unit ${unitId} is not part of Worktree ${worktreeId}`)
    }
    const result = await this.runtime.worktreeService.getUnitLoadData(
      {
        worktreeID: worktreeId,
        unitID: unitId,
        type: unit.type,
        revision: 0
      },
      callOptions('local')
    )
    const sheetBlocks =
      unit.type === UniverType.UNIVER_SHEET
        ? await this._readWorktreeSheetBlocks(worktreeId, unitId, unit.type, result.snapshot)
        : undefined
    return {
      type: unit.type,
      snapshot: result.snapshot,
      ...(sheetBlocks === undefined ? {} : { sheetBlocks }),
      changesets: [...result.changesets]
    }
  }

  public async submit(
    _unitId: string,
    _type: number,
    changeset: IProtocolChangeset
  ): Promise<ApplyResult> {
    const result = await this.runtime.trunkService.submitChangeset(
      { changeset },
      callOptions(changeset.userID || 'local')
    )
    if (result.status === 'committed') {
      return {
        success: true,
        currentRevision: result.changeset.revision
      }
    }
    if (result.status === 'already-committed') {
      return {
        success: false,
        currentRevision: result.changeset.revision,
        isCsDeduplicate: true
      }
    }
    if ('error' in result) {
      return {
        success: false,
        currentRevision: changeset.baseRev,
        isConflictError: result.error.code === 'OT_CONFLICT',
        error: result.error
      }
    }
    throw new Error(`unknown changeset result: ${result.status}`)
  }

  public handleSdkRequest(
    request: IncomingMessage,
    response: ServerResponse,
    sdkUrl: string
  ): void {
    this.runtime.handleRequest(request, response, sdkUrl)
  }

  public handleSdkUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    sdkUrl: string
  ): void {
    this.runtime.handleUpgrade(request, socket, head, sdkUrl)
  }

  public async dispose(): Promise<void> {
    this._comparisons.clear()
    this._materializedComparisons.clear()
    this._preparedComparisonContexts.clear()
    await this.exchange.dispose()
    await this.runtime.dispose()
  }

  public getCurrentRev(unitId: string): number | undefined {
    return this.listUnits().find((unit) => unit.unitId === unitId)?.headRev
  }

  public hasUnit(unitId: string): boolean {
    return this.getCurrentRev(unitId) !== undefined
  }

  public storeAsset(input: {
    readonly unitId: string
    readonly worktreeId?: string
    readonly originalFilename: string
    readonly mediaType: string
    readonly bytes: Uint8Array
  }): UniverfileAssetRecord {
    if (input.worktreeId === undefined) {
      if (!this.hasUnit(input.unitId)) throw new CollabGatewayAssetScopeNotFoundError()
    } else {
      let worktree: WorktreeRecord
      try {
        worktree = requireWorktree(this.runtime, input.worktreeId)
        this._requireWorktreeUnit(input.worktreeId, input.unitId)
      } catch {
        throw new CollabGatewayAssetScopeNotFoundError()
      }
      if (worktree.status !== 'draft') {
        throw new CollabGatewayAssetScopeNotFoundError()
      }
    }
    return this.runtime.assetStore.store(input)
  }

  public openAsset(assetId: string, worktreeId?: string): UniverfileOpenedAsset | null {
    const opened = this.runtime.assetStore.open(assetId)
    if (opened === null) return null
    if (worktreeId === undefined) {
      if (opened.record.worktreeId !== null || !this.hasUnit(opened.record.unitId)) return null
      return opened
    }
    if (opened.record.worktreeId !== null && opened.record.worktreeId !== worktreeId) {
      return null
    }
    try {
      requireWorktree(this.runtime, worktreeId)
      this._requireWorktreeUnit(worktreeId, opened.record.unitId)
    } catch {
      return null
    }
    return opened
  }

  public getConfirmedChangeset(unitId: string, revision: number): IProtocolChangeset | undefined {
    return this.runtime.trunkAdapter.getChangeset(unitId, revision)
  }

  public getConfirmedChangesetBySid(
    unitId: string,
    sid: string,
    reqId: number
  ): IProtocolChangeset | undefined {
    return this.runtime.trunkAdapter.getChangesetBySid(unitId, sid, reqId)
  }

  public hasConnections(): boolean {
    return this.runtime.hasConnections()
  }

  private _pinComparisonSide(request: UnitComparisonRefRequest): PinnedComparisonSide {
    if (request.kind === 'trunk') {
      const units = this.listUnits().map((unit): PinnedComparisonUnit => ({
        unitId: unit.unitId,
        type: unit.type,
        name: unit.name,
        revision: unit.headRev
      }))
      return {
        ref: {
          kind: 'trunk',
          label: 'Trunk',
          heads: Object.fromEntries(units.map((unit) => [unit.unitId, unit.revision]))
        },
        units: new Map(units.map((unit) => [unit.unitId, unit])),
        baseline: {}
      }
    }

    const worktree = requireWorktree(this.runtime, request.worktreeId)
    if (worktree.status !== 'draft' && worktree.status !== 'ready') {
      throw new Error(`Worktree ${request.worktreeId} is ${worktree.status}; cannot compare it`)
    }
    const units = this.worktreeUnits(request.worktreeId).map((unit): PinnedComparisonUnit => ({
      unitId: unit.unitId,
      type: unit.type,
      name: unit.name,
      revision: unit.headRev
    }))
    return {
      ref: {
        kind: 'worktree',
        worktreeId: request.worktreeId,
        label: worktree.name || request.worktreeId,
        heads: Object.fromEntries(units.map((unit) => [unit.unitId, unit.revision]))
      },
      units: new Map(units.map((unit) => [unit.unitId, unit])),
      baseline: { ...worktree.baseline }
    }
  }

  private async _materializeComparisonSide(
    side: PinnedComparisonSide,
    unitId: string
  ): Promise<MaterializedComparisonSide> {
    const unit = side.units.get(unitId)
    if (unit === undefined) return { present: false }

    const loadData =
      side.ref.kind === 'trunk'
        ? await this._getTrunkLoadDataWithBlocks(
            unitId,
            unit.type,
            unit.revision,
            'worktree-comparison'
          )
        : await this._getWorktreeLoadDataWithBlocks(
            side.ref.worktreeId,
            unitId,
            unit.type,
            unit.revision
          )
    const materializer = new UnitSnapshotMaterializer()
    try {
      const materialized = await materializer.materializeSnapshot(loadData)
      return {
        present: true,
        revision: unit.revision,
        snapshot: materialized.snapshot,
        ...(materialized.sheetBlocks.length === 0
          ? {}
          : {
              sheetBlocks: materialized.sheetBlocks.map((block) => ({
                id: block.id,
                startRow: block.startRow,
                endRow: block.endRow,
                data: JSON.parse(new TextDecoder().decode(block.data)) as object
              }))
            })
      }
    } finally {
      await materializer.dispose()
    }
  }

  private async _getWorktreeLoadDataWithBlocks(
    worktreeId: string,
    unitId: string,
    type: UniverType,
    revision: number
  ): Promise<{
    readonly snapshot: ISnapshot
    readonly changesets: readonly IProtocolChangeset[]
    readonly targetRevision: number
    readonly sheetBlocks: readonly ISheetBlock[]
  }> {
    const loadData = await this.runtime.worktreeService.getUnitLoadData(
      { worktreeID: worktreeId, unitID: unitId, type, revision },
      callOptions('local')
    )
    const sheetBlocks =
      loadData.snapshot.workbook === undefined
        ? []
        : await this._readWorktreeSerializedSheetBlocks(worktreeId, unitId, type, loadData.snapshot)
    return { ...loadData, sheetBlocks }
  }

  private async _getTrunkLoadDataWithBlocks(
    unitId: string,
    type: UniverType,
    revision: number,
    source: string
  ): Promise<{
    readonly snapshot: ISnapshot
    readonly changesets: readonly IProtocolChangeset[]
    readonly targetRevision: number
    readonly sheetBlocks: readonly ISheetBlock[]
  }> {
    const loadData = await this.runtime.trunkService.getUnitLoadDataWithBlocks(
      { unitID: unitId, type, revision },
      callOptions('local', { source })
    )
    if (loadData.snapshot.workbook === undefined || loadData.sheetBlocks.length > 0) {
      return loadData
    }
    const blockIDs = Object.values(loadData.snapshot.workbook.blockMeta ?? {}).flatMap(
      (meta) => meta.blocks
    )
    const blocks = await Promise.all(
      blockIDs.map(async (blockID) => {
        const result = await this.runtime.trunkService.getSheetBlock(
          { unitID: unitId, type, blockID },
          callOptions('local', { source })
        )
        return result.block ?? undefined
      })
    )
    return {
      ...loadData,
      sheetBlocks: blocks.filter((block): block is ISheetBlock => block !== undefined)
    }
  }

  private async _comparisonHistory(
    comparison: PinnedComparisonRecord,
    unitId: string
  ): Promise<{
    readonly fidelity: 'history' | 'snapshot'
    readonly commonBaseRevision?: number
    readonly leftChangesets: readonly IProtocolChangeset[]
    readonly rightChangesets: readonly IProtocolChangeset[]
  }> {
    const leftUnit = comparison.left.units.get(unitId)
    const rightUnit = comparison.right.units.get(unitId)
    if (leftUnit === undefined || rightUnit === undefined) {
      return { fidelity: 'snapshot', leftChangesets: [], rightChangesets: [] }
    }
    const leftBase =
      comparison.left.ref.kind === 'trunk' ? undefined : comparison.left.baseline[unitId]
    const rightBase = comparison.right.baseline[unitId]
    const commonBaseRevision =
      comparison.left.ref.kind === 'trunk'
        ? rightBase
        : leftBase === undefined || rightBase === undefined
          ? undefined
          : Math.min(leftBase, rightBase)
    if (commonBaseRevision === undefined) {
      return { fidelity: 'snapshot', leftChangesets: [], rightChangesets: [] }
    }
    try {
      const [leftChangesets, rightChangesets] = await Promise.all([
        this._comparisonPathChangesets(comparison.left, unitId, commonBaseRevision),
        this._comparisonPathChangesets(comparison.right, unitId, commonBaseRevision)
      ])
      return {
        fidelity: 'history',
        commonBaseRevision,
        leftChangesets,
        rightChangesets
      }
    } catch {
      return { fidelity: 'snapshot', leftChangesets: [], rightChangesets: [] }
    }
  }

  private async _comparisonPathChangesets(
    side: PinnedComparisonSide,
    unitId: string,
    commonBaseRevision: number
  ): Promise<readonly IProtocolChangeset[]> {
    const unit = side.units.get(unitId)
    if (unit === undefined) return []
    if (side.ref.kind === 'trunk') {
      const trunk = await this.runtime.trunkService.getChangesets(
        {
          unitID: unitId,
          type: unit.type,
          from: commonBaseRevision,
          to: unit.revision
        },
        callOptions('local')
      )
      return trunk.changesets
    }

    const baseline = side.baseline[unitId]
    if (baseline === undefined) throw new Error(`Unit ${unitId} has no common Trunk baseline`)
    const trunk =
      baseline <= commonBaseRevision
        ? []
        : (
            await this.runtime.trunkService.getChangesets(
              {
                unitID: unitId,
                type: unit.type,
                from: commonBaseRevision,
                to: baseline
              },
              callOptions('local')
            )
          ).changesets
    const draft = await this.runtime.worktreeService.getChangesets(
      {
        worktreeID: side.ref.worktreeId,
        unitID: unitId,
        type: unit.type,
        from: baseline,
        to: unit.revision
      },
      callOptions('local')
    )
    return [...trunk, ...draft.changesets]
  }

  private _isComparisonStale(comparison: PinnedComparisonRecord): boolean {
    return (
      this._isComparisonSideStale(comparison.left) || this._isComparisonSideStale(comparison.right)
    )
  }

  private _isComparisonSideStale(side: PinnedComparisonSide): boolean {
    const current =
      side.ref.kind === 'trunk' ? this.listUnits() : this.worktreeUnits(side.ref.worktreeId)
    if (current.length !== side.units.size) return true
    return current.some((unit) => side.units.get(unit.unitId)?.revision !== unit.headRev)
  }

  private _requireWorktreeUnit(worktreeId: string, unitId: string): UniverfileWorktreeUnitSummary {
    const unit = this.worktreeUnits(worktreeId).find((candidate) => candidate.unitId === unitId)
    if (!unit) {
      throw new Error(`Unit ${unitId} is not part of Worktree ${worktreeId}`)
    }
    return unit
  }

  private _externalizeImages(value: object, unitId: string, worktreeId?: string): object
  private _externalizeImages(value: unknown, unitId: string, worktreeId?: string): unknown
  private _externalizeImages(value: unknown, unitId: string, worktreeId?: string): unknown {
    return externalizeEmbeddedImages(value, {
      store: ({ bytes, filename, mediaType }) =>
        this.runtime.assetStore.store({
          unitId,
          ...(worktreeId === undefined ? {} : { worktreeId }),
          originalFilename: filename,
          mediaType,
          bytes,
          reuseInScope: true
        }).assetId
    })
  }

  private async _readWorktreeSheetBlocks(
    worktreeId: string,
    unitId: string,
    type: UniverType,
    snapshot: ISnapshot
  ): Promise<IDeserializedSheetBlock[]> {
    const blocks = await this._readWorktreeSerializedSheetBlocks(worktreeId, unitId, type, snapshot)
    return blocks.map((block) => ({
      id: block.id,
      startRow: block.startRow,
      endRow: block.endRow,
      data: JSON.parse(new TextDecoder().decode(block.data)) as object
    }))
  }

  private async _readWorktreeSerializedSheetBlocks(
    worktreeId: string,
    unitId: string,
    type: UniverType,
    snapshot: ISnapshot
  ): Promise<ISheetBlock[]> {
    const blockIDs = Object.values(snapshot.workbook?.blockMeta ?? {}).flatMap(
      (meta) => meta.blocks
    )
    const blocks = await Promise.all(
      blockIDs.map(async (blockID) => {
        const result = await this.runtime.worktreeService.getSheetBlock(
          {
            worktreeID: worktreeId,
            unitID: unitId,
            type,
            blockID
          },
          callOptions('local')
        )
        if (!result.block) return undefined
        return result.block
      })
    )
    return blocks.filter((block): block is ISheetBlock => block !== undefined)
  }
}

class TrunkStorageCompatibility {
  public constructor(private readonly _runtime: GatewayFileRuntime) {}

  public async getUnitOnRev(
    _context: unknown,
    request: {
      readonly unitID: string
      readonly type: number
      readonly revision: number
    }
  ): Promise<{
    error: { code: number; message: string }
    snapshot?: ISnapshot
    changesets: readonly IProtocolChangeset[]
  }> {
    try {
      const result = await this._runtime.trunkService.getUnitLoadData(
        {
          unitID: request.unitID,
          type: request.type as UniverType,
          revision: request.revision
        },
        callOptions('local')
      )
      return {
        error: { code: 1, message: '' },
        snapshot: result.snapshot,
        changesets: result.changesets
      }
    } catch (error) {
      return {
        error: { code: 0, message: asMessage(error) },
        changesets: []
      }
    }
  }

  public async fetchMissingChangesets(
    _context: unknown,
    request: {
      readonly unitID: string
      readonly type: number
      readonly from: number
      readonly to: number
    }
  ): Promise<{
    error: { code: number; message: string }
    changesets: readonly IProtocolChangeset[]
    latestRevision: number
  }> {
    try {
      const result = await this._runtime.trunkService.getChangesets(
        {
          unitID: request.unitID,
          type: request.type as UniverType,
          from: request.from,
          to: request.to
        },
        callOptions('local')
      )
      return {
        error: { code: 1, message: '' },
        changesets: result.changesets,
        latestRevision: result.latestRevision
      }
    } catch (error) {
      return {
        error: { code: 0, message: asMessage(error) },
        changesets: [],
        latestRevision: 0
      }
    }
  }

  public async getSheetBlock(
    _context: unknown,
    request: {
      readonly unitID: string
      readonly type: number
      readonly blockID: string
    }
  ): Promise<{
    error: { code: number; message: string }
    block?: unknown
  }> {
    try {
      const result = await this._runtime.trunkService.getSheetBlock(
        {
          unitID: request.unitID,
          type: request.type as UniverType,
          blockID: request.blockID
        },
        callOptions('local')
      )
      return {
        error: { code: 1, message: '' },
        ...(result.block === null ? {} : { block: result.block })
      }
    } catch (error) {
      return { error: { code: 0, message: asMessage(error) } }
    }
  }

  public async getDeserializedSheetBlock(
    context: unknown,
    request: {
      readonly unitID: string
      readonly type: number
      readonly blockID: string
    }
  ): Promise<{
    error: { code: number; message: string }
    block?: unknown
  }> {
    const result = await this.getSheetBlock(context, request)
    const block = result.block as { readonly data?: Uint8Array } | undefined
    if (!block?.data) return result
    try {
      return {
        ...result,
        block: {
          ...block,
          data: JSON.parse(new TextDecoder().decode(block.data))
        }
      }
    } catch {
      return result
    }
  }
}

class WorktreeCatalogCompatibility {
  public constructor(private readonly _runtime: GatewayFileRuntime) {}

  public getWorktree(worktreeId: string): WorktreeRecord | undefined {
    const row = this._runtime.worktreeAdapter
      .listWorktrees()
      .find((worktree) => worktree.worktreeId === worktreeId)
    return row ? toWorktreeRecord(row) : undefined
  }
}

function callOptions(
  userId: string,
  customData: Record<string, unknown> = {}
): CollabMemberContext {
  return {
    memberID: `gateway-${randomUUID()}`,
    userID: userId,
    customData
  }
}

function databaseContext(options: CollabMemberContext): DatabaseContext {
  return {
    userID: options.userID,
    customData: options.customData ?? {},
    request: {}
  }
}

function toProtocolMutation(
  mutation: IMutation,
  rewriteParams: (params: unknown) => unknown = (params) => params
): IMutation {
  const input = mutation as IMutation & { readonly params?: unknown }
  if (typeof input.data === 'string') {
    try {
      return {
        id: input.id,
        data: JSON.stringify(rewriteParams(JSON.parse(input.data) as unknown))
      }
    } catch {
      return { id: input.id, data: input.data }
    }
  }
  return { id: input.id, data: JSON.stringify(rewriteParams(input.params ?? input.data ?? {})) }
}

function withInitialIdentity(raw: object, unitId: string): CreateUnitFromDataInput['data'] {
  return {
    ...raw,
    id: unitId,
    rev: INITIAL_REVISION
  } as CreateUnitFromDataInput['data']
}

function requireWorktree(runtime: GatewayFileRuntime, worktreeId: string): WorktreeRecord {
  const row = runtime.worktreeAdapter
    .listWorktrees()
    .find((worktree) => worktree.worktreeId === worktreeId)
  if (!row) {
    throw new Error(`Worktree ${worktreeId} not found`)
  }
  return toWorktreeRecord(row)
}

function toWorktreeRecord(row: UniverfileWorktreeSummary): WorktreeRecord {
  return {
    worktreeId: row.worktreeId,
    status: row.status === 'merging' ? 'ready' : row.status,
    agentId: row.agentId,
    name: row.name,
    baseline: { ...row.baseline },
    createdAt: row.createdAt,
    ...(row.mergedAt === undefined ? {} : { mergedAt: row.mergedAt })
  }
}

function newUnitId(): string {
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function readSnapshotUnitName(snapshot: ISnapshot | undefined): string | undefined {
  return (
    snapshot?.workbook?.name ??
    snapshot?.doc?.name ??
    snapshot?.slide?.name ??
    snapshot?.board?.name
  )
}

function newWorktreeId(): string {
  return `wt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function errorUnitId(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const details = (error as { readonly details?: unknown }).details
  if (!details || typeof details !== 'object') return undefined
  const unitID = (details as { readonly unitID?: unknown }).unitID
  return typeof unitID === 'string' ? unitID : undefined
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
