import { extname, isAbsolute } from 'node:path'
import type { ContentInspectionQuery } from '@univer-cli/content-inspection'
import type { UniverCollaborationRuntime } from '@univer-cli/univer-collaboration-runtime'
import {
  DocxCompatibilityMode,
  ExchangeFormat,
  FormulaCalculationMode,
  exportToFile,
  importFile,
  type ExportOptions,
  type ImportOptions
} from '@univerjs-pro/exchange-node'
import { UniverInstanceType } from '@univerjs/core'
import {
  executeUnitContent,
  inspectUnitContent,
  pullUnitContent,
  unitContentError as codedError,
  unitContentKind as unitKind
} from '../../shared/unit-content-session.ts'
import {
  invalidRequest,
  isRecord,
  loadUnitContentRuntime,
  parseUnitContentRuntimeInit,
  requiredString,
  type UnitContentRuntimeInit
} from './runtime/content-runtime.ts'

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
type ImportOfficeFile = (
  path: string,
  options: ImportOptions
) => Promise<Readonly<Record<string, unknown>>>
type ExportOfficeFile = (
  data: Readonly<Record<string, unknown>>,
  path: string,
  options: ExportOptions
) => Promise<void>

const importOfficeFile = importFile as unknown as ImportOfficeFile
const exportOfficeFile = exportToFile as unknown as ExportOfficeFile

interface BaseRequest extends UnitContentRuntimeInit {
  readonly filePath: string
}

interface InspectRequest extends BaseRequest {
  readonly operation: 'inspect'
  readonly query: ContentInspectionQuery
}

interface ExecuteRequest extends BaseRequest {
  readonly operation: 'execute'
  readonly code: string
  readonly worktreeId: string
}

interface ExportRequest extends BaseRequest {
  readonly operation: 'export'
  readonly outputPath: string
}

interface RenderSourceRequest extends BaseRequest {
  readonly operation: 'render-source'
}

/** Compatibility mode for .docx imports; traditional keeps the source page setup. */
type ImportDocType = 'traditional' | 'modern'

interface ImportRequest {
  readonly operation: 'import'
  readonly sourcePath: string
  readonly unitType:
    | UniverInstanceType.UNIVER_SHEET
    | UniverInstanceType.UNIVER_DOC
    | UniverInstanceType.UNIVER_SLIDE
  readonly docType?: ImportDocType
}

type WorkerRequest =
  | InspectRequest
  | ExecuteRequest
  | ExportRequest
  | RenderSourceRequest
  | ImportRequest

interface WorkerEnvelope {
  readonly ok: boolean
  readonly result?: JsonValue
  readonly error?: { readonly code: string; readonly message: string }
}

const envelope = await main().then<WorkerEnvelope>(
  (result) => ({ ok: true, result }),
  (error: unknown) => ({
    ok: false,
    error: {
      code: errorCode(error),
      message: error instanceof Error ? error.message : String(error)
    }
  })
)
process.stdout.write(`${JSON.stringify(envelope)}\n`)
if (!envelope.ok) process.exitCode = 1

async function main(): Promise<JsonValue> {
  const request = parseRequest(JSON.parse(await readStdin()) as unknown)
  if (request.operation === 'import') {
    return (await importOfficeFile(
      request.sourcePath,
      importOptions(request.sourcePath, request.unitType, request.docType)
    )) as unknown as JsonValue
  }
  const collaboration = await loadUnitContentRuntime(request)
  try {
    await pullUnitContent(collaboration)
    switch (request.operation) {
      case 'inspect':
        return await inspectUnitContent(collaboration, request.query)
      case 'execute': {
        const execution = await executeUnitContent(collaboration, request.code)
        return {
          committed: execution.committed,
          filePath: request.filePath,
          ...(execution.revision === undefined ? {} : { revision: execution.revision }),
          unitId: request.unitId,
          value: execution.value,
          worktreeId: request.worktreeId
        }
      }
      case 'export': {
        const unitData = await collaboration.exportUnitData()
        await exportUnit(request, unitData)
        return {
          filePath: request.filePath,
          kind: unitKind(request.unitType),
          outputPath: request.outputPath,
          scope: request.worktreeId === undefined ? 'trunk' : 'worktree',
          type: request.unitType,
          unitId: request.unitId,
          ...(request.worktreeId === undefined ? {} : { worktreeId: request.worktreeId })
        }
      }
      case 'render-source':
        return {
          unitType: unitKind(request.unitType),
          unitData: (await collaboration.exportUnitData()) as unknown as JsonValue
        }
    }
  } finally {
    await collaboration.close()
  }
}

