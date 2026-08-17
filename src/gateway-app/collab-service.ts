import { randomUUID } from "node:crypto";
import { type UnitType } from './contract';
import type {
  CollabMemberContext,
  CreateUnitFromDataInput,
  DatabaseContext,
} from "@univerjs-pro/collaboration-service";
import type {
  IChangeset as IProtocolChangeset,
  IDeserializedSheetBlock,
  IMutation,
  ISnapshot,
} from "@univerjs/protocol";
import { UniverType } from "@univerjs/protocol";
import type { Duplex } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  ApplyResult,
  CreateUnitInput,
  CreateUnitResult,
  MergeOutcome,
  MergePreview,
  MergePreviewUnitData,
  MergeUnitPreview,
  WorktreeCreatedUnit,
  WorktreeRecord,
} from "./compatibility-types.js";
import { externalizeEmbeddedImages } from "./assets/externalize-embedded-images.js";
import { CollabGatewayAssetScopeNotFoundError } from "./assets/errors.js";
import { GatewayFileRuntime } from "./gateway-file-runtime.js";
import type { UniverfileAssetRecord, UniverfileOpenedAsset } from './univerfile-sqlite';
import {
  UNIVERFILE_UNIT_METADATA_KEY,
  type UniverfileUnitSummary,
} from './univerfile-sqlite';
import {
  UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY,
  UNIVERFILE_WORKTREE_METADATA_KEY,
  type UniverfileWorktreeSummary,
  type UniverfileWorktreeUnitSummary,
} from './univerfile-sqlite';
import { unitAdapter } from "./univer/unit-types.js";
import { KeyedLock } from "./util/lock.js";

export interface CollabServiceOptions {
  /** `.univer` file path; ":memory:" (default) for an ephemeral store. */
  readonly dbPath?: string;
  readonly create?: boolean;
}

const INITIAL_REVISION = 1;

/**
 * Compatibility facade over one SDK-backed {@link GatewayFileRuntime}.
 *
 * Gateway composition facade over SDK services and the Univerfile catalog.
 * Collaboration semantics are delegated to the SDK services and endpoints; the direct adapter
 * calls below are limited to synchronous catalog operations not exposed by those services.
 */
export class CollabService {
  public readonly runtime: GatewayFileRuntime;
  public readonly storage: TrunkStorageCompatibility;
  public readonly worktrees: WorktreeCatalogCompatibility;

  private readonly _lock = new KeyedLock();

  public constructor(options: CollabServiceOptions = {}) {
    this.runtime = new GatewayFileRuntime(options);
    this.storage = new TrunkStorageCompatibility(this.runtime);
    this.worktrees = new WorktreeCatalogCompatibility(this.runtime);
  }

  public async createUnit(type: number, input: CreateUnitInput = {}): Promise<CreateUnitResult> {
    const unitId = input.unitId ?? newUnitId();
    const name = input.name ?? unitId;
    const adapter = unitAdapter(type);
    const raw = input.data ?? adapter.defaultData(unitId, name);
    const data = withInitialIdentity(this._externalizeImages(raw, unitId), unitId);
    await this.runtime.trunkService.createUnitFromData(
      {
        type: type as UniverType,
        data,
      } as CreateUnitFromDataInput,
      callOptions("local", {
        [UNIVERFILE_UNIT_METADATA_KEY]: {
          name,
          createdAtMs: Date.now(),
        },
      }),
    );
    const sheetOrder = adapter.sheetOrder(data);
    return {
      unitId,
      ...(sheetOrder === undefined ? {} : { sheetOrder }),
    };
  }

  public listUnits(): readonly UniverfileUnitSummary[] {
    return this.runtime.trunkAdapter.listUnits();
  }

