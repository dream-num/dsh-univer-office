import { randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import { inflateRawSync } from "node:zlib";
import { UniverInstanceType } from "@univerjs/core";
import {
  BaseExportMode,
  BaseFormulaPolicy,
  BaseImportMode,
  DocxCompatibilityMode,
  ExchangeError,
  ExchangeFormat,
  FormulaCalculationMode,
  exportSnapshotToBuffer,
  importBuffer,
  importBufferToSnapshot,
  type BufferImportOptions,
  type ExportOptions,
  type ISnapshotWithBlocks,
} from "@univerjs-pro/exchange-node";
import { ErrorCode, UniverType, type ISheetBlock, type ISnapshot } from "@univerjs/protocol";
import type { CollabService } from "../collab-service.js";

export const MAX_EXCHANGE_FILE_BYTES = 50 * 1024 * 1024;
const ARTIFACT_TTL_MS = 2 * 60 * 60 * 1000;
const OK = { code: ErrorCode.OK, message: "" } as const;

type ExchangeUnitType = Exclude<UniverType, UniverType.UNIVER_BOARD>;

interface ExchangeArtifact {
  readonly id: string;
  readonly filename: string;
  readonly mediaType: string;
  readonly bytes: Buffer;
  readonly expiresAt: number;
}

type ExchangeTaskState =
  | { readonly kind: "import" | "export"; readonly status: "pending" }
  | {
      readonly kind: "import";
      readonly status: "done";
      readonly result: {
        readonly outputType: 1 | 2;
        readonly unitID: string;
        readonly jsonID: string;
      };
    }
  | {
      readonly kind: "export";
      readonly status: "done";
      readonly result: { readonly fileID: string; readonly fileUrl: string };
    }
  | {
      readonly kind: "import" | "export";
      readonly status: "failed";
      readonly message: string;
    };

type ExchangeTask = ExchangeTaskState & { readonly id: string; readonly expiresAt: number };
type ExchangeTaskCompletion = Extract<ExchangeTaskState, { readonly status: "done" }>;

export interface ExchangeOpenedFile {
  readonly filename: string;
  readonly mediaType: string;
  readonly bytes: Buffer;
}

/** Per-Univerfile implementation of the Universer exchange task and artifact protocol. */
export class GatewayExchangeService {
  private readonly _artifacts = new Map<string, ExchangeArtifact>();
  private readonly _tasks = new Map<string, ExchangeTask>();
  private readonly _runningTasks = new Set<Promise<void>>();
  private _disposed = false;

  public constructor(private readonly _collab: CollabService) {}

  public upload(input: {
    readonly size: unknown;
    readonly flate: unknown;
    readonly filename: string;
    readonly mediaType: string;
    readonly bytes: Uint8Array;
  }): { readonly FileId: string; readonly error: typeof OK } {
    this._assertRunning();
    const expectedSize = validSize(input.size);
    const flate = validBooleanQuery(input.flate);
    if (!input.filename || input.filename.length > 1024) {
      throw new ExchangeHttpError(400, "The uploaded filename is invalid.");
    }
    const bytes = flate ? inflateRawSync(input.bytes) : Buffer.from(input.bytes);
    if (bytes.byteLength !== expectedSize) {
      throw new ExchangeHttpError(400, "Uploaded file size does not match size query parameter.");
    }
    const artifact = this._saveArtifact({
      filename: input.filename,
      mediaType: input.mediaType || "application/octet-stream",
      bytes,
    });
    return { FileId: artifact.id, error: OK };
  }

  public importFile(
    typeValue: unknown,
    inputValue: unknown,
    onUnitCreated: (unit: { unitId: string; type: ExchangeUnitType; name: string }) => void,
  ): { readonly error: typeof OK; readonly taskID: string } {
    this._assertRunning();
    this._removeExpired();
    const input = validImportRequest(inputValue);
    const artifact = this._requireArtifact(input.fileID);
    const unitType =
      typeValue === "auto"
        ? unitTypeFromFilename(artifact.filename)
        : unitTypeFromProtocol(typeValue);
    const taskID = this._startTask("import", async () => {
      const importOptions = exchangeImportOptions(unitType, artifact.filename, input.options);
      if (input.outputType === 2) {
        const converted = await importBufferToSnapshot(artifact.bytes, importOptions);
        const json = Buffer.from(JSON.stringify(snapshotToJson(converted)));
        const output = this._saveArtifact({
          filename: `${stripExtension(artifact.filename)}.json`,
          mediaType: "application/json",
          bytes: json,
        });
        return {
          kind: "import",
          status: "done",
          result: { outputType: 2, unitID: "", jsonID: output.id },
        };
      }

      const data = await importUnitData(artifact.bytes, importOptions);
      const name = importedName(data, artifact.filename);
      const created = await this._collab.createUnit(unitType, { data, name });
      onUnitCreated({ unitId: created.unitId, type: unitType, name });
      return {
        kind: "import",
        status: "done",
        result: { outputType: 1, unitID: created.unitId, jsonID: "" },
      };
    });
    return { error: OK, taskID };
  }

  public exportFile(
    typeValue: unknown,
    inputValue: unknown,
  ): { readonly error: typeof OK; readonly taskID: string } {
    this._assertRunning();
    this._removeExpired();
    const unitType = unitTypeFromProtocol(typeValue);
    const input = validExportRequest(inputValue, unitType);
    if (input.unitID !== null) {
      const unit = this._collab.listUnits().find((candidate) => candidate.unitId === input.unitID);
      if (unit === undefined || unit.type !== unitType) throw notFound();
    } else {
      this._requireArtifact(input.jsonID!);
    }
    const taskID = this._startTask("export", async () => {
      let aggregate: ISnapshotWithBlocks;
      let name = "univer-export";
      if (input.unitID !== null) {
        aggregate = await this._collab.materializeUnit(input.unitID, unitType);
        name =
          this._collab.listUnits().find((candidate) => candidate.unitId === input.unitID)?.name ??
          name;
      } else {
        const artifact = this._requireArtifact(input.jsonID!);
        aggregate = snapshotFromJson(JSON.parse(artifact.bytes.toString("utf8")) as unknown);
        name = stripExtension(artifact.filename);
      }
      const output = await exportSnapshotToBuffer(
        aggregate,
        exchangeExportOptions(unitType, input.format, input.options),
      );
      const artifact = this._saveArtifact({
        filename: `${safeFilename(name)}.${input.format}`,
        mediaType: mediaType(input.format),
        bytes: Buffer.from(output),
      });
      return {
        kind: "export",
        status: "done",
        result: { fileID: artifact.id, fileUrl: "" },
      };
    });
    return { error: OK, taskID };
  }

  public getTask(taskId: string): Readonly<Record<string, unknown>> {
    this._removeExpired();
    const task = this._tasks.get(taskId);
    if (task === undefined) {
      return {
        error: { code: ErrorCode.NOT_FOUND, message: "The exchange task was not found." },
        taskID: taskId,
        status: "failed",
      };
    }
    if (task.status === "pending") return { error: OK, taskID: task.id, status: "pending" };
    if (task.status === "failed") {
      return {
        error: { code: ErrorCode.INTERNAL_ERROR, message: task.message },
        taskID: task.id,
        status: "failed",
      };
    }
    return task.kind === "import"
      ? { error: OK, taskID: task.id, status: "done", import: task.result }
      : { error: OK, taskID: task.id, status: "done", export: task.result };
  }

  public signUrl(
    fileId: string,
    contentPath: string,
  ): {
    readonly error: typeof OK;
    readonly url: string;
    readonly mode: 1;
  } | null {
    this._removeExpired();
    return this._artifacts.has(fileId) ? { error: OK, url: contentPath, mode: 1 } : null;
  }

  public openFile(fileId: string): ExchangeOpenedFile | null {
    this._removeExpired();
    const artifact = this._artifacts.get(fileId);
    return artifact === undefined
      ? null
      : { filename: artifact.filename, mediaType: artifact.mediaType, bytes: artifact.bytes };
  }

  public async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    await Promise.allSettled([...this._runningTasks]);
    this._artifacts.clear();
    this._tasks.clear();
  }

  private _saveArtifact(input: {
    readonly filename: string;
    readonly mediaType: string;
    readonly bytes: Buffer;
  }): ExchangeArtifact {
    if (input.bytes.byteLength > MAX_EXCHANGE_FILE_BYTES) throw payloadTooLarge();
    this._removeExpired();
    const artifact: ExchangeArtifact = {
      id: randomUUID(),
      filename: input.filename,
      mediaType: input.mediaType,
      bytes: input.bytes,
      expiresAt: Date.now() + ARTIFACT_TTL_MS,
    };
    this._artifacts.set(artifact.id, artifact);
    return artifact;
  }

  private _requireArtifact(fileId: string): ExchangeArtifact {
    const artifact = this._artifacts.get(fileId);
    if (artifact === undefined) throw notFound();
    return artifact;
  }

  private _startTask(
    kind: "import" | "export",
    execute: () => Promise<ExchangeTaskCompletion>,
  ): string {
    const id = randomUUID();
    this._tasks.set(id, { id, kind, status: "pending", expiresAt: Date.now() + ARTIFACT_TTL_MS });
    const running = execute()
      .then(
        (task) => this._tasks.set(id, { ...task, id, expiresAt: Date.now() + ARTIFACT_TTL_MS }),
        (error: unknown) => {
          this._tasks.set(id, {
            id,
            kind,
            status: "failed",
            message: exchangeMessage(error),
            expiresAt: Date.now() + ARTIFACT_TTL_MS,
          });
        },
      )
      .then(() => undefined)
      .finally(() => this._runningTasks.delete(running));
    this._runningTasks.add(running);
    return id;
  }

  private _removeExpired(): void {
    const now = Date.now();
    for (const artifact of this._artifacts.values()) {
      if (artifact.expiresAt <= now) this._artifacts.delete(artifact.id);
    }
    for (const task of this._tasks.values()) {
      if (task.expiresAt <= now) this._tasks.delete(task.id);
    }
  }

  private _assertRunning(): void {
    if (this._disposed) throw new Error("Gateway exchange service is disposed.");
  }
}

