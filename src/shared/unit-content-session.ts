import { prepareContentExecutionProgram } from '@univer-cli/content-execution'
import { inspectContent, type ContentInspectionQuery } from '@univer-cli/content-inspection'
import type {
  CollaborationCommitResult,
  CollaborationPullResult,
  CollaborationRuntimeReadExecution,
  CollaborationRuntimeReadResult,
  CollaborationRuntimeState,
  CollaborationRuntimeWriteExecution,
  CollaborationRuntimeWriteResult,
  CollaborationUnitData
} from '@univer-cli/univer-collaboration-runtime'

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/**
 * The Collaboration Runtime surface Unit content operations need. A runtime loaded in the
 * one-shot Unit Content Worker and a lease from the Host's runtime pool both satisfy it.
 */
export interface UnitContentSession {
  readonly unitId: string
  readonly unitType: number
  getState(): CollaborationRuntimeState | Promise<CollaborationRuntimeState>
  execute(input: CollaborationRuntimeReadExecution): Promise<CollaborationRuntimeReadResult>
  execute(input: CollaborationRuntimeWriteExecution): Promise<CollaborationRuntimeWriteResult>
  pull(): Promise<CollaborationPullResult>
  commit(): Promise<CollaborationCommitResult>
  exportUnitData(): Promise<CollaborationUnitData>
}

/** Execution outcome before the caller adds its file and scope fields. */
export interface UnitContentExecution {
  readonly committed: boolean
  readonly revision?: number
  readonly value: JsonValue
}

/** Apply every confirmed remote changeset; a conflict means the session must be reloaded. */
export async function pullUnitContent(session: UnitContentSession): Promise<void> {
  const pulled = await session.pull()
  if (pulled.status === 'conflict') {
    throw unitContentError('UNIT_CONTENT_CONFLICT', pulled.conflict.message)
  }
}

/** Project the session's Unit through the bundled SDK inspector. */
export async function inspectUnitContent(
  session: UnitContentSession,
  query: ContentInspectionQuery
): Promise<JsonValue> {
  return (await inspectContent(
    {
      unitId: session.unitId,
      unitType: unitContentKind(session.unitType),
      async execute(input) {
        const result = await session.execute(input)
        return { value: result.value }
      }
    },
    query
  )) as unknown as JsonValue
}

/** Run Facade code in write mode and commit whatever it changed. */
export async function executeUnitContent(
  session: UnitContentSession,
  code: string
): Promise<UnitContentExecution> {
  const program = prepareContentExecutionProgram({
    code,
    unitId: session.unitId,
    unitType: unitContentKind(session.unitType)
  })
  const execution = await session.execute({ code: program, mode: 'write' })
  const value = execution.value as JsonValue
  if (execution.mutations.length === 0) return { committed: false, value }
  return { committed: true, revision: await commitAll(session), value }
}

async function commitAll(session: UnitContentSession): Promise<number> {
  const statuses: string[] = []
  const initialRevision = (await session.getState()).baseRevision
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await session.commit()
    statuses.push(result.status)
    if (result.status === 'confirmed') return result.state.baseRevision
    if (result.status === 'nothing-to-commit') {
      if (result.state.baseRevision > initialRevision) return result.state.baseRevision
      throw unitContentError(
        'UNIT_CONTENT_COMMIT_INVALID',
        'Unit content had no mutation to commit'
      )
    }
    if (result.status === 'unknown') {
      await pullUnitContent(session)
      const state = await session.getState()
      if (
        state.awaitingChangeset === null &&
        state.pendingMutationCount === 0 &&
        state.baseRevision > initialRevision
      ) {
        return state.baseRevision
      }
      continue
    }
    if (result.status === 'retry') continue
    if (result.status === 'pull-required') {
      await pullUnitContent(session)
      continue
    }
    if (result.status === 'conflict') {
      throw unitContentError('UNIT_CONTENT_CONFLICT', result.conflict.message)
    }
    throw unitContentError(
      'UNIT_CONTENT_COMMIT_INVALID',
      'Unit content discarded pending mutations before commit'
    )
  }
  throw unitContentError(
    'UNIT_CONTENT_COMMIT_RETRY_EXHAUSTED',
    `Unit content commit could not be confirmed after three attempts (${statuses.join(', ')})`
  )
}

/** Unit kind names shared with the SDK content packages; values follow `UniverInstanceType`. */
export function unitContentKind(type: number): 'sheet' | 'doc' | 'slide' | 'base' | 'board' {
  switch (type) {
    case 1:
      return 'doc'
    case 2:
      return 'sheet'
    case 3:
      return 'slide'
    case 5:
      return 'base'
    case 6:
      return 'board'
    default:
      throw unitContentError(
        'UNIT_CONTENT_TYPE_UNSUPPORTED',
        `Unsupported Unit type ${String(type)}`
      )
  }
}

/** Error carrying a stable `code`, the shape every Unit content boundary reports. */
export function unitContentError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code })
}