  public createWorktree(agentId = "", name = ""): WorktreeRecord {
    const worktreeId = newWorktreeId();
    const units = this.listUnits();
    const options = callOptions(agentId || "local", {
      [UNIVERFILE_WORKTREE_METADATA_KEY]: {
        agentId,
        name,
        createdAtMs: Date.now(),
        unitNames: Object.fromEntries(units.map((unit) => [unit.unitId, unit.name])),
      },
    });
    // Worktree creation is the sole synchronous compatibility entry; it executes the same
    // SDK-compatible adapter transaction. Subsequent lifecycle/read/submit/merge semantics are
    // SDK Service-owned.
    this.runtime.worktreeAdapter.createWorktreeForGateway(databaseContext(options), {
      record: {
        worktreeID: worktreeId,
        sid: randomUUID(),
        status: "draft",
      },
      units: units.map((unit) => ({
        worktreeID: worktreeId,
        unitID: unit.unitId,
        type: unit.type,
        source: "trunk",
        baselineTrunkRevision: unit.headRev,
        draftHeadRevision: unit.headRev,
      })),
    });
    return requireWorktree(this.runtime, worktreeId);
  }

  public listWorktrees(status?: string): WorktreeRecord[] {
    return this.runtime.worktreeAdapter.listWorktrees(status).map(toWorktreeRecord);
  }

  public worktreeUnits(worktreeId: string): readonly UniverfileWorktreeUnitSummary[] {
    return this.runtime.worktreeAdapter.listWorktreeUnits(worktreeId);
  }

  public async worktreeGetUnitOnRev(
    worktreeId: string,
    unitId: string,
    revision: number,
  ): Promise<{
    snapshot?: ISnapshot;
    changesets: IProtocolChangeset[];
    error?: string;
  }> {
    const unit = this._requireWorktreeUnit(worktreeId, unitId);
    try {
      const result = await this.runtime.worktreeService.getUnit(
        {
          worktreeID: worktreeId,
          unitID: unitId,
          type: unit.type,
          revision,
        },
        callOptions("local"),
      );
      return {
        snapshot: result.snapshot,
        changesets: [...result.changesets],
      };
    } catch (error) {
      return { changesets: [], error: asMessage(error) };
    }
  }

  public async worktreeFetchMissing(
    worktreeId: string,
    unitId: string,
    from: number,
    to: number,
  ): Promise<{ changesets: IProtocolChangeset[]; latestRevision: number }> {
    const unit = this._requireWorktreeUnit(worktreeId, unitId);
    const result = await this.runtime.worktreeService.getChangesets(
      {
        worktreeID: worktreeId,
        unitID: unitId,
        type: unit.type,
        from,
        to,
      },
      callOptions("local"),
    );
    return {
      changesets: [...result.changesets],
      latestRevision: result.latestRevision,
    };
  }

  public async createWorktreeUnit(
    worktreeId: string,
    type: number,
    name: string,
    unitId = newUnitId(),
    snapshot?: object,
  ): Promise<WorktreeCreatedUnit> {
    const adapter = unitAdapter(type);
    const raw = snapshot ?? adapter.defaultData(unitId, name);
    const data = withInitialIdentity(this._externalizeImages(raw, unitId, worktreeId), unitId);
    await this.runtime.worktreeService.createUnitFromData(
      { worktreeID: worktreeId, type: type as UniverType, data } as Parameters<
        typeof this.runtime.worktreeService.createUnitFromData
      >[0],
      callOptions("local", {
        [UNIVERFILE_WORKTREE_METADATA_KEY]: { unitNames: { [unitId]: name } },
      }),
    );
    return { unitId, type, name };
  }

  public async submitWorktreeMutations(
    worktreeId: string,
    unitId: string,
    mutations: readonly IMutation[],
    unitName?: string,
  ): Promise<IProtocolChangeset> {
    const unit = this._requireWorktreeUnit(worktreeId, unitId);
    const worktree = requireWorktree(this.runtime, worktreeId);
    const changeset: IProtocolChangeset = {
      unitID: unitId,
      type: unit.type,
      baseRev: unit.headRev,
      revision: unit.headRev + 1,
      userID: worktree.agentId || "local",
      memberID: "",
      sid: `gateway:${worktreeId}`,
      reqId: unit.headRev,
      mutations: mutations.map((mutation) =>
        toProtocolMutation(mutation, (params) =>
          this._externalizeImages(params, unitId, worktreeId),
        ),
      ),
      createTime: Date.now(),
    };
    const result = await this.runtime.worktreeService.submitChangeset(
      { worktreeID: worktreeId, changeset },
      callOptions(worktree.agentId || "local", {
        [UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY]: {
          ...(unitName === undefined ? {} : { unitName }),
          createdAtMs: Date.now(),
        },
      }),
    );
    if (result.status === "rejected" || result.status === "retry") throw result.error;
    return result.changeset;
  }