export class ExchangeHttpError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function validImportRequest(value: unknown): {
  readonly fileID: string;
  readonly outputType: 1 | 2;
  readonly options: unknown;
} {
  const record = requireRecord(value);
  if (typeof record.fileID !== "string" || !record.fileID) {
    throw new ExchangeHttpError(400, "fileID is required.");
  }
  if (record.outputType !== 1 && record.outputType !== 2) {
    throw new ExchangeHttpError(400, "outputType must be UNIT (1) or JSON (2).");
  }
  return { fileID: record.fileID, outputType: record.outputType, options: record.options };
}

function validExportRequest(
  value: unknown,
  unitType: ExchangeUnitType,
): {
  readonly unitID: string | null;
  readonly jsonID: string | null;
  readonly format: ExchangeFormat;
  readonly options: unknown;
} {
  const record = requireRecord(value);
  const unitID = optionalId(record.unitID, "unitID");
  const jsonID = optionalId(record.jsonID, "jsonID");
  if ((unitID === null) === (jsonID === null)) {
    throw new ExchangeHttpError(400, "Exactly one of unitID or jsonID is required.");
  }
  return {
    unitID,
    jsonID,
    format: validExportFormat(record.format, unitType),
    options: record.options,
  };
}

function exchangeImportOptions(
  unitType: ExchangeUnitType,
  filename: string,
  value: unknown,
): BufferImportOptions {
  const options = optionalRecord(value);
  const sheet = optionalRecord(options?.sheet);
  const base = optionalRecord(options?.base);
  const baseXlsx = optionalRecord(base?.xlsx);
  const doc = optionalRecord(options?.doc);
  if (unitType === UniverType.UNIVER_BASE) {
    return {
      type: UniverInstanceType.UNIVER_BASE,
      fileName: filename,
      ...optionalMappedValue("mode", baseXlsx?.baseMode, "baseMode", baseImportMode),
      ...optionalMappedValue(
        "formulaPolicy",
        baseXlsx?.baseFormulaPolicy,
        "baseFormulaPolicy",
        baseFormulaPolicy,
      ),
    };
  }
  if (unitType === UniverType.UNIVER_DOC) {
    return {
      type: UniverInstanceType.UNIVER_DOC,
      fileName: filename,
      ...optionalMappedValue("compatibilityMode", doc?.docType, "docType", docxCompatibilityMode),
    };
  }
  if (unitType === UniverType.UNIVER_SHEET) {
    return {
      type: UniverInstanceType.UNIVER_SHEET,
      fileName: filename,
      ...(typeof sheet?.minSheetRowCount === "number"
        ? { minSheetRowCount: sheet.minSheetRowCount }
        : {}),
      ...(typeof sheet?.minSheetColumnCount === "number"
        ? { minSheetColumnCount: sheet.minSheetColumnCount }
        : {}),
      ...(extname(filename).toLowerCase() === ".xlsx"
        ? { formulaCalculation: FormulaCalculationMode.FORCED }
        : {}),
    };
  }
  return { type: UniverInstanceType.UNIVER_SLIDE, fileName: filename };
}