async function exportUnit(
  request: ExportRequest,
  unitData: Awaited<ReturnType<UniverCollaborationRuntime['exportUnitData']>>
): Promise<void> {
  const extension = extname(request.outputPath).toLowerCase()
  switch (request.unitType) {
    case UniverInstanceType.UNIVER_SHEET:
      await exportOfficeFile(unitData as Readonly<Record<string, unknown>>, request.outputPath, {
        format: sheetLikeFormat(extension, 'Sheet'),
        formulaCalculation: FormulaCalculationMode.FORCED,
        type: UniverInstanceType.UNIVER_SHEET
      } as ExportOptions)
      return
    case UniverInstanceType.UNIVER_BASE:
      await exportOfficeFile(unitData as Readonly<Record<string, unknown>>, request.outputPath, {
        format: sheetLikeFormat(extension, 'Base'),
        type: UniverInstanceType.UNIVER_BASE
      } as ExportOptions)
      return
    case UniverInstanceType.UNIVER_DOC:
      requireExtension(extension, '.docx', 'Doc')
      await exportOfficeFile(unitData as Readonly<Record<string, unknown>>, request.outputPath, {
        format: ExchangeFormat.DOCX,
        type: UniverInstanceType.UNIVER_DOC
      })
      return
    case UniverInstanceType.UNIVER_SLIDE:
      requireExtension(extension, '.pptx', 'Slide')
      await exportOfficeFile(unitData as Readonly<Record<string, unknown>>, request.outputPath, {
        format: ExchangeFormat.PPTX,
        type: UniverInstanceType.UNIVER_SLIDE
      })
      return
    default:
      throw codedError(
        'EXPORT_UNIT_TYPE_UNSUPPORTED',
        `Unit type ${String(request.unitType)} cannot be exported`
      )
  }
}

function sheetLikeFormat(
  extension: string,
  kind: 'Sheet' | 'Base'
): ExchangeFormat.XLSX | ExchangeFormat.CSV | ExchangeFormat.TSV {
  if (extension === '.xlsx') return ExchangeFormat.XLSX
  if (extension === '.csv') return ExchangeFormat.CSV
  if (extension === '.tsv') return ExchangeFormat.TSV
  throw codedError(
    'EXPORT_FORMAT_MISMATCH',
    `${kind} Units must be exported to .xlsx, .csv, or .tsv files`
  )
}

function importOptions(
  sourcePath: string,
  type: ImportRequest['unitType'],
  docType: ImportDocType | undefined
): ImportOptions {
  return {
    type,
    // Traditional mode keeps the source section geometry; modern mode rewrites
    // page setup to a canned pageless layout and loses it.
    ...(type === UniverInstanceType.UNIVER_DOC
      ? {
          compatibilityMode:
            docType === 'modern' ? DocxCompatibilityMode.MODERN : DocxCompatibilityMode.TRADITIONAL
        }
      : {}),
    ...(type === UniverInstanceType.UNIVER_SHEET && extname(sourcePath).toLowerCase() === '.xlsx'
      ? { formulaCalculation: FormulaCalculationMode.FORCED }
      : {})
  } as ImportOptions
}

function requireExtension(actual: string, expected: string, kind: string): void {
  if (actual === expected) return
  throw codedError('EXPORT_FORMAT_MISMATCH', `${kind} Units must be exported to ${expected}`)
}