  public deleteWorktreeUnit(worktreeId: string, unitId: string): void {
    const options = callOptions("local", {
      [UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY]: { createdAtMs: Date.now() },
    });
    const result = this.runtime.worktreeAdapter.deleteUnit(
      databaseContext(options),
      worktreeId,
      unitId,
    );
    if (result.status !== "deleted") {
      throw new Error(`cannot delete Unit ${unitId} from Worktree ${worktreeId}: ${result.status}`);
    }
  }

  public discard(worktreeId: string): Promise<void> {
    return this._lock.run(`worktree:${worktreeId}`, async () => {
      const worktree = requireWorktree(this.runtime, worktreeId);
      if (worktree.status !== "draft" && worktree.status !== "ready") {
        throw new Error(`Worktree ${worktreeId} is ${worktree.status}; cannot discard`);
      }
      await this.runtime.worktreeService.discardWorktree(
        { worktreeID: worktreeId },
        callOptions("local"),
      );
    });
  }

  public ready(worktreeId: string): Promise<{ status: string; worktree: WorktreeRecord }> {
    return this._lock.run(`worktree:${worktreeId}`, async () => {
      await this.runtime.worktreeService.markReady(
        { worktreeID: worktreeId },
        callOptions("local"),
      );
      const readyWorktree = requireWorktree(this.runtime, worktreeId);
      return { status: readyWorktree.status, worktree: readyWorktree };
    });
  }

  public reopen(worktreeId: string): Promise<{ status: string }> {
    return this._lock.run(`worktree:${worktreeId}`, async () => {
      const worktree = requireWorktree(this.runtime, worktreeId);
      if (worktree.status !== "ready") {
        throw new Error(`Worktree ${worktreeId} is ${worktree.status}; cannot reopen`);
      }
      const result = await this.runtime.worktreeService.reopenWorktree(
        { worktreeID: worktreeId },
        callOptions("local"),
      );
      return { status: result.worktree.status };
    });
  }

  public merge(worktreeId: string): Promise<MergeOutcome> {
    return this._lock.run(`worktree:${worktreeId}`, () =>
      this._lock.run("merge", async () => {
        let worktree = requireWorktree(this.runtime, worktreeId);
        const deleted = this.runtime.worktreeAdapter.listDeletedUnits(worktreeId);
        const worktreeUnitIds = this.worktreeUnits(worktreeId).map((unit) => unit.unitId);
        const trunkById = new Map(this.listUnits().map((unit) => [unit.unitId, unit]));
        const deleteConflict = deleted.find((unit) => {
          const baseline = worktree.baseline[unit.unitId];
          const trunk = trunkById.get(unit.unitId);
          return (
            unit.deleteFromTrunk &&
            baseline !== undefined &&
            trunk !== undefined &&
            trunk.headRev > baseline
          );
        });
        if (deleteConflict) {
          return {
            ok: false,
            conflict: true,
            failedUnit: deleteConflict.unitId,
          };
        }
        if (worktree.status === "draft") {
          await this.runtime.worktreeService.markReady(
            { worktreeID: worktreeId },
            callOptions("local"),
          );
          worktree = requireWorktree(this.runtime, worktreeId);
        }
        const mergeUnits = this.worktreeUnits(worktreeId);
        const mergedUnitNames: Record<string, string> = {};
        const renamedUnits: UniverfileWorktreeUnitSummary[] = [];
        for (const unit of mergeUnits) {
          const baselineRevision = worktree.baseline[unit.unitId];
          if (baselineRevision === undefined) {
            mergedUnitNames[unit.unitId] = unit.name;
            continue;
          }

          const baseline = await this.worktreeGetUnitOnRev(
            worktreeId,
            unit.unitId,
            baselineRevision,
          );
          const baselineName = readSnapshotUnitName(baseline.snapshot);
          if (baselineName !== undefined && baselineName !== unit.name) {
            mergedUnitNames[unit.unitId] = unit.name;
            renamedUnits.push(unit);
          }
        }
        try {
          await this.runtime.worktreeService.mergeWorktree(
            { worktreeID: worktreeId },
            callOptions(worktree.agentId || "local", {
              [UNIVERFILE_UNIT_METADATA_KEY]: {
                unitNames: mergedUnitNames,
              },
            }),
          );
        } catch (error) {
          return {
            ok: false,
            conflict: true,
            failedUnit: errorUnitId(error) ?? "",
          };
        }

        const trunkDeletes = deleted.filter((unit) => unit.deleteFromTrunk);
        if (trunkDeletes.length > 0) {
          await this.runtime.trunkService.deleteUnits(
            {
              unitIDs: trunkDeletes.map((unit) => unit.unitId),
              hardDelete: false,
            },
            callOptions(worktree.agentId || "local"),
          );
        }
        const deletedUnitIds = new Set(deleted.map((unit) => unit.unitId));
        this.runtime.assetStore.publishWorktreeAssets(
          worktreeId,
          worktreeUnitIds.filter((unitId) => !deletedUnitIds.has(unitId)),
        );
        const mergedRevs = Object.fromEntries(
          this.runtime.trunkAdapter.listUnits().map((unit) => [unit.unitId, unit.headRev]),
        );
        return {
          ok: true,
          mergedRevs,
          broadcasts: [],
          addedUnits: [],
          updatedUnits: renamedUnits.map((unit) => ({
            unitId: unit.unitId,
            name: unit.name,
            headRev: mergedRevs[unit.unitId] ?? unit.headRev,
          })),
          removedUnits: trunkDeletes.map((unit) => unit.unitId),
        };
      }),
    );
  }

