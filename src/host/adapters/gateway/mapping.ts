import type { ChangedUnit, UnitChangeKind, WorktreeStatus } from '../../../shared/wire/state.ts'
import type { JsonValue } from '../../service/types.ts'

/** Gateway collaboration record after validation. */
export interface GatewayWorktree {
  readonly worktreeId: string
  readonly name: string
  readonly status: WorktreeStatus
  readonly baseline: Readonly<Record<string, number>>
  readonly createdAt?: string
  readonly mergedAt?: string
}

/** Unit record returned by trunk and worktree listings. */
export interface GatewayUnit {
  readonly unitId: string
  readonly name: string
  readonly type: number
  readonly headRev: number
}

/** Validate and map a Gateway worktree listing. */
export function mapWorktrees(value: JsonValue): GatewayWorktree[] {
  if (!isRecord(value) || !Array.isArray(value.worktrees)) return []
  return value.worktrees.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.worktreeId !== 'string' || !isWorktreeStatus(entry.status))
      return []
    return [
      {
        worktreeId: entry.worktreeId,
        name: typeof entry.name === 'string' ? entry.name : '',
        status: entry.status,
        baseline: numberRecord(entry.baseline),
        ...(typeof entry.createdAt === 'string' ? { createdAt: entry.createdAt } : {}),
        ...(typeof entry.mergedAt === 'string' ? { mergedAt: entry.mergedAt } : {})
      }
    ]
  })
}

/** Validate and map a Gateway Unit listing. */
export function mapUnits(value: JsonValue): GatewayUnit[] {
  if (!isRecord(value) || !Array.isArray(value.units)) return []
  return value.units.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.unitId !== 'string' || typeof entry.type !== 'number')
      return []
    return [
      {
        unitId: entry.unitId,
        name: typeof entry.name === 'string' ? entry.name : '',
        type: entry.type,
        headRev:
          typeof entry.headRev === 'number' && Number.isSafeInteger(entry.headRev)
            ? entry.headRev
            : 0
      }
    ]
  })
}

function numberRecord(value: JsonValue | undefined): Readonly<Record<string, number>> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === 'number' && Number.isSafeInteger(entry) ? [[key, entry]] : []
    )
  )
}

/** Validate and map changed units from a Gateway merge preview. */
export function mapChangedUnits(value: JsonValue): ChangedUnit[] {
  if (!isRecord(value) || !Array.isArray(value.units)) return []
  return value.units.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.unitId !== 'string' || entry.status === 'unchanged')
      return []
    const kind = changeKind(entry.status)
    if (kind === null) return []
    return [
      {
        unitId: entry.unitId,
        name: typeof entry.name === 'string' ? entry.name : '',
        type: unitKind(entry.type),
        kind
      }
    ]
  })
}

/** Determine whether a JSON value is a string-keyed object. */
export function isRecord(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWorktreeStatus(value: JsonValue | undefined): value is WorktreeStatus {
  return value === 'draft' || value === 'ready' || value === 'merged' || value === 'discarded'
}

function changeKind(value: JsonValue | undefined): UnitChangeKind | null {
  if (value === 'created') return 'added'
  if (value === 'modified') return 'modified'
  if (value === 'deleted') return 'deleted'
  if (value === 'conflict') return 'conflict'
  return null
}

/** Map a Gateway numeric Unit type to its public kind. */
export function unitKind(value: JsonValue | undefined): string | null {
  if (value === 1) return 'doc'
  if (value === 2) return 'sheet'
  if (value === 3) return 'slide'
  if (value === 5) return 'base'
  if (value === 6) return 'board'
  return null
}
