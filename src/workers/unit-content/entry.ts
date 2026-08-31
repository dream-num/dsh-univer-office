import { extname, isAbsolute } from "node:path";
import { prepareContentExecutionProgram } from "@univer-cli/content-execution";
import {
  inspectContent,
  type ContentInspectionQuery,
} from "@univer-cli/content-inspection";
import { createStandardHeadlessUniverFactory } from "@univer-cli/headless-univer";
import {
  createCollaborationServerAdapter,
  createUniverCollaborationRuntimeFactory,
  type UniverCollaborationRuntime,
  type UniverFactoryContext,
} from "@univer-cli/univer-collaboration-runtime";
import {
  ExchangeFormat,
  FormulaCalculationMode,
  exportToFile,
  importFile,
  type ExportOptions,
  type ImportOptions,
} from "@univerjs-pro/exchange-node";
import { UniverInstanceType } from "@univerjs/core";
import { UNIVER_LICENSE } from "./license.ts";
import { createLocalReferencedUnitProviderRegistration } from "./runtime/local-referenced-unit-provider.ts";
import { LocalSnapshotServerAdapter } from "./runtime/local-snapshot-server-adapter.ts";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type ImportOfficeFile = (
  path: string,
  options: ImportOptions,
) => Promise<Readonly<Record<string, unknown>>>;
type ExportOfficeFile = (
  data: Readonly<Record<string, unknown>>,
  path: string,
  options: ExportOptions,
) => Promise<void>;

const importOfficeFile = importFile as unknown as ImportOfficeFile;
const exportOfficeFile = exportToFile as unknown as ExportOfficeFile;

interface BaseRequest {
  readonly gatewayOrigin: string;
  readonly commitTimeoutMs: number;
  readonly fileKey: string;
  readonly filePath: string;
  readonly unitId: string;
  readonly unitType: UniverInstanceType;
  readonly worktreeId?: string;
}

interface InspectRequest extends BaseRequest {
  readonly operation: "inspect";
  readonly query: ContentInspectionQuery;
}

interface ExecuteRequest extends BaseRequest {
  readonly operation: "execute";
  readonly code: string;
  readonly worktreeId: string;
}

interface ExportRequest extends BaseRequest {
  readonly operation: "export";
  readonly outputPath: string;
}

interface RenderSourceRequest extends BaseRequest {
  readonly operation: "render-source";
}

interface ImportRequest {
  readonly operation: "import";
  readonly sourcePath: string;
  readonly unitType:
    | UniverInstanceType.UNIVER_SHEET
    | UniverInstanceType.UNIVER_DOC
    | UniverInstanceType.UNIVER_SLIDE;
}

type WorkerRequest = InspectRequest | ExecuteRequest | ExportRequest | RenderSourceRequest | ImportRequest;

interface WorkerEnvelope {
  readonly ok: boolean;
  readonly result?: JsonValue;
  readonly error?: { readonly code: string; readonly message: string };
}

const envelope = await main().then<WorkerEnvelope>(
  (result) => ({ ok: true, result }),
  (error: unknown) => ({
    ok: false,
    error: {
      code: errorCode(error),
      message: error instanceof Error ? error.message : String(error),
    },
  }),
);
process.stdout.write(`${JSON.stringify(envelope)}\n`);
if (!envelope.ok) process.exitCode = 1;

