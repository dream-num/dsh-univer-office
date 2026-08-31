import { isAbsolute, normalize } from 'node:path'
import { UnitContentWorker } from '../adapters/unit-content/worker.ts'
import type { UnitContentInspectionQuery, UnitContentWorkerTarget } from '../adapters/unit-content/protocol.ts'
import { GatewayClient } from '../adapters/gateway/client.ts'
import { GatewayFileApi, fileKeyOf } from '../adapters/gateway/file-api.ts'
import { isRecord, mapUnits, type GatewayUnit } from '../adapters/gateway/mapping.ts'
import { GatewayWorktreeApi } from '../adapters/gateway/worktree-api.ts'
import type { ExportUnitContentRequest, InspectUnitContentRequest, JsonValue, UniverOperationResult, UniverUnitKind } from '../service/types.ts'
import { UniverError } from '../service/errors.ts'
import { univerFilePath } from '../service/identifiers.ts'

/** Validate a file value at the service boundary. */
export function resolveUniverFile(value: string) {
  const file = normalize(value)
  if (!isAbsolute(file)) throw new UniverError('Univer file path must be absolute.', 'INVALID_FILE_PATH')
  if (!file.toLowerCase().endsWith('.univer')) throw new UniverError('Univer file path must end in .univer.', 'INVALID_FILE_PATH')
  return univerFilePath(file)
}

/** Validate a user-facing export target. */
export function resolveExportFile(value: string): string {
  const file = normalize(value)
  if (!isAbsolute(file)) throw new UniverError('Export path must be absolute.', 'INVALID_EXPORT_PATH')
  return file
}

/** Package-local Unit content operations over one Gateway and isolated workers. */
export class UnitContentOperations {
  private readonly worker: UnitContentWorker

  constructor(
    private readonly gatewayRequestTimeoutMs: number,
    private readonly unitContentCommitTimeoutMs: number,
    unitContentOperationTimeoutMs: number,
  ) {
    this.worker = new UnitContentWorker(unitContentOperationTimeoutMs)
  }

  /** Inspect one file, unit, or Sheet range. */
  async inspect(gateway: string, request: InspectUnitContentRequest, signal?: AbortSignal): Promise<UniverOperationResult> {
    const target = await this.resolveTarget(gateway, request.file, request.unitId, request.worktreeId)
    const result = await this.worker.run({
      ...target,
      operation: 'inspect',
      query: inspectionQuery(target.unitType, request.range, request.elementIds),
    }, signal)
    return { ok: true, operation: 'inspect', file: request.file, result }
  }

  /** Execute Facade code and commit its mutations to a draft worktree. */
  async execute(
    gateway: string,
    file: string,
    code: string,
    worktreeId: string,
    unitId: string,
    signal?: AbortSignal,
  ): Promise<UniverOperationResult> {
    const target = await this.resolveTarget(gateway, file, unitId, worktreeId)
    const result = await this.worker.run({ ...target, operation: 'execute', code, worktreeId }, signal)
    return { ok: true, operation: 'execute', file, result }
  }

  /** Export one Unit to a user-facing Office or delimited file. */
  async export(gateway: string, request: ExportUnitContentRequest, signal?: AbortSignal): Promise<UniverOperationResult> {
    const target = await this.resolveTarget(gateway, request.file, request.unitId, request.worktreeId)
    const result = await this.worker.run({
      ...target,
      operation: 'export',
      outputPath: resolveExportFile(request.output),
    }, signal)
    return { ok: true, operation: 'export', file: request.file, result }
  }

  /** Load one Unit snapshot for machine rendering. */
  async renderSource(
    gateway: string,
    file: string,
    unitId: string,
    worktreeId?: string,
    signal?: AbortSignal,
  ): Promise<{ readonly unitType: UniverUnitKind; readonly unitData: { [key: string]: JsonValue } }> {
    const target = await this.resolveTarget(gateway, file, unitId, worktreeId)
    const value = await this.worker.run({ ...target, operation: 'render-source' }, signal)
    if (!isRecord(value) || !isUnitKind(value.unitType) || !isRecord(value.unitData)) {
      throw new UniverError('Unit content worker returned an invalid render source.', 'UNIT_CONTENT_WORKER_INVALID_RESPONSE')
    }
    return { unitType: value.unitType, unitData: value.unitData }
  }

  /** Import one Office file into a JSON Unit snapshot. */
  import(sourcePath: string, signal?: AbortSignal): Promise<{ readonly kind: UniverUnitKind; readonly snapshot: JsonValue }> {
    const kind = importKind(sourcePath)
    return this.worker.run({ operation: 'import', sourcePath, unitType: unitType(kind) }, signal).then((snapshot) => ({ kind, snapshot }))
  }