  public async previewMerge(worktreeId: string): Promise<MergePreview> {
    const worktree = requireWorktree(this.runtime, worktreeId);
    const trunkById = new Map(this.listUnits().map((unit) => [unit.unitId, unit]));
    const deletedById = new Map(
      this.runtime.worktreeAdapter.listDeletedUnits(worktreeId).map((unit) => [unit.unitId, unit]),
    );
    const units: MergeUnitPreview[] = [];

    for (const unit of this.worktreeUnits(worktreeId)) {
      const baseRev = worktree.baseline[unit.unitId];
      const trunk = trunkById.get(unit.unitId);
      const baseStale = baseRev !== undefined && trunk !== undefined && trunk.headRev > baseRev;
      units.push({
        unitId: unit.unitId,
        type: unit.type as UnitType,
        name: unit.name,
        status:
          baseRev === undefined ? "created" : unit.headRev > baseRev ? "modified" : "unchanged",
        ...(baseRev === undefined ? {} : { baseRev }),
        ...(trunk === undefined ? {} : { trunkRev: trunk.headRev }),
        baseStale,
      });
    }
    for (const deleted of deletedById.values()) {
      const baseRev = worktree.baseline[deleted.unitId];
      const trunk = trunkById.get(deleted.unitId);
      const baseStale = baseRev !== undefined && trunk !== undefined && trunk.headRev > baseRev;
      units.push({
        unitId: deleted.unitId,
        type: deleted.type as UnitType,
        name: deleted.name,
        status: baseStale ? "conflict" : "deleted",
        ...(baseRev === undefined ? {} : { baseRev }),
        ...(trunk === undefined ? {} : { trunkRev: trunk.headRev }),
        baseStale,
      });
    }
    return {
      worktreeId,
      mergeable: units.every((unit) => unit.status !== "conflict"),
      diverged: units.some((unit) => unit.baseStale),
      units,
      conflicts: units.filter((unit) => unit.status === "conflict").map((unit) => unit.unitId),
    };
  }