async function main(): Promise<JsonValue> {
  const request = parseRequest(JSON.parse(await readStdin()) as unknown);
  if (request.operation === "import") {
    return await importOfficeFile(
      request.sourcePath,
      importOptions(request.sourcePath, request.unitType),
    ) as unknown as JsonValue;
  }
  const urls = gatewayUrls(request);
  const snapshotServerService = new LocalSnapshotServerAdapter(urls.snapshotServerUrl);
  const createUniver = async (context: UniverFactoryContext) => {
    if (context.resolveSnapshotService === undefined) {
      throw codedError(
        "UNIT_CONTENT_SNAPSHOT_SERVICE_REQUIRED",
        "Referenced Unit loading requires SnapshotService",
      );
    }
    return await createStandardHeadlessUniverFactory({
      license: process.env["UNIVER_LICENSE"]?.trim() || UNIVER_LICENSE,
      embedPluginConfig: {
        resourceRefUnitProviderRegistrations: [
          createLocalReferencedUnitProviderRegistration({
            resolveSnapshotService: context.resolveSnapshotService,
          }),
        ],
      },
    })(context);
  };
  const collaboration = await createUniverCollaborationRuntimeFactory({
    backend: createCollaborationServerAdapter(urls),
    createUniver,
    snapshotServerService,
  }).load(request.unitId, request.unitType);
  try {
    await pullCurrent(collaboration);
    switch (request.operation) {
      case "inspect":
        return (await inspectContent(
          {
            unitId: request.unitId,
            unitType: unitKind(request.unitType),
            async execute(input) {
              const result = await collaboration.execute(input);
              return { value: result.value };
            },
          },
          request.query,
        )) as unknown as JsonValue;
      case "execute": {
        const program = prepareContentExecutionProgram({
          code: request.code,
          unitId: request.unitId,
          unitType: unitKind(request.unitType),
        });
        const execution = await collaboration.execute({ code: program, mode: "write" });
        if (execution.mutations.length === 0) {
          return {
            committed: false,
            filePath: request.filePath,
            unitId: request.unitId,
            value: execution.value,
            worktreeId: request.worktreeId,
          };
        }
        const revision = await commitAll(collaboration);
        return {
          committed: true,
          filePath: request.filePath,
          revision,
          unitId: request.unitId,
          value: execution.value,
          worktreeId: request.worktreeId,
        };
      }
      case "export": {
        const unitData = await collaboration.exportUnitData();
        await exportUnit(request, unitData);
        return {
          filePath: request.filePath,
          kind: unitKind(request.unitType),
          outputPath: request.outputPath,
          scope: request.worktreeId === undefined ? "trunk" : "worktree",
          type: request.unitType,
          unitId: request.unitId,
          ...(request.worktreeId === undefined ? {} : { worktreeId: request.worktreeId }),
        };
      }
      case "render-source":
        return {
          unitType: unitKind(request.unitType),
          unitData: await collaboration.exportUnitData() as unknown as JsonValue,
        };
    }
  } finally {
    await collaboration.close();
  }
}

async function exportUnit(
  request: ExportRequest,
  unitData: Awaited<ReturnType<UniverCollaborationRuntime["exportUnitData"]>>,
): Promise<void> {
  const extension = extname(request.outputPath).toLowerCase();
  switch (request.unitType) {
    case UniverInstanceType.UNIVER_SHEET:
      await exportOfficeFile(unitData as Readonly<Record<string, unknown>>, request.outputPath, {
        format: sheetLikeFormat(extension, "Sheet"),
        formulaCalculation: FormulaCalculationMode.FORCED,
        type: UniverInstanceType.UNIVER_SHEET,
      } as ExportOptions);
      return;
    case UniverInstanceType.UNIVER_BASE:
      await exportOfficeFile(unitData as Readonly<Record<string, unknown>>, request.outputPath, {
        format: sheetLikeFormat(extension, "Base"),
        type: UniverInstanceType.UNIVER_BASE,
      } as ExportOptions);
      return;
    case UniverInstanceType.UNIVER_DOC:
      requireExtension(extension, ".docx", "Doc");
      await exportOfficeFile(unitData as Readonly<Record<string, unknown>>, request.outputPath, {
        format: ExchangeFormat.DOCX,
        type: UniverInstanceType.UNIVER_DOC,
      });
      return;
    case UniverInstanceType.UNIVER_SLIDE:
      requireExtension(extension, ".pptx", "Slide");
      await exportOfficeFile(unitData as Readonly<Record<string, unknown>>, request.outputPath, {
        format: ExchangeFormat.PPTX,
        type: UniverInstanceType.UNIVER_SLIDE,
      });
      return;
    default:
      throw codedError(
        "EXPORT_UNIT_TYPE_UNSUPPORTED",
        `Unit type ${String(request.unitType)} cannot be exported`,
      );
  }
}

async function pullCurrent(collaboration: UniverCollaborationRuntime): Promise<void> {
  const pulled = await collaboration.pull();
  if (pulled.status === "conflict") {
    throw codedError("UNIT_CONTENT_CONFLICT", pulled.conflict.message);
  }
}