function exchangeExportOptions(
  unitType: ExchangeUnitType,
  format: ExchangeFormat,
  value: unknown,
): ExportOptions {
  const options = optionalRecord(value);
  const sheet = optionalRecord(options?.sheet);
  const csv = optionalRecord(sheet?.csv);
  const base = optionalRecord(options?.base);
  const baseCsv = optionalRecord(base?.csv);
  const baseXlsx = optionalRecord(base?.xlsx);
  if (unitType === UniverType.UNIVER_SHEET) {
    return {
      type: UniverInstanceType.UNIVER_SHEET,
      format,
      ...(format === ExchangeFormat.XLSX
        ? { formulaCalculation: FormulaCalculationMode.WHEN_EMPTY }
        : { csv: { worksheetId: requiredSelector(csv?.sheetId, "sheetId") } }),
    } as ExportOptions;
  }
  if (unitType === UniverType.UNIVER_BASE) {
    return {
      type: UniverInstanceType.UNIVER_BASE,
      format,
      ...(format === ExchangeFormat.XLSX
        ? {
            ...optionalMappedValue(
              "mode",
              baseXlsx?.baseExportMode,
              "baseExportMode",
              baseExportMode,
            ),
            ...optionalMappedValue(
              "formulaPolicy",
              baseXlsx?.baseFormulaPolicy,
              "baseFormulaPolicy",
              baseFormulaPolicy,
            ),
          }
        : { csv: { tableId: requiredSelector(baseCsv?.tableId, "tableId") } }),
    } as ExportOptions;
  }
  if (unitType === UniverType.UNIVER_DOC) {
    return { type: UniverInstanceType.UNIVER_DOC, format: ExchangeFormat.DOCX };
  }
  return { type: UniverInstanceType.UNIVER_SLIDE, format: ExchangeFormat.PPTX };
}