  public async getMergePreviewUnit(
    worktreeId: string,
    unitId: string,
  ): Promise<MergePreviewUnitData> {
    const unit = this.worktreeUnits(worktreeId).find((candidate) => candidate.unitId === unitId);
    if (!unit) {
      const deleted = this.runtime.worktreeAdapter
        .listDeletedUnits(worktreeId)
        .find((candidate) => candidate.unitId === unitId);
      if (deleted) {
        return {
          type: deleted.type,
          changesets: [],
          error: `Unit ${unitId} is deleted in Worktree ${worktreeId}`,
        };
      }
      throw new Error(`Unit ${unitId} is not part of Worktree ${worktreeId}`);
    }
    const result = await this.runtime.worktreeService.getUnit(
      {
        worktreeID: worktreeId,
        unitID: unitId,
        type: unit.type,
        revision: 0,
      },
      callOptions("local"),
    );
    const sheetBlocks =
      unit.type === UniverType.UNIVER_SHEET
        ? await this._readWorktreeSheetBlocks(worktreeId, unitId, result.snapshot)
        : undefined;
    return {
      type: unit.type,
      snapshot: result.snapshot,
      ...(sheetBlocks === undefined ? {} : { sheetBlocks }),
      changesets: [...result.changesets],
    };
  }

  public async submit(
    _unitId: string,
    _type: number,
    changeset: IProtocolChangeset,
  ): Promise<ApplyResult> {
    const result = await this.runtime.trunkService.submitChangeset(
      { changeset },
      callOptions(changeset.userID || "local"),
    );
    if (result.status === "committed") {
      return {
        success: true,
        currentRevision: result.changeset.revision,
      };
    }
    if (result.status === "already-committed") {
      return {
        success: false,
        currentRevision: result.changeset.revision,
        isCsDeduplicate: true,
      };
    }
    if ("error" in result) {
      return {
        success: false,
        currentRevision: changeset.baseRev,
        isConflictError: result.error.code === "OT_CONFLICT",
        error: result.error,
      };
    }
    throw new Error(`unknown changeset result: ${result.status}`);
  }

  public handleSdkRequest(
    request: IncomingMessage,
    response: ServerResponse,
    sdkUrl: string,
  ): void {
    this.runtime.handleRequest(request, response, sdkUrl);
  }