function parseRequest(value: unknown): WorkerRequest {
  if (!isRecord(value)) {
    throw codedError(
      'UNIT_CONTENT_WORKER_REQUEST_INVALID',
      'Unit content worker request must be an object'
    )
  }
  const request = value
  if (request.operation === 'import') {
    const sourcePath = requiredString(request.sourcePath, 'sourcePath')
    if (!isAbsolute(sourcePath)) invalidRequest('sourcePath must be absolute')
    const unitType = requiredImportUnitType(request.unitType)
    const docType = optionalImportDocType(request.docType)
    return {
      operation: 'import',
      sourcePath,
      unitType,
      ...(docType === undefined ? {} : { docType })
    }
  }
  const base = {
    ...parseUnitContentRuntimeInit(request),
    filePath: requiredString(request.filePath, 'filePath')
  }
  if (request.operation === 'inspect') {
    return { ...base, operation: 'inspect', query: requiredInspectionQuery(request.query) }
  }
  if (request.operation === 'execute') {
    return {
      ...base,
      operation: 'execute',
      code: requiredString(request.code, 'code', true),
      worktreeId: requiredString(request.worktreeId, 'worktreeId')
    }
  }
  if (request.operation === 'export') {
    const outputPath = requiredString(request.outputPath, 'outputPath')
    if (!isAbsolute(outputPath)) invalidRequest('outputPath must be absolute')
    return { ...base, operation: 'export', outputPath }
  }
  if (request.operation === 'render-source') {
    return { ...base, operation: 'render-source' }
  }
  throw codedError('UNIT_CONTENT_WORKER_REQUEST_INVALID', 'Unknown Unit content worker operation')
}

function requiredImportUnitType(value: unknown): ImportRequest['unitType'] {
  if (
    value !== UniverInstanceType.UNIVER_SHEET &&
    value !== UniverInstanceType.UNIVER_DOC &&
    value !== UniverInstanceType.UNIVER_SLIDE
  ) {
    invalidRequest('import unitType must be Sheet, Doc, or Slide')
  }
  return value
}

function optionalImportDocType(value: unknown): ImportDocType | undefined {
  if (value === undefined || value === null) return undefined
  if (value === 'traditional' || value === 'modern') return value
  invalidRequest('import docType must be traditional or modern')
}

function requiredInspectionQuery(value: unknown): ContentInspectionQuery {
  if (!isRecord(value)) invalidRequest('query must be an object')
  if (
    value.kind === 'workbook' ||
    value.kind === 'presentation' ||
    value.kind === 'document' ||
    value.kind === 'base' ||
    value.kind === 'board'
  ) {
    return { kind: value.kind }
  }
  if (value.kind === 'board-element') {
    if (!Array.isArray(value.elements) || value.elements.length === 0) {
      invalidRequest('board-element query must contain at least one element')
    }
    const elements = value.elements.map((element, index) => {
      if (!isRecord(element)) invalidRequest(`query.elements[${index}] must be an object`)
      return { id: requiredString(element.id, `query.elements[${index}].id`) }
    })
    return { kind: 'board-element', elements: [elements[0]!, ...elements.slice(1)] }
  }
  if (
    value.kind !== 'worksheet-range' ||
    !Array.isArray(value.ranges) ||
    value.ranges.length !== 1
  ) {
    invalidRequest('worksheet-range query must contain exactly one range')
  }
  const entry = value.ranges[0]
  if (!isRecord(entry) || !isRecord(entry.worksheet)) invalidRequest('worksheet range is invalid')
  const range = requiredString(entry.range, 'query.ranges[0].range')
  if (typeof entry.worksheet.name === 'string' && entry.worksheet.name.length > 0) {
    return {
      kind: 'worksheet-range',
      ranges: [{ range, worksheet: { name: entry.worksheet.name } }]
    }
  }
  if (Number.isSafeInteger(entry.worksheet.index) && Number(entry.worksheet.index) >= 0) {
    return {
      kind: 'worksheet-range',
      ranges: [{ range, worksheet: { index: Number(entry.worksheet.index) } }]
    }
  }
  return invalidRequest('worksheet selector must have a non-empty name or non-negative index')
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  const value = Buffer.concat(chunks).toString('utf8')
  if (value.trim().length === 0) {
    throw codedError('UNIT_CONTENT_WORKER_REQUEST_INVALID', 'Unit content worker request is empty')
  }
  return value
}

function errorCode(error: unknown): string {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : 'UNIT_CONTENT_WORKER_FAILED'
}
