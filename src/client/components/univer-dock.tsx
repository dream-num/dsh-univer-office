import * as React from 'react'
import { createPortal } from 'react-dom'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ConversationTimelineSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
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
  readonly preferences: UniverPreferences
}

export type UniverDockProps = PropsRuntime<'conversation.input.dock'> & UniverDockShared

interface OpenWindow {
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
  const [open, setOpen] = React.useState<Record<string, OpenWindow>>({})
  const seen = React.useRef(new Set<string>())
  const livePreviewEnabled = React.useSyncExternalStore(
    props.preferences.subscribe,
    () => props.preferences.getSnapshot().livePreview,
    () => props.preferences.getSnapshot().livePreview
  )

  React.useEffect(() => {
    if (!livePreviewEnabled) return
    const additions: OpenWindow[] = []
    for (const file of turnFiles) {
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
      for (const addition of additions) next[addition.file] = addition
      return next
    })
  }, [turnFiles, livePreviewEnabled])

  const files = Object.keys(open)
  const { states } = useUniverStates(
    props.running && livePreviewEnabled ? files : [],
    props.sessionId
  )

  React.useEffect(() => {
    setOpen((previous) => {
      let changed = false
      const next = { ...previous }
      for (const target of Object.values(previous)) {
        if (target.worktreeId === null) continue
        const worktree = states[target.file]?.worktrees.find(
          (entry) => entry.worktreeId === target.worktreeId
        )
        if (worktree?.status === 'merged' || worktree?.status === 'discarded') {
          delete next[target.file]
          changed = true
        }
      }
      return changed ? next : previous
    })
  }, [states])

  if (!props.running || !livePreviewEnabled) return <></>
  const windows = Object.values(open)
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
          onDismiss={() =>
            setOpen((previous) => {
              const next = { ...previous }
              delete next[target.file]
              return next
            })
          }
        />
      ))}
    </div>,
    document.body
  )
}

function openWindowOf(operation: UniverTurnOperation, file: string): OpenWindow | null {
  if (operation.name === 'new') return { file, worktreeId: null, preferredUnitId: operation.unitId }
  if (operation.worktreeId === null) return null
  return { file, worktreeId: operation.worktreeId, preferredUnitId: operation.unitId }
}