async function commitAll(
  collaboration: UniverCollaborationRuntime,
): Promise<number> {
  const statuses: string[] = [];
  const initialRevision = collaboration.getState().baseRevision;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await collaboration.commit();
    statuses.push(result.status);
    if (result.status === "confirmed") return result.state.baseRevision;
    if (result.status === "nothing-to-commit") {
      if (result.state.baseRevision > initialRevision) return result.state.baseRevision;
      throw codedError("UNIT_CONTENT_COMMIT_INVALID", "Unit content had no mutation to commit");
    }
    if (result.status === "unknown") {
      await pullCurrent(collaboration);
      const state = collaboration.getState();
      if (
        state.awaitingChangeset === null &&
        state.pendingMutationCount === 0 &&
        state.baseRevision > initialRevision
      ) {
        return state.baseRevision;
      }
      continue;
    }
    if (result.status === "retry") continue;
    if (result.status === "pull-required") {
      await pullCurrent(collaboration);
      continue;
    }
    if (result.status === "conflict") {
      throw codedError("UNIT_CONTENT_CONFLICT", result.conflict.message);
    }
    throw codedError(
      "UNIT_CONTENT_COMMIT_INVALID",
      "Unit content discarded pending mutations before commit",
    );
  }
  throw codedError(
    "UNIT_CONTENT_COMMIT_RETRY_EXHAUSTED",
    `Unit content commit could not be confirmed after three attempts (${statuses.join(", ")})`,
  );
}

function gatewayUrls(request: BaseRequest) {
  const root = `${request.gatewayOrigin.replace(/\/$/u, "")}/uf/${request.fileKey}`;
  const wsRoot = root.replace(/^http/u, "ws");
  const worktree =
    request.worktreeId === undefined
      ? ""
      : `/worktrees/${encodeURIComponent(request.worktreeId)}`;
  const base = `${root}${worktree}`;
  const wsBase = `${wsRoot}${worktree}`;
  return {
    snapshotServerUrl: `${base}/universer-api/snapshot`,
    collabSubmitChangesetUrl: `${base}/universer-api/comb`,
    collabWebSocketUrl: `${wsBase}/universer-api/comb/connect`,
    wsSessionTicketUrl: `${base}/universer-api/user/session-ticket`,
    commitTimeoutMs: request.commitTimeoutMs,
  };
}

function unitKind(type: UniverInstanceType): "sheet" | "doc" | "slide" | "base" | "board" {
  switch (type) {
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
    throw codedError("UNIT_CONTENT_TYPE_UNSUPPORTED", `Unsupported Unit type ${String(type)}`);
  }
}

function sheetLikeFormat(
  extension: string,
  kind: "Sheet" | "Base",
): ExchangeFormat.XLSX | ExchangeFormat.CSV | ExchangeFormat.TSV {
  if (extension === ".xlsx") return ExchangeFormat.XLSX;
  if (extension === ".csv") return ExchangeFormat.CSV;
  if (extension === ".tsv") return ExchangeFormat.TSV;
  throw codedError(
    "EXPORT_FORMAT_MISMATCH",
    `${kind} Units must be exported to .xlsx, .csv, or .tsv files`,
  );
}

function importOptions(sourcePath: string, type: ImportRequest["unitType"]): ImportOptions {
  return {
    type,
    ...(type === UniverInstanceType.UNIVER_SHEET && extname(sourcePath).toLowerCase() === ".xlsx"
      ? { formulaCalculation: FormulaCalculationMode.FORCED }
      : {}),
  } as ImportOptions;
}

function requireExtension(actual: string, expected: string, kind: string): void {
  if (actual === expected) return;
  throw codedError("EXPORT_FORMAT_MISMATCH", `${kind} Units must be exported to ${expected}`);
}

function parseRequest(value: unknown): WorkerRequest {
  if (!isRecord(value)) {
    throw codedError("UNIT_CONTENT_WORKER_REQUEST_INVALID", "Unit content worker request must be an object");
  }
  const request = value;
  if (request.operation === "import") {
    const sourcePath = requiredString(request.sourcePath, "sourcePath");
    if (!isAbsolute(sourcePath)) invalidRequest("sourcePath must be absolute");
    const unitType = requiredImportUnitType(request.unitType);
    return { operation: "import", sourcePath, unitType };
  }
  const base = {
    gatewayOrigin: requiredHttpOrigin(request.gatewayOrigin),
    commitTimeoutMs: requiredPositiveInteger(request.commitTimeoutMs, "commitTimeoutMs"),
    fileKey: requiredString(request.fileKey, "fileKey"),
    filePath: requiredString(request.filePath, "filePath"),
    unitId: requiredString(request.unitId, "unitId"),
    unitType: requiredUnitType(request.unitType),
    ...optionalWorktreeId(request.worktreeId),
  };
  if (request.operation === "inspect") {
    return { ...base, operation: "inspect", query: requiredInspectionQuery(request.query) };
  }
  if (request.operation === "execute") {
    return {
      ...base,
      operation: "execute",
      code: requiredString(request.code, "code", true),
      worktreeId: requiredString(request.worktreeId, "worktreeId"),
    };
  }
  if (request.operation === "export") {
    const outputPath = requiredString(request.outputPath, "outputPath");
    if (!isAbsolute(outputPath)) invalidRequest("outputPath must be absolute");
    return { ...base, operation: "export", outputPath };
  }
  if (request.operation === "render-source") {
    return { ...base, operation: "render-source" };
  }
  throw codedError("UNIT_CONTENT_WORKER_REQUEST_INVALID", "Unknown Unit content worker operation");
}

