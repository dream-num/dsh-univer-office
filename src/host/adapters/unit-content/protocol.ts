import type { JsonValue } from '../../service/types.ts'

/** Unit and collaboration scope passed to the package-local worker. */
export interface UnitContentWorkerTarget {
  readonly gatewayOrigin: string
  readonly commitTimeoutMs: number
  readonly fileKey: string
  readonly filePath: string
  readonly unitId: string
  readonly unitType: number
  readonly worktreeId?: string
}

/** Inspection query understood by the bundled SDK inspector. */
export type UnitContentInspectionQuery =
  | { readonly kind: 'workbook' }
  | { readonly kind: 'presentation' }
  | { readonly kind: 'document' }
  | { readonly kind: 'base' }
  | { readonly kind: 'board' }
  | {
      readonly kind: 'board-element'
      readonly elements: readonly [{ readonly id: string }, ...Array<{ readonly id: string }>]
    }
  | {
      readonly kind: 'worksheet-range'
      readonly ranges: readonly [{ readonly range: string; readonly worksheet: { readonly name: string } | { readonly index: number } }]
    }

/** One operation accepted by the package-local worker. */
export type UnitContentWorkerRequest =
  | (UnitContentWorkerTarget & { readonly operation: 'inspect'; readonly query: UnitContentInspectionQuery })
  | (UnitContentWorkerTarget & { readonly operation: 'execute'; readonly code: string; readonly worktreeId: string })
  | (UnitContentWorkerTarget & { readonly operation: 'export'; readonly outputPath: string })
  | (UnitContentWorkerTarget & { readonly operation: 'render-source' })
  | { readonly operation: 'import'; readonly sourcePath: string; readonly unitType: number }

/** Process response envelope emitted once on stdout. */
export type UnitContentWorkerEnvelope =
  | { readonly ok: true; readonly result: JsonValue }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

/** Validate the untrusted process response. */
export function parseUnitContentWorkerEnvelope(value: unknown): UnitContentWorkerEnvelope | null {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return null
  if (value.ok === true && 'result' in value) return value as UnitContentWorkerEnvelope
  if (value.ok !== false || !isRecord(value.error)) return null
  if (typeof value.error.code !== 'string' || typeof value.error.message !== 'string') return null
  return value as UnitContentWorkerEnvelope
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