async function importUnitData(
  buffer: Buffer,
  options: BufferImportOptions,
): Promise<Readonly<Record<string, unknown>>> {
  switch (options.type) {
    case UniverInstanceType.UNIVER_SHEET:
      return { ...(await importBuffer(buffer, options)) };
    case UniverInstanceType.UNIVER_BASE:
      return { ...(await importBuffer(buffer, options)) };
    case UniverInstanceType.UNIVER_DOC:
      return { ...(await importBuffer(buffer, options)) };
    case UniverInstanceType.UNIVER_SLIDE:
      return { ...(await importBuffer(buffer, options)) };
  }
}

function snapshotToJson(input: ISnapshotWithBlocks): {
  readonly snapshot: ISnapshot;
  readonly sheetBlocks: Readonly<Record<string, ISheetBlock>>;
} {
  const snapshot = structuredClone(input.snapshot);
  transformOriginalMeta(snapshot, (value) =>
    value instanceof Uint8Array ? Buffer.from(value).toString("base64") : value,
  );
  const sheetBlocks = Object.fromEntries(
    input.sheetBlocks.map((block) => [
      block.id,
      { ...block, data: Buffer.from(block.data).toString("base64") },
    ]),
  ) as unknown as Readonly<Record<string, ISheetBlock>>;
  return { snapshot, sheetBlocks };
}