  private async resolveTarget(
    gatewayOrigin: string,
    filePath: string,
    unitId: string | undefined,
    worktreeId: string | undefined,
  ): Promise<UnitContentWorkerTarget> {
    const client = new GatewayClient(gatewayOrigin, this.gatewayRequestTimeoutMs)
    const listing = worktreeId === undefined
      ? await new GatewayFileApi(client).listUnits(filePath)
      : await new GatewayWorktreeApi(client).listUnits(filePath, worktreeId)
    const unit = selectUnit(mapUnits(listing), unitId)
    return {
      gatewayOrigin,
      commitTimeoutMs: this.unitContentCommitTimeoutMs,
      fileKey: fileKeyOf(filePath),
      filePath,
      unitId: unit.unitId,
      unitType: unit.type,
      ...(worktreeId === undefined ? {} : { worktreeId }),
    }
  }
}

function importKind(sourcePath: string): UniverUnitKind {
  const extension = sourcePath.slice(sourcePath.lastIndexOf('.')).toLowerCase()
  if (extension === '.xlsx' || extension === '.csv' || extension === '.tsv') return 'sheet'
  if (extension === '.docx') return 'doc'
  if (extension === '.pptx') return 'slide'
  throw new UniverError('Import source must end in .xlsx, .csv, .tsv, .docx, or .pptx.', 'IMPORT_FORMAT_UNSUPPORTED')
}

function unitType(kind: UniverUnitKind): 1 | 2 | 3 | 5 | 6 {
  if (kind === 'doc') return 1
  if (kind === 'sheet') return 2
  if (kind === 'slide') return 3
  if (kind === 'base') return 5
  return 6
}

function isUnitKind(value: JsonValue | undefined): value is UniverUnitKind {
  return value === 'sheet' || value === 'doc' || value === 'slide' || value === 'base' || value === 'board'
}

function selectUnit(units: readonly GatewayUnit[], requested: string | undefined): GatewayUnit {
  if (requested !== undefined) {
    const unit = units.find((candidate) => candidate.unitId === requested)
    if (unit !== undefined) return unit
    throw new UniverError(`Unit ${requested} was not found in the selected scope.`, 'UNIT_NOT_FOUND')
  }
  if (units.length === 1) return units[0]!
  throw new UniverError('Specify unitId when the selected scope has zero or multiple Units.', 'UNIT_REQUIRED')
}

function inspectionQuery(
  type: number,
  range: string | undefined,
  elementIds: readonly string[] | undefined,
): UnitContentInspectionQuery {
  if (range !== undefined && elementIds !== undefined) {
    throw new UniverError('Provide at most one of range or elementIds.', 'INSPECTION_INPUT_INVALID')
  }
  if (range !== undefined) {
    if (type !== 2) throw new UniverError('Range inspection requires a Sheet Unit.', 'INSPECTION_UNIT_TYPE_MISMATCH')
    const split = range.lastIndexOf('!')
    const selector = split < 0
      ? { index: 0 as const }
      : { name: unquoteSheetName(range.slice(0, split)) }
    const address = split < 0 ? range : range.slice(split + 1)
    if (address.trim().length === 0) throw new UniverError('Inspection range must not be empty.', 'INSPECTION_RANGE_INVALID')
    return { kind: 'worksheet-range', ranges: [{ range: address, worksheet: selector }] }
  }
  if (elementIds !== undefined) {
    if (type !== 6) throw new UniverError('Board element inspection requires a Board Unit.', 'INSPECTION_UNIT_TYPE_MISMATCH')
    if (elementIds.length === 0 || elementIds.some((id) => id.length === 0)) {
      throw new UniverError('elementIds must contain at least one non-empty Board element ID.', 'INSPECTION_INPUT_INVALID')
    }
    return {
      kind: 'board-element',
      elements: [{ id: elementIds[0]! }, ...elementIds.slice(1).map((id) => ({ id }))],
    }
  }
  if (type === 2) return { kind: 'workbook' }
  if (type === 3) return { kind: 'presentation' }
  if (type === 1) return { kind: 'document' }
  if (type === 5) return { kind: 'base' }
  if (type === 6) return { kind: 'board' }
  throw new UniverError(`Unit type ${String(type)} does not support structured inspection.`, 'INSPECTION_UNIT_TYPE_UNSUPPORTED')
}

function unquoteSheetName(value: string): string {
  const trimmed = value.trim()
  return trimmed.startsWith("'") && trimmed.endsWith("'")
    ? trimmed.slice(1, -1).replace(/''/gu, "'")
    : trimmed
}
