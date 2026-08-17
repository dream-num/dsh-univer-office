import type { SnapshotService } from "@univerjs-pro/collaboration";
import type {
  IEmbedResourceRefEnsureUnitInput,
  IEmbedResourceRefUnitProviderRegistration,
} from "@univerjs-pro/embed";
import { UniverInstanceType } from "@univerjs/core";

export const LOCAL_REFERENCED_UNIT_PROVIDER_ID = "local-referenced-unit-provider";

interface LoadedUnit {
  readonly type: UniverInstanceType;
  getUnitId(): string;
}

interface SnapshotLoader {
  loadSheet: SnapshotService["loadSheet"];
  loadDoc: SnapshotService["loadDoc"];
  loadSlide: SnapshotService["loadSlide"];
  loadBase: SnapshotService["loadBase"];
  loadBoard: SnapshotService["loadBoard"];
}

export function createLocalReferencedUnitProviderRegistration(input: {
  readonly resolveSnapshotService: () => SnapshotLoader;
}): IEmbedResourceRefUnitProviderRegistration {
  return {
    match: {
      fileKinds: ["self"],
      unitTypes: ["sheet", "doc", "slide", "base", "board"],
    },
    priority: 100,
    provider: {
      ensureUnit: async (ensureInput) => await ensureReferencedUnit(ensureInput, input),
    },
    registrationId: LOCAL_REFERENCED_UNIT_PROVIDER_ID,
  };
}

async function ensureReferencedUnit(
  ensureInput: IEmbedResourceRefEnsureUnitInput,
  input: { readonly resolveSnapshotService: () => SnapshotLoader },
): Promise<{ readonly unitId: string; readonly unitType: UniverInstanceType }> {
  assertNotAborted(ensureInput.signal);
  if (ensureInput.ref.file.kind !== "self") {
    throw providerError(
      "LOCAL_RUNTIME_RESOURCE_REF_FILE_NOT_SUPPORTED",
      "Local referenced Units require a same-Univerfile ResourceRef",
    );
  }
  const unitId = ensureInput.ref.unit.selector;
  if (ensureInput.ref.unit.type !== resourceTypeOf(ensureInput.unitType)) {
    throw providerError(
      "LOCAL_RUNTIME_RESOURCE_REF_UNIT_TYPE_MISMATCH",
      "ResourceRef Unit type does not match the requested Unit type",
    );
  }

  const options = { createOptions: ensureInput.createOptions };
  const snapshot = input.resolveSnapshotService();
  let loaded: LoadedUnit;
  switch (ensureInput.unitType) {
    case UniverInstanceType.UNIVER_SHEET:
      loaded = await snapshot.loadSheet(unitId, 0, undefined, options);
      break;
    case UniverInstanceType.UNIVER_DOC:
      loaded = await snapshot.loadDoc(unitId, 0, undefined, options);
      break;
    case UniverInstanceType.UNIVER_SLIDE:
      loaded = await snapshot.loadSlide(unitId, 0, undefined, options);
      break;
    case UniverInstanceType.UNIVER_BASE:
      loaded = await snapshot.loadBase(unitId, 0, undefined, options);
      break;
    case UniverInstanceType.UNIVER_BOARD:
      loaded = await snapshot.loadBoard(unitId, 0, undefined, options);
      break;
    default:
      throw providerError(
        "LOCAL_RUNTIME_RESOURCE_REF_UNIT_TYPE_NOT_SUPPORTED",
        "Referenced Unit type is not supported by the Local runtime",
      );
  }
  assertNotAborted(ensureInput.signal);
  if (loaded.getUnitId() !== unitId || loaded.type !== ensureInput.unitType) {
    throw providerError(
      "LOCAL_RUNTIME_RESOURCE_REF_UNIT_IDENTITY_MISMATCH",
      "Snapshot materialized a different referenced Unit",
    );
  }
  return { unitId, unitType: ensureInput.unitType };
}

function resourceTypeOf(unitType: UniverInstanceType): string {
  switch (unitType) {
    case UniverInstanceType.UNIVER_SHEET:
      return "sheet";
    case UniverInstanceType.UNIVER_DOC:
      return "doc";
    case UniverInstanceType.UNIVER_SLIDE:
      return "slide";
    case UniverInstanceType.UNIVER_BASE:
      return "base";
    case UniverInstanceType.UNIVER_BOARD:
      return "board";
    default:
      throw providerError(
        "LOCAL_RUNTIME_RESOURCE_REF_UNIT_TYPE_NOT_SUPPORTED",
        "Referenced Unit type is not supported by the Local runtime",
      );
  }
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted !== true) return;
  throw providerError("LOCAL_RUNTIME_RESOURCE_REF_ABORTED", "Referenced Unit loading was aborted");
}

function providerError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}