function requiredImportUnitType(value: unknown): ImportRequest["unitType"] {
  if (
    value !== UniverInstanceType.UNIVER_SHEET &&
    value !== UniverInstanceType.UNIVER_DOC &&
    value !== UniverInstanceType.UNIVER_SLIDE
  ) {
    invalidRequest("import unitType must be Sheet, Doc, or Slide");
  }
  return value;
}

function requiredInspectionQuery(value: unknown): ContentInspectionQuery {
  if (!isRecord(value)) invalidRequest("query must be an object");
  if (
    value.kind === "workbook" ||
    value.kind === "presentation" ||
    value.kind === "document" ||
    value.kind === "base" ||
    value.kind === "board"
  ) {
    return { kind: value.kind };
  }
  if (value.kind === "board-element") {
    if (!Array.isArray(value.elements) || value.elements.length === 0) {
      invalidRequest("board-element query must contain at least one element");
    }
    const elements = value.elements.map((element, index) => {
      if (!isRecord(element)) invalidRequest(`query.elements[${index}] must be an object`);
      return { id: requiredString(element.id, `query.elements[${index}].id`) };
    });
    return { kind: "board-element", elements: [elements[0]!, ...elements.slice(1)] };
  }
  if (value.kind !== "worksheet-range" || !Array.isArray(value.ranges) || value.ranges.length !== 1) {
    invalidRequest("worksheet-range query must contain exactly one range");
  }
  const entry = value.ranges[0];
  if (!isRecord(entry) || !isRecord(entry.worksheet)) invalidRequest("worksheet range is invalid");
  const range = requiredString(entry.range, "query.ranges[0].range");
  if (typeof entry.worksheet.name === "string" && entry.worksheet.name.length > 0) {
    return { kind: "worksheet-range", ranges: [{ range, worksheet: { name: entry.worksheet.name } }] };
  }
  if (Number.isSafeInteger(entry.worksheet.index) && Number(entry.worksheet.index) >= 0) {
    return { kind: "worksheet-range", ranges: [{ range, worksheet: { index: Number(entry.worksheet.index) } }] };
  }
  return invalidRequest("worksheet selector must have a non-empty name or non-negative index");
}

function requiredHttpOrigin(value: unknown): string {
  const origin = requiredString(value, "gatewayOrigin");
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return invalidRequest("gatewayOrigin must be a valid HTTP origin");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.origin !== origin ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    return invalidRequest("gatewayOrigin must be an HTTP origin without credentials or a path");
  }
  return origin;
}

function requiredUnitType(value: unknown): UniverInstanceType {
  if (!Number.isSafeInteger(value)) invalidRequest("unitType must be an integer");
  unitKind(value as UniverInstanceType);
  return value as UniverInstanceType;
}

function requiredPositiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) invalidRequest(`${field} must be a positive integer`);
  return Number(value);
}

function requiredString(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    return invalidRequest(`${field} must be ${allowEmpty ? "a string" : "a non-empty string"}`);
  }
  return value;
}

function optionalWorktreeId(value: unknown): { readonly worktreeId?: string } {
  if (value === undefined) return {};
  return { worktreeId: requiredString(value, "worktreeId") };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidRequest(message: string): never {
  throw codedError("UNIT_CONTENT_WORKER_REQUEST_INVALID", message);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const value = Buffer.concat(chunks).toString("utf8");
  if (value.trim().length === 0) {
    throw codedError("UNIT_CONTENT_WORKER_REQUEST_INVALID", "Unit content worker request is empty");
  }
  return value;
}

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function errorCode(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : "UNIT_CONTENT_WORKER_FAILED";
}
