import type { ILogContext, ISnapshotServerService } from "@univerjs-pro/collaboration";
import type {
  ICopyFileMetaRequest,
  ICopyFileMetaResponse,
  IFetchMissingChangesetsRequest,
  IFetchMissingChangesetsResponse,
  IGetDeserializedSheetBlockResponse,
  IGetLatestCsReqIdBySidRequest,
  IGetLatestCsReqIdBySidResponse,
  IGetResourcesRequest,
  IGetResourcesResponse,
  IGetSheetBlockRequest,
  IGetSheetBlockResponse,
  IGetUnitOnRevRequest,
  IGetUnitOnRevResponse,
  ISaveChangesetRequest,
  ISaveChangesetResponse,
  ISaveSheetBlockRequest,
  ISaveSheetBlockResponse,
  ISaveSnapshotRequest,
  ISaveSnapshotResponse,
} from "@univerjs/protocol";

export class LocalSnapshotServerAdapter implements ISnapshotServerService {
  private readonly _snapshotServerUrl: URL;

  public constructor(snapshotServerUrl: string) {
    this._snapshotServerUrl = absoluteHttpUrl(snapshotServerUrl);
  }

  public async getUnitOnRev(
    _context: ILogContext,
    params: IGetUnitOnRevRequest,
  ): Promise<IGetUnitOnRevResponse> {
    const response = await this._get<IGetUnitOnRevResponse>(
      appendPath(
        this._snapshotServerUrl,
        params.type,
        "unit",
        params.unitID,
        "rev",
        params.revision,
      ),
    );
    decodeSnapshotMetadata(response.snapshot);
    return response;
  }

  public async getSheetBlock(
    _context: ILogContext,
    params: IGetSheetBlockRequest,
  ): Promise<IGetSheetBlockResponse> {
    const response = await this._get<IGetSheetBlockResponse>(
      appendPath(
        this._snapshotServerUrl,
        params.type,
        "unit",
        params.unitID,
        "block",
        params.blockID,
      ),
    );
    if (response.block !== undefined && typeof response.block.data === "string") {
      response.block.data = decodeBase64(response.block.data);
    }
    return response;
  }

  public async getDeserializedSheetBlock(
    _context: ILogContext,
    params: IGetSheetBlockRequest,
  ): Promise<IGetDeserializedSheetBlockResponse | IGetSheetBlockResponse> {
    return await this._get<IGetDeserializedSheetBlockResponse | IGetSheetBlockResponse>(
      appendPath(
        this._snapshotServerUrl,
        "block",
        params.type,
        "unit",
        params.unitID,
        "block",
        params.blockID,
      ),
    );
  }

  public async fetchMissingChangesets(
    _context: ILogContext,
    params: IFetchMissingChangesetsRequest,
  ): Promise<IFetchMissingChangesetsResponse> {
    const url = appendPath(
      this._snapshotServerUrl,
      params.type,
      "unit",
      params.unitID,
      "fetchmissing",
    );
    url.searchParams.set("from", String(params.from));
    url.searchParams.set("to", String(params.to));
    return await this._get<IFetchMissingChangesetsResponse>(url);
  }

  public async getResourcesRequest(
    _context: ILogContext,
    params: IGetResourcesRequest,
  ): Promise<IGetResourcesResponse> {
    const url = appendPath(
      this._snapshotServerUrl,
      params.type,
      "unit",
      params.unitID,
      "resources",
    );
    url.searchParams.set("resourceId", JSON.stringify(params.resourceIDs));
    return await this._get<IGetResourcesResponse>(url);
  }

  public async saveSnapshot(
    _context: ILogContext,
    _params: ISaveSnapshotRequest,
  ): Promise<ISaveSnapshotResponse> {
    throw readOnlyError();
  }

  public async updateSnapshot(
    _context: ILogContext,
    _params: ISaveSnapshotRequest,
  ): Promise<ISaveSnapshotResponse> {
    throw readOnlyError();
  }

  public async saveSheetBlock(
    _context: ILogContext,
    _params: ISaveSheetBlockRequest,
  ): Promise<ISaveSheetBlockResponse> {
    throw readOnlyError();
  }

  public async saveChangeset(
    _context: ILogContext,
    _params: ISaveChangesetRequest,
  ): Promise<ISaveChangesetResponse> {
    throw readOnlyError();
  }

  public async copyFileMeta(
    _context: ILogContext,
    _params: ICopyFileMetaRequest,
  ): Promise<ICopyFileMetaResponse> {
    throw readOnlyError();
  }

  public async getLatestCsReqIdBySid(
    _context: ILogContext,
    _params: IGetLatestCsReqIdBySidRequest,
  ): Promise<IGetLatestCsReqIdBySidResponse> {
    throw readOnlyError();
  }

  private async _get<T>(url: URL): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, { method: "GET" });
    } catch (error) {
      throw snapshotError("Snapshot request failed", error);
    }
    if (!response.ok) {
      throw snapshotError(`Snapshot request failed with status ${response.status}`);
    }
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw snapshotError("Snapshot response is not valid JSON", error);
    }
  }
}

function absoluteHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw snapshotError("Snapshot server URL must be absolute", error);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw snapshotError("Snapshot server URL must use HTTP or HTTPS");
  }
  return url;
}

function appendPath(base: URL, ...segments: readonly (number | string)[]): URL {
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/\/$/u, "")}/${segments
    .map((segment) => encodeURIComponent(String(segment)))
    .join("/")}`;
  return url;
}

function decodeSnapshotMetadata(snapshot: IGetUnitOnRevResponse["snapshot"]): void {
  if (snapshot === undefined) return;
  decodeOriginalMeta(snapshot.workbook);
  decodeOriginalMeta(snapshot.doc);
  decodeOriginalMeta(snapshot.slide);
  decodeOriginalMeta(snapshot.board);
  const sheets = snapshot.workbook?.sheets;
  if (sheets === undefined) return;
  for (const sheet of Object.values(sheets)) decodeOriginalMeta(sheet);
}

function decodeOriginalMeta(value: unknown): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  if (typeof record["originalMeta"] === "string") {
    record["originalMeta"] = decodeBase64(record["originalMeta"]);
  }
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function readOnlyError(): Error {
  return Object.assign(new Error("Referenced Units are read-only in the Local runtime"), {
    code: "LOCAL_RUNTIME_RESOURCE_REF_UNIT_READ_ONLY",
  });
}

function snapshotError(message: string, cause?: unknown): Error {
  return Object.assign(new Error(message, cause === undefined ? undefined : { cause }), {
    code: "LOCAL_RUNTIME_SNAPSHOT_ERROR",
  });
}
