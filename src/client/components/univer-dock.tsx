import * as React from 'react'
import { createPortal } from 'react-dom'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ConversationTimelineSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  opensFloatingWindow, turnFilesOfTimeline, type UniverTurnOperation,
} from '../conversation/univer-turn-definition.ts'
import { useUniverStates } from '../hooks/use-univer-state.ts'
import type { LivePreviewPreference } from '../settings/live-preview-preference.ts'
import type { ViewerLocaleInjected } from '../viewer-locale.ts'
import { WorktreeWindow } from './worktree-window.tsx'

interface UniverDockShared extends PropsLocale<'univer'>, ViewerLocaleInjected {
  readonly livePreview: LivePreviewPreference
}

export type UniverDockProps = PropsRuntime<'conversation.input.dock'> & UniverDockShared

interface LegacyUniverDockProps extends UniverDockShared {
  readonly sessionId: SessionId
  readonly session: {
    readonly running: boolean
    readonly chat: { readonly timeline: ConversationTimelineSnapshot }
  } | undefined
  readonly useSessions: <Selected>(selector: (snapshot: {
    readonly byId: Readonly<Record<string, { readonly cwd?: string }>>
  }) => Selected) => Selected
}

interface OpenWindow {
  readonly file: string
  readonly worktreeId: string | null
  readonly preferredUnitId: string | null
}

/** DSH 0.1.1-rc.2 adapter: Chat remains nested in the input owner's Session snapshot. */
export function CombinedSnapshotUniverDock(props: LegacyUniverDockProps): React.ReactElement {
  const cwd = props.useSessions((state) => state.byId[props.sessionId]?.cwd)
  return <UniverSessionDock
    key={props.sessionId}
    {...props}
    timeline={props.session?.chat.timeline}
    cwd={cwd}
    running={props.session?.running === true}
  />
}

/** DSH 0.1.2-alpha.1 adapter: Chat owns its independently selected snapshot. */
export function SplitSnapshotUniverDock(props: UniverDockProps): React.ReactElement {
  const timeline = props.useChat((snapshot: ChatSnapshot) => snapshot.timeline)
  const cwd = props.useSessions((state: SessionListState) => state.byId[props.sessionId]?.cwd)
  return <UniverSessionDock
    key={props.sessionId}
    {...props}
    timeline={timeline}
    cwd={cwd}
    running={props.session?.running === true}
  />
}

/** A keyed owner prevents open-window intent from crossing DSH session boundaries. */
function UniverSessionDock(props: UniverDockShared & {
  readonly sessionId: SessionId
  readonly timeline: ConversationTimelineSnapshot | undefined
  readonly cwd: string | undefined
  readonly running: boolean
}): React.ReactElement {
  const turnFiles = React.useMemo(() => turnFilesOfTimeline(props.timeline, props.cwd), [props.timeline, props.cwd])
  const [open, setOpen] = React.useState<Record<string, OpenWindow>>({})
  const seen = React.useRef(new Set<string>())
  const livePreviewEnabled = React.useSyncExternalStore(
    props.livePreview.subscribe,
    props.livePreview.getSnapshot,
    props.livePreview.getSnapshot,
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
  const { states } = useUniverStates(props.running && livePreviewEnabled ? files : [], props.sessionId)

  React.useEffect(() => {
    setOpen((previous) => {
      let changed = false
      const next = { ...previous }
      for (const target of Object.values(previous)) {
        if (target.worktreeId === null) continue
        const worktree = states[target.file]?.worktrees.find((entry) => entry.worktreeId === target.worktreeId)
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
  // DSH 0.1.2-alpha.1 renders the input dock inside a translucent, non-draggable
  // container. Portaling avoids inheriting that container's opacity and hit-testing.
  return createPortal(<div className="uvf_root">{windows.map((target, stackIndex) => <WorktreeWindow
    key={target.file}
    file={target.file}
    state={states[target.file]}
    worktreeId={target.worktreeId}
    preferredUnitId={target.preferredUnitId}
    stackIndex={stackIndex}
    t={props.t}
    viewerLocale={props.getViewerLocale()}
    onDismiss={() => setOpen((previous) => {
      const next = { ...previous }
      delete next[target.file]
      return next
    })}
  />)}</div>, document.body)
}

function openWindowOf(operation: UniverTurnOperation, file: string): OpenWindow | null {
  if (operation.name === 'new') return { file, worktreeId: null, preferredUnitId: operation.unitId }
  if (operation.worktreeId === null) return null
  return { file, worktreeId: operation.worktreeId, preferredUnitId: operation.unitId }
}