function snapshotFromJson(value: unknown): ISnapshotWithBlocks {
  const record = requireRecord(value);
  const snapshot = structuredClone(requireRecord(record.snapshot)) as unknown as ISnapshot;
  transformOriginalMeta(snapshot, (meta) =>
    typeof meta === "string" ? Buffer.from(meta, "base64") : meta,
  );
  const blocks = requireRecord(record.sheetBlocks);
  const sheetBlocks = Object.values(blocks).map((candidate) => {
    const block = requireRecord(candidate);
    if (typeof block.data !== "string") {
      throw new ExchangeHttpError(400, "A Sheet block has invalid data.");
    }
    return { ...block, data: Buffer.from(block.data, "base64") } as unknown as ISheetBlock;
  });
  return { snapshot, sheetBlocks };
}

function transformOriginalMeta(snapshot: ISnapshot, transform: (value: unknown) => unknown): void {
  const workbook = snapshot.workbook as
    | {
        originalMeta?: unknown;
        sheets?: Record<string, { originalMeta?: unknown }>;
      }
    | undefined;
  if (workbook !== undefined) {
    workbook.originalMeta = transform(workbook.originalMeta);
    for (const sheet of Object.values(workbook.sheets ?? {})) {
      sheet.originalMeta = transform(sheet.originalMeta);
    }
  }
  for (const key of ["doc", "slide", "board", "pdf"] as const) {
    const meta = snapshot[key] as { originalMeta?: unknown } | undefined;
    if (meta !== undefined) meta.originalMeta = transform(meta.originalMeta);
  }
}

function unitTypeFromProtocol(value: unknown): ExchangeUnitType {
  switch (Number(value)) {
    case UniverType.UNIVER_SHEET:
      return UniverType.UNIVER_SHEET;
    case UniverType.UNIVER_DOC:
      return UniverType.UNIVER_DOC;
    case UniverType.UNIVER_SLIDE:
      return UniverType.UNIVER_SLIDE;
    case UniverType.UNIVER_BASE:
      return UniverType.UNIVER_BASE;
    default:
      throw new ExchangeHttpError(400, "The Univer Unit type cannot be exchanged.");
  }
}

function unitTypeFromFilename(filename: string): ExchangeUnitType {
  switch (extname(filename).toLowerCase()) {
    case ".xls":
    case ".xlsx":
    case ".csv":
    case ".tsv":
      return UniverType.UNIVER_SHEET;
    case ".doc":
    case ".docx":
      return UniverType.UNIVER_DOC;
    case ".ppt":
    case ".pptx":
      return UniverType.UNIVER_SLIDE;
    default:
      throw new ExchangeHttpError(400, "The uploaded file type is not supported for import.");
  }
}

function validExportFormat(value: unknown, unitType: ExchangeUnitType): ExchangeFormat {
  const format = value ?? defaultFormat(unitType);
  const compatible =
    ((unitType === UniverType.UNIVER_SHEET || unitType === UniverType.UNIVER_BASE) &&
      [ExchangeFormat.XLSX, ExchangeFormat.CSV, ExchangeFormat.TSV].includes(
        format as ExchangeFormat,
      )) ||
    (unitType === UniverType.UNIVER_DOC && format === ExchangeFormat.DOCX) ||
    (unitType === UniverType.UNIVER_SLIDE && format === ExchangeFormat.PPTX);
  if (!compatible)
    throw new ExchangeHttpError(400, "The export format is not valid for this Unit.");
  return format as ExchangeFormat;
}