  public handleSdkUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    sdkUrl: string,
  ): void {
    this.runtime.handleUpgrade(request, socket, head, sdkUrl);
  }

  public dispose(): Promise<void> {
    return this.runtime.dispose();
  }

  public getCurrentRev(unitId: string): number | undefined {
    return this.listUnits().find((unit) => unit.unitId === unitId)?.headRev;
  }

  public hasUnit(unitId: string): boolean {
    return this.getCurrentRev(unitId) !== undefined;
  }

  public storeAsset(input: {
    readonly unitId: string;
    readonly worktreeId?: string;
    readonly originalFilename: string;
    readonly mediaType: string;
    readonly bytes: Uint8Array;
  }): UniverfileAssetRecord {
    if (input.worktreeId === undefined) {
      if (!this.hasUnit(input.unitId)) throw new CollabGatewayAssetScopeNotFoundError();
    } else {
      let worktree: WorktreeRecord;
      try {
        worktree = requireWorktree(this.runtime, input.worktreeId);
        this._requireWorktreeUnit(input.worktreeId, input.unitId);
      } catch {
        throw new CollabGatewayAssetScopeNotFoundError();
      }
      if (worktree.status !== "draft") {
        throw new CollabGatewayAssetScopeNotFoundError();
      }
    }
    return this.runtime.assetStore.store(input);
  }

  public openAsset(assetId: string, worktreeId?: string): UniverfileOpenedAsset | null {
    const opened = this.runtime.assetStore.open(assetId);
    if (opened === null) return null;
    if (worktreeId === undefined) {
      if (opened.record.worktreeId !== null || !this.hasUnit(opened.record.unitId)) return null;
      return opened;
    }
    if (opened.record.worktreeId !== null && opened.record.worktreeId !== worktreeId) {
      return null;
    }
    try {
      requireWorktree(this.runtime, worktreeId);
      this._requireWorktreeUnit(worktreeId, opened.record.unitId);
    } catch {
      return null;
    }
    return opened;
  }

  public getConfirmedChangeset(unitId: string, revision: number): IProtocolChangeset | undefined {
    return this.runtime.trunkAdapter.getChangeset(unitId, revision);
  }

  public getConfirmedChangesetBySid(
    unitId: string,
    sid: string,
    reqId: number,
  ): IProtocolChangeset | undefined {
    return this.runtime.trunkAdapter.getChangesetBySid(unitId, sid, reqId);
  }

  public hasConnections(): boolean {
    return this.runtime.hasConnections();
  }

  private _requireWorktreeUnit(worktreeId: string, unitId: string): UniverfileWorktreeUnitSummary {
    const unit = this.worktreeUnits(worktreeId).find((candidate) => candidate.unitId === unitId);
    if (!unit) {
      throw new Error(`Unit ${unitId} is not part of Worktree ${worktreeId}`);
    }
    return unit;
  }

  private _externalizeImages(value: object, unitId: string, worktreeId?: string): object;
  private _externalizeImages(value: unknown, unitId: string, worktreeId?: string): unknown;
  private _externalizeImages(value: unknown, unitId: string, worktreeId?: string): unknown {
    return externalizeEmbeddedImages(value, {
      store: ({ bytes, filename, mediaType }) =>
        this.runtime.assetStore.store({
          unitId,
          ...(worktreeId === undefined ? {} : { worktreeId }),
          originalFilename: filename,
          mediaType,
          bytes,
          reuseInScope: true,
        }).assetId,
    });
  }

  private async _readWorktreeSheetBlocks(
    worktreeId: string,
    unitId: string,
    snapshot: ISnapshot,
  ): Promise<IDeserializedSheetBlock[]> {
    const blockIDs = Object.values(snapshot.workbook?.blockMeta ?? {}).flatMap(
      (meta) => meta.blocks,
    );
    const blocks = await Promise.all(
      blockIDs.map(async (blockID) => {
        const result = await this.runtime.worktreeService.getSheetBlock(
          {
            worktreeID: worktreeId,
            unitID: unitId,
            type: UniverType.UNIVER_SHEET,
            blockID,
          },
          callOptions("local"),
        );
        if (!result.block) return undefined;
        return {
          id: result.block.id,
          startRow: result.block.startRow,
          endRow: result.block.endRow,
          data: JSON.parse(new TextDecoder().decode(result.block.data)) as object,
        };
      }),
    );
    return blocks.filter((block): block is IDeserializedSheetBlock => block !== undefined);
  }
}

class TrunkStorageCompatibility {
  public constructor(private readonly _runtime: GatewayFileRuntime) {}

  public async getUnitOnRev(
    _context: unknown,
    request: {
      readonly unitID: string;
      readonly type: number;
      readonly revision: number;
    },
  ): Promise<{
    error: { code: number; message: string };
    snapshot?: ISnapshot;
    changesets: readonly IProtocolChangeset[];
  }> {
    try {
      const result = await this._runtime.trunkService.getUnit(
        {
          unitID: request.unitID,
          type: request.type as UniverType,
          revision: request.revision,
        },
        callOptions("local"),
      );
      return {
        error: { code: 1, message: "" },
        snapshot: result.snapshot,
        changesets: result.changesets,
      };
    } catch (error) {
      return {
        error: { code: 0, message: asMessage(error) },
        changesets: [],
      };
    }
  }

  public async fetchMissingChangesets(
    _context: unknown,
    request: {
      readonly unitID: string;
      readonly type: number;
      readonly from: number;
      readonly to: number;
    },
  ): Promise<{
    error: { code: number; message: string };
    changesets: readonly IProtocolChangeset[];
    latestRevision: number;
  }> {
    try {
      const result = await this._runtime.trunkService.getChangesets(
        {
          unitID: request.unitID,
          type: request.type as UniverType,
          from: request.from,
          to: request.to,
        },
        callOptions("local"),
      );
      return {
        error: { code: 1, message: "" },
        changesets: result.changesets,
        latestRevision: result.latestRevision,
      };
    } catch (error) {
      return {
        error: { code: 0, message: asMessage(error) },
        changesets: [],
        latestRevision: 0,
      };
    }
  }

