import type {
  ConversationNodeDefinition, ConversationSnapshot,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'

export type UniverOperationName = 'new' | 'status' | 'worktree' | 'unit' | 'import' | 'inspect' | 'execute' | 'export' | 'lint' | 'screenshot' | 'compile-svg'
export type UniverOperationPhase = 'pending' | 'succeeded' | 'failed'
export type UniverTurnLifecycle = 'trunk' | 'draft' | 'ready' | 'merged' | 'discarded' | 'unchanged'

/** One durable Univer tool operation recovered from a call/result pair. */
export interface UniverTurnOperation {
  readonly callId: string
  readonly name: UniverOperationName
  readonly action: string | null
  readonly file: string
  readonly worktreeId: string | null
  readonly unitId: string | null
  readonly phase: UniverOperationPhase
}

/** All Univer operations for one file in one Turn. */
export interface UniverTurnFile {
  readonly file: string
  readonly operations: readonly UniverTurnOperation[]
}

/** Replay-safe Turn projection published into the conversation timeline. */
export interface UniverTurnData {
  readonly files: readonly UniverTurnFile[]
}

export interface UniverTurnMatch extends UniverTurnData {
  readonly turn: number
}

export interface UniverTurnOutcome {
  readonly primaryWorktreeId: string | null
  readonly lifecycle: UniverTurnLifecycle
  readonly preferredUnitId: string | null
  readonly changedContent: boolean
}

interface UniverTurnState extends UniverTurnData {
  readonly turn: number
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  interface ConversationTurnDataMap {
    /** Structured Univer operations performed during this Turn. */
    univerTurn: UniverTurnData
  }
}

/** Project structured Univer tool calls and results into a replay-safe Turn log. */
export const univerTurnDefinition = {
  kind: 'univerTurn',
  match(event: SessionEvent) {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event.type === 'tool/call' || event.type === 'tool/result') return { id: String(event.data.turn), role: 'update' }
    return null
  },
  start(_context, match): UniverTurnState {
    if (match.event.type !== 'turn/start') throw new Error('univerTurn start match must be turn/start')
    return { turn: match.event.data.turn, files: [] }
  },
  update(context, match): UniverTurnState {
    if (match.event.type === 'tool/call') return addCall(context.state, match.event.data)
    if (match.event.type === 'tool/result') return applyResult(context.state, match.event.data)
    return context.state
  },
  buildLocationData(context, scope) {
    if (scope !== 'turn' || context.state === undefined) return null
    return { kind: 'turn', turn: context.state.turn, key: 'univerTurn', value: { files: context.state.files } }
  },
} satisfies ConversationNodeDefinition<UniverTurnState>

/** Select a Turn-tail surface only when that Turn contains file-scoped Univer operations. */
export function selectUniverTurn(owner: TurnTailOwnerProps): UniverTurnMatch | null {
  const data = owner.turn.data.get('univerTurn')
  if (data === undefined || data.files.length === 0) return null
  return { turn: owner.turn.turn, files: data.files }
}

/** Resolve relative files and combine call/result paths that identify the same workspace file. */
export function resolveTurnFiles(files: readonly UniverTurnFile[], cwd?: string): UniverTurnFile[] {
  const unique = new Map<string, UniverTurnFile>()
  for (const target of files) {
    const file = resolveTargetFile(target.file, cwd)
    const previous = unique.get(file)
    unique.set(file, {
      file,
      operations: [...previous?.operations ?? [], ...target.operations.map((operation) => ({ ...operation, file }))],
    })
  }
  return [...unique.values()]
}

/** Reduce operation semantics without allowing later reads to erase lifecycle transitions. */
export function outcomeOfTurnFile(target: UniverTurnFile): UniverTurnOutcome {
  let primaryWorktreeId: string | null = null
  let lifecycle: UniverTurnLifecycle = 'unchanged'
  let preferredUnitId: string | null = null
  let changedContent = false
  for (const operation of target.operations) {
    if (operation.phase !== 'succeeded') continue
    if (operation.unitId !== null) preferredUnitId = operation.unitId
    if (operation.name === 'new') {
      lifecycle = 'trunk'
      primaryWorktreeId = null
      changedContent = true
      continue
    }
    if (operation.name === 'worktree') {
      if (operation.action === 'create' || operation.action === 'reopen') {
        primaryWorktreeId = operation.worktreeId
        lifecycle = 'draft'
      } else if (operation.action === 'ready') {
        primaryWorktreeId = operation.worktreeId
        lifecycle = 'ready'
      } else if (operation.action === 'merge') {
        primaryWorktreeId = operation.worktreeId
        lifecycle = 'merged'
      } else if (operation.action === 'discard') {
        primaryWorktreeId = operation.worktreeId
        lifecycle = 'discarded'
      }
      continue
    }
    if (isWrite(operation)) {
      changedContent = true
      if (lifecycle === 'unchanged' || lifecycle === 'trunk' || lifecycle === 'draft') {
        primaryWorktreeId = operation.worktreeId
        lifecycle = 'draft'
      }
      continue
    }
    if (primaryWorktreeId === null && operation.worktreeId !== null) primaryWorktreeId = operation.worktreeId
  }
  return { primaryWorktreeId, lifecycle, preferredUnitId, changedContent }
}

