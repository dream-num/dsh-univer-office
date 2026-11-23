import * as React from 'react'
import { createPortal } from 'react-dom'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ConversationTimelineSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { FileState } from '../../shared/wire/state.ts'
import {
  opensFloatingWindow,
  turnFilesOfTimeline,
  type UniverTurnOperation
} from '../conversation/univer-turn-definition.ts'
import { useUniverStates } from '../hooks/use-univer-state.ts'
import type { UniverPreferences } from '../settings/univer-preferences.ts'
import type { ViewerLocaleInjected } from '../viewer-locale.ts'
import { WorktreeWindow } from './worktree-window.tsx'

interface UniverDockShared extends PropsLocale<'univer'>, ViewerLocaleInjected {
  readonly dismissedFiles: Map<SessionId, Set<string>>
  readonly preferences: UniverPreferences
}

export type UniverDockProps = PropsRuntime<'conversation.input.dock'> & UniverDockShared

const MAX_WINDOWS = 3

interface OpenWindow {
  readonly callId: string
  readonly file: string
  readonly worktreeId: string | null
  readonly preferredUnitId: string | null
}

/** Float one live Worktree window per file opened during the running Turn. */
export function UniverDock(props: UniverDockProps): React.ReactElement {
  const timeline = props.useChat((snapshot: ChatSnapshot) => snapshot.timeline)
  const cwd = props.useSessions((state: SessionListState) => state.byId[props.sessionId]?.cwd)
  return (
    <UniverSessionDock
      key={props.sessionId}
      {...props}
      timeline={timeline}
      cwd={cwd}
      running={props.session?.running === true}
    />
  )
}

/** A keyed owner prevents open-window intent from crossing DSH session boundaries. */
function UniverSessionDock(
  props: UniverDockShared & {
    readonly sessionId: SessionId
    readonly timeline: ConversationTimelineSnapshot | undefined
    readonly cwd: string | undefined
    readonly running: boolean
  }
): React.ReactElement {
  const turnFiles = React.useMemo(
    () => turnFilesOfTimeline(props.timeline, props.cwd),
    [props.timeline, props.cwd]
  )
  const latestTurn = props.timeline?.turnOrder.at(-1)
  const latestFiles =
    latestTurn === undefined
      ? undefined
      : props.timeline?.turns.get(latestTurn)?.data.get('univerTurn')?.files
  const currentCalls = React.useMemo(
    () =>
      new Map(
        latestFiles?.flatMap(({ operations }) => operations.map((op) => [op.callId, op] as const))
      ),
    [latestFiles]
  )
  const [open, setOpen] = React.useState<Record<string, OpenWindow>>({})
  const seen = React.useRef(new Set<string>())
  const livePreviewEnabled = React.useSyncExternalStore(
    props.preferences.subscribe,
    () => props.preferences.getSnapshot().livePreview,
    () => props.preferences.getSnapshot().livePreview
  )

  const { dismissedFiles, sessionId } = props

  React.useEffect(() => {
    if (!livePreviewEnabled) return
    const additions: OpenWindow[] = []
    for (const file of turnFiles) {
      if (dismissedFiles.get(sessionId)?.has(file.file)) continue
      for (const operation of file.operations) {
        if (operation.phase === 'failed' || !opensFloatingWindow(operation)) continue
        const candidate = openWindowOf(operation, file.file)
        if (candidate === null || seen.current.has(operation.callId)) continue
        seen.current.add(operation.callId)
        additions.push(candidate)
      }
    }
    if (additions.length === 0) return
    setOpen((previous) => {
      const next = { ...previous }
      for (const addition of additions) {
        if (Object.hasOwn(next, addition.file) || Object.keys(next).length < MAX_WINDOWS)
          next[addition.file] = addition
      }
      return next
    })
  }, [turnFiles, livePreviewEnabled, dismissedFiles, sessionId])

  // Rebind when a file switches worktrees. An older, in-flight listing cannot retire its successor.
  const reconcile = React.useCallback(
    (file: string, state: FileState | null) => {
      const target = open[file]
      if (target === undefined) return
      const call = currentCalls.get(target.callId)
      if (state === null && call?.name === 'new' && call.phase === 'pending') return
      if (state !== null && isLiveTarget(target, state)) return
      setOpen((previous) => {
        if (previous[file] !== target) return previous
        const next = { ...previous }
        delete next[file]
        return next
      })
    },
    [open, currentCalls]
  )
  const { states } = useUniverStates(
    props.running && livePreviewEnabled ? Object.keys(open) : [],
    props.sessionId,
    reconcile
  )

  if (!props.running || !livePreviewEnabled) return <></>
  const windows = Object.values(open).filter((target) => {
    if (currentCalls.has(target.callId)) return true
    const state = states[target.file]
    return state !== undefined && isLiveTarget(target, state)
  })
  if (windows.length === 0) return <></>
  // The input dock renders inside a translucent, non-draggable container.
  // Portaling avoids inheriting that container's opacity and hit-testing.
  return createPortal(
    <div className="uvf_root">
      {windows.map((target, stackIndex) => (
        <WorktreeWindow
          key={target.file}
          file={target.file}
          state={states[target.file]}
          worktreeId={target.worktreeId}
          preferredUnitId={target.preferredUnitId}
          stackIndex={stackIndex}
          t={props.t}
          viewerLocale={props.getViewerLocale()}
          onDismiss={() => {
            const closed = dismissedFiles.get(sessionId) ?? new Set<string>()
            closed.add(target.file)
            dismissedFiles.set(sessionId, closed)
            setOpen((previous) => {
              const next = { ...previous }
              delete next[target.file]
              return next
            })
          }}
        />
      ))}
    </div>,
    document.body
  )
}

function openWindowOf(operation: UniverTurnOperation, file: string): OpenWindow | null {
  const worktreeId = operation.name === 'new' ? null : operation.worktreeId
  if (operation.name !== 'new' && worktreeId === null) return null
  return { callId: operation.callId, file, worktreeId, preferredUnitId: operation.unitId }
}

function isLiveTarget(target: OpenWindow, state: FileState): boolean {
  if (target.worktreeId === null) return true
  return state.worktrees.some(
    (entry) =>
      entry.worktreeId === target.worktreeId &&
      (entry.status === 'draft' || entry.status === 'ready')
  )
}