function defaultFormat(unitType: ExchangeUnitType): ExchangeFormat {
  if (unitType === UniverType.UNIVER_DOC) return ExchangeFormat.DOCX;
  if (unitType === UniverType.UNIVER_SLIDE) return ExchangeFormat.PPTX;
  return ExchangeFormat.XLSX;
}

function mediaType(format: ExchangeFormat): string {
  switch (format) {
    case ExchangeFormat.XLSX:
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ExchangeFormat.DOCX:
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ExchangeFormat.PPTX:
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case ExchangeFormat.CSV:
      return "text/csv; charset=utf-8";
    case ExchangeFormat.TSV:
      return "text/tab-separated-values; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function importedName(data: Readonly<Record<string, unknown>>, filename: string): string {
  const candidate =
    (typeof data.name === "string" && data.name.trim()) ||
    (typeof data.title === "string" && data.title.trim()) ||
    stripExtension(filename) ||
    "Imported file";
  return candidate.slice(0, 255);
}

function safeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 200) || "univer-export";
}

function stripExtension(filename: string): string {
  const name = basename(filename);
  const extension = extname(name);
  return name.slice(0, Math.max(0, name.length - extension.length));
}

function optionalId(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 255) {
    throw new ExchangeHttpError(400, `${field} is invalid.`);
  }
  return value;
}

function requiredSelector(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) {
    throw new ExchangeHttpError(400, `${field} is required for delimited export.`);
  }
  return value;
}

function optionalMappedValue<K extends string, T>(
  property: K,
  value: unknown,
  field: string,
  map: (value: string) => T | undefined,
): Partial<Record<K, T>> {
  if (value === undefined) return {};
  if (typeof value !== "string") throw new ExchangeHttpError(400, `${field} is invalid.`);
  const mapped = map(value);
  if (mapped === undefined) throw new ExchangeHttpError(400, `${field} is invalid.`);
  return { [property]: mapped } as Record<K, T>;
}

function baseImportMode(value: string): BaseImportMode | undefined {
  return Object.values(BaseImportMode).includes(value as BaseImportMode)
    ? (value as BaseImportMode)
    : undefined;
}

function baseExportMode(value: string): BaseExportMode | undefined {
  return Object.values(BaseExportMode).includes(value as BaseExportMode)
    ? (value as BaseExportMode)
    : undefined;
}

function baseFormulaPolicy(value: string): BaseFormulaPolicy | undefined {
  if (value === "convert-then-values") return BaseFormulaPolicy.CONVERT_THEN_VALUES;
  return Object.values(BaseFormulaPolicy).includes(value as BaseFormulaPolicy)
    ? (value as BaseFormulaPolicy)
    : undefined;
}

function docxCompatibilityMode(value: string): DocxCompatibilityMode | undefined {
  return Object.values(DocxCompatibilityMode).includes(value as DocxCompatibilityMode)
    ? (value as DocxCompatibilityMode)
    : undefined;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ExchangeHttpError(400, "A request body is required.");
  }
  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function validSize(value: unknown): number {
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new ExchangeHttpError(400, "size must be a positive integer.");
  }
  if (size > MAX_EXCHANGE_FILE_BYTES) throw payloadTooLarge();
  return size;
}

function validBooleanQuery(value: unknown): boolean {
  if (value === undefined || value === null || value === "false" || value === false) return false;
  if (value === "true" || value === true) return true;
  throw new ExchangeHttpError(400, "flate must be true or false.");
}

function exchangeMessage(error: unknown): string {
  if (error instanceof ExchangeError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "The file conversion failed.";
}

function payloadTooLarge(): ExchangeHttpError {
  return new ExchangeHttpError(
    413,
    `The exchange file exceeds the ${MAX_EXCHANGE_FILE_BYTES} byte limit.`,
  );
}

function notFound(): ExchangeHttpError {
  return new ExchangeHttpError(404, "The exchange resource was not found.");
}