/** Targets referenced anywhere in a session, used to restore deliberate floating-window intent. */
export function turnFilesOfSession(session: ConversationSnapshot | undefined, cwd?: string): UniverTurnFile[] {
  if (session === undefined) return []
  const files: UniverTurnFile[] = []
  for (const turn of session.chat.timeline.turns.values()) {
    const data = turn.data.get('univerTurn')
    if (data !== undefined) files.push(...data.files)
  }
  return resolveTurnFiles(files, cwd)
}

/** Whether an operation may deliberately open or restore the live Univer window. */
export function opensFloatingWindow(operation: UniverTurnOperation): boolean {
  if (operation.name === 'new') return true
  if (operation.name === 'worktree') {
    return operation.action === 'create' || operation.action === 'reopen' || operation.action === 'ready'
  }
  return isWrite(operation)
}

function addCall(state: UniverTurnState, data: SessionEvent<'tool/call'>['data']): UniverTurnState {
  const name = operationName(data.name)
  if (name === null) return state
  const args = parseRecord(data.arguments)
  if (args === null || typeof args.file !== 'string') return state
  const operation: UniverTurnOperation = {
    callId: data.callId,
    name,
    action: typeof args.action === 'string' ? args.action : null,
    file: args.file,
    worktreeId: typeof args.worktreeId === 'string' ? args.worktreeId : null,
    unitId: typeof args.unitId === 'string' ? args.unitId : null,
    phase: 'pending',
  }
  return { ...state, files: appendOperation(state.files, operation) }
}

function applyResult(state: UniverTurnState, data: SessionEvent<'tool/result'>['data']): UniverTurnState {
  const callId = data.message.content[0].toolCallId
  const structured = structuredResult(data)
  let matched: UniverTurnOperation | undefined
  for (const file of state.files) {
    const operation = file.operations.find((entry) => entry.callId === callId)
    if (operation !== undefined) matched = operation
  }
  if (matched === undefined && structured === null) return state
  const result = structured === null || !isRecord(structured.result) ? null : structured.result
  const name = matched?.name ?? operationName(typeof structured?.operation === 'string' ? `univer_${structured.operation.replace('-', '_')}` : '')
  const file = typeof structured?.file === 'string' ? structured.file : matched?.file
  if (name === null || name === undefined || file === undefined) return state
  const operation: UniverTurnOperation = {
    callId,
    name,
    action: typeof result?.action === 'string' ? result.action : matched?.action ?? null,
    file,
    worktreeId: typeof result?.worktreeId === 'string' ? result.worktreeId : matched?.worktreeId ?? null,
    unitId: typeof result?.unitId === 'string' ? result.unitId : matched?.unitId ?? null,
    phase: data.error === undefined && data.message.content[0].isError !== true ? 'succeeded' : 'failed',
  }
  const withoutCall = state.files.flatMap((entry) => {
    const operations = entry.operations.filter((candidate) => candidate.callId !== callId)
    return operations.length === 0 ? [] : [{ ...entry, operations }]
  })
  return { ...state, files: appendOperation(withoutCall, operation) }
}

function appendOperation(files: readonly UniverTurnFile[], operation: UniverTurnOperation): UniverTurnFile[] {
  const next = [...files]
  const index = next.findIndex((entry) => entry.file === operation.file)
  if (index === -1) next.push({ file: operation.file, operations: [operation] })
  else {
    const previous = next[index]
    if (previous !== undefined) next[index] = { ...previous, operations: [...previous.operations, operation] }
  }
  return next
}

function structuredResult(data: SessionEvent<'tool/result'>['data']): Record<string, unknown> | null {
  const text = data.message.content[0].content.flatMap((block) => block.type === 'text' ? [block.text] : []).join('\n')
  const firstBrace = text.indexOf('{')
  return firstBrace === -1 ? null : parseRecord(text.slice(firstBrace))
}

function operationName(name: string): UniverOperationName | null {
  if (!name.startsWith('univer_')) return null
  const operation = name.slice('univer_'.length).replaceAll('_', '-')
  if (operation === 'new' || operation === 'status' || operation === 'worktree' || operation === 'unit' || operation === 'import' || operation === 'inspect' || operation === 'execute' || operation === 'export' || operation === 'lint' || operation === 'screenshot' || operation === 'compile-svg') return operation
  return null
}

function isWrite(operation: UniverTurnOperation): boolean {
  return operation.name === 'execute' || operation.name === 'import' || operation.name === 'unit' || operation.name === 'compile-svg'
}

function parseRecord(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

function resolveTargetFile(file: string, cwd?: string): string {
  const windows = isWindowsPath(file) || (cwd !== undefined && isWindowsPath(cwd))
  if (isAbsolute(file) || cwd === undefined || cwd === '') return normalizeSeparators(file, windows)
  const separator = windows ? '\\' : '/'
  const resolved = `${cwd.replace(/[\\/]+$/, '')}${separator}${file.replace(/^\.[\\/]/, '')}`
  return normalizeSeparators(resolved, windows)
}

function isAbsolute(file: string): boolean {
  return file.startsWith('/') || file.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(file)
}

function isWindowsPath(file: string): boolean {
  return file.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(file)
}

function normalizeSeparators(file: string, windows: boolean): string {
  return windows ? file.replaceAll('/', '\\') : file
}

export function basename(file: string): string {
  const at = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'))
  return at === -1 ? file : file.slice(at + 1)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