  public async getSheetBlock(
    _context: unknown,
    request: {
      readonly unitID: string;
      readonly type: number;
      readonly blockID: string;
    },
  ): Promise<{
    error: { code: number; message: string };
    block?: unknown;
  }> {
    try {
      const result = await this._runtime.trunkService.getSheetBlock(
        {
          unitID: request.unitID,
          type: request.type as UniverType,
          blockID: request.blockID,
        },
        callOptions("local"),
      );
      return {
        error: { code: 1, message: "" },
        ...(result.block === null ? {} : { block: result.block }),
      };
    } catch (error) {
      return { error: { code: 0, message: asMessage(error) } };
    }
  }

  public async getDeserializedSheetBlock(
    context: unknown,
    request: {
      readonly unitID: string;
      readonly type: number;
      readonly blockID: string;
    },
  ): Promise<{
    error: { code: number; message: string };
    block?: unknown;
  }> {
    const result = await this.getSheetBlock(context, request);
    const block = result.block as { readonly data?: Uint8Array } | undefined;
    if (!block?.data) return result;
    try {
      return {
        ...result,
        block: {
          ...block,
          data: JSON.parse(new TextDecoder().decode(block.data)),
        },
      };
    } catch {
      return result;
    }
  }
}

class WorktreeCatalogCompatibility {
  public constructor(private readonly _runtime: GatewayFileRuntime) {}

  public getWorktree(worktreeId: string): WorktreeRecord | undefined {
    const row = this._runtime.worktreeAdapter
      .listWorktrees()
      .find((worktree) => worktree.worktreeId === worktreeId);
    return row ? toWorktreeRecord(row) : undefined;
  }
}

function callOptions(
  userId: string,
  customData: Record<string, unknown> = {},
): CollabMemberContext {
  return {
    memberID: `gateway-${randomUUID()}`,
    userID: userId,
    customData,
  };
}

function databaseContext(options: CollabMemberContext): DatabaseContext {
  return {
    userID: options.userID,
    customData: options.customData ?? {},
    request: {},
  };
}

function toProtocolMutation(
  mutation: IMutation,
  rewriteParams: (params: unknown) => unknown = (params) => params,
): IMutation {
  const input = mutation as IMutation & { readonly params?: unknown };
  if (typeof input.data === "string") {
    try {
      return {
        id: input.id,
        data: JSON.stringify(rewriteParams(JSON.parse(input.data) as unknown)),
      };
    } catch {
      return { id: input.id, data: input.data };
    }
  }
  return { id: input.id, data: JSON.stringify(rewriteParams(input.params ?? input.data ?? {})) };
}

function withInitialIdentity(raw: object, unitId: string): CreateUnitFromDataInput["data"] {
  return {
    ...raw,
    id: unitId,
    rev: INITIAL_REVISION,
  } as CreateUnitFromDataInput["data"];
}

function requireWorktree(runtime: GatewayFileRuntime, worktreeId: string): WorktreeRecord {
  const row = runtime.worktreeAdapter
    .listWorktrees()
    .find((worktree) => worktree.worktreeId === worktreeId);
  if (!row) {
    throw new Error(`Worktree ${worktreeId} not found`);
  }
  return toWorktreeRecord(row);
}

function toWorktreeRecord(row: UniverfileWorktreeSummary): WorktreeRecord {
  return {
    worktreeId: row.worktreeId,
    status: row.status === "merging" ? "ready" : row.status,
    agentId: row.agentId,
    name: row.name,
    baseline: { ...row.baseline },
    createdAt: row.createdAt,
    ...(row.mergedAt === undefined ? {} : { mergedAt: row.mergedAt }),
  };
}

function newUnitId(): string {
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readSnapshotUnitName(snapshot: ISnapshot | undefined): string | undefined {
  return (
    snapshot?.workbook?.name ??
    snapshot?.doc?.name ??
    snapshot?.slide?.name ??
    snapshot?.board?.name
  );
}

function newWorktreeId(): string {
  return `wt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function errorUnitId(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const details = (error as { readonly details?: unknown }).details;
  if (!details || typeof details !== "object") return undefined;
  const unitID = (details as { readonly unitID?: unknown }).unitID;
  return typeof unitID === "string" ? unitID : undefined;
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
