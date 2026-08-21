import type { UniverHistoryService } from "@univerjs-pro/collaboration-history-service";
import type {
  UniverfileSQLiteDatabaseAdapter,
  UniverfileSQLiteHistoryDatabaseAdapter,
  UniverfileUnitSummary,
} from "../univerfile-sqlite/index.js";

interface ReconcileHistoryOptions {
  readonly trunkAdapter: UniverfileSQLiteDatabaseAdapter;
  readonly historyAdapter: UniverfileSQLiteHistoryDatabaseAdapter;
  readonly historyService: UniverHistoryService;
}

/** Bring the rebuildable History index to every authoritative trunk head. */
export async function reconcileUniverfileHistory(options: ReconcileHistoryOptions): Promise<void> {
  for (const unit of options.trunkAdapter.listUnits()) {
    await reconcileUnit(options, unit, false);
  }
}

async function reconcileUnit(
  options: ReconcileHistoryOptions,
  unit: UniverfileUnitSummary,
  rebuilding: boolean,
): Promise<void> {
  let state;
  try {
    state = await options.historyAdapter.getIndexState(unit.unitId);
  } catch (error) {
    if (rebuilding) throw error;
    options.historyAdapter.resetUnit(unit.unitId);
    await reconcileUnit(options, unit, true);
    return;
  }

  if (
    state !== null &&
    (state.type !== unit.type || state.latestRevision > unit.headRev)
  ) {
    if (rebuilding) {
      throw new Error(`History index for ${unit.unitId} could not be reconciled`);
    }
    options.historyAdapter.resetUnit(unit.unitId);
    await reconcileUnit(options, unit, true);
    return;
  }
  if (state?.latestRevision === unit.headRev) return;

  let previousCommittedAt = parseCreatedAt(unit.createdAt);
  let nextRevision = state?.latestRevision === undefined ? 1 : state.latestRevision + 1;
  if (state !== null) {
    const previous = await options.historyAdapter.getRevision(unit.unitId, state.latestRevision);
    if (previous === null) {
      if (rebuilding) throw new Error(`History index for ${unit.unitId} contains a revision gap`);
      options.historyAdapter.resetUnit(unit.unitId);
      await reconcileUnit(options, unit, true);
      return;
    }
    previousCommittedAt = previous.committedAt;
  }

  if (nextRevision === 1) {
    const firstChangeset = unit.headRev >= 2 ? options.trunkAdapter.getChangeset(unit.unitId, 2) : undefined;
    await options.historyService.indexUnitCreated(
      {
        unitID: unit.unitId,
        type: unit.type,
        createdAt: previousCommittedAt,
      },
      { userID: firstChangeset?.userID || "local", customData: {} },
    );
    nextRevision = 2;
  }

  for (let revision = nextRevision; revision <= unit.headRev; revision += 1) {
    const changeset = options.trunkAdapter.getChangeset(unit.unitId, revision);
    if (changeset === undefined) {
      if (rebuilding) {
        throw new Error(`Trunk changeset ${unit.unitId}@${revision} is missing`);
      }
      options.historyAdapter.resetUnit(unit.unitId);
      await reconcileUnit(options, unit, true);
      return;
    }
    const committedAt = resolveCommittedAt(changeset.createTime, previousCommittedAt);
    await options.historyService.indexChangeset(
      { changeset, committedAt },
      { userID: changeset.userID || "local", customData: {} },
    );
    previousCommittedAt = committedAt;
  }
}

function parseCreatedAt(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isSafeInteger(timestamp) && timestamp >= 0 ? timestamp : 0;
}

function resolveCommittedAt(value: number | undefined, previous: number): number {
  if (value !== undefined && Number.isSafeInteger(value) && value >= previous) return value;
  return previous + 1;
}
