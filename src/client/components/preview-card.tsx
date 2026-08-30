import * as React from 'react'
import type { ConversationTimelineSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  outcomeOfTurnFile, resolveTurnFiles, type UniverTurnFile, type UniverTurnMatch,
} from '../conversation/univer-turn-definition.ts'
import { useUniverStates } from '../hooks/use-univer-state.ts'
import type { ViewerLocaleInjected } from '../viewer-locale.ts'
import { ReviewPanel } from './review-panel.tsx'

export type PreviewCardProps = PropsRuntime<'conversation.chat.turnTail'> & PropsLocale<'univer'> & ViewerLocaleInjected & { readonly matched: UniverTurnMatch }

interface SplitSnapshotPreviewCardProps extends PreviewCardProps {
  readonly useChat?: <Selected>(selector: (snapshot: { readonly timeline: ConversationTimelineSnapshot }) => Selected) => Selected
}

/** DSH 0.1.1-rc.2 adapter: Chat remains nested in the Session snapshot. */
export function CombinedSnapshotPreviewCard(props: PreviewCardProps): React.ReactElement {
  const timeline = props.useSession((snapshot) => snapshot.chat.timeline)
  return <PreviewCardContent {...props} timeline={timeline} />
}

/** DSH 0.1.2-alpha.1 adapter: Chat owns its independently selected snapshot. */
export function SplitSnapshotPreviewCard(props: SplitSnapshotPreviewCardProps): React.ReactElement {
  if (props.useChat === undefined) throw new Error('dsh-univer-office: split DSH Client supplied no Chat selector')
  const timeline = props.useChat((snapshot) => snapshot.timeline)
  return <PreviewCardContent {...props} timeline={timeline} />
}

/** Render one unified Univer card for every file touched during the owning Turn. */
function PreviewCardContent(props: PreviewCardProps & { readonly timeline: ConversationTimelineSnapshot }): React.ReactElement {
  const cwd = props.useSessions((state) => state.byId[props.sessionId]?.cwd)
  const files = React.useMemo(() => resolveTurnFiles(props.matched.files, cwd), [props.matched.files, cwd])
  const { states, missingFiles } = useUniverStates(files.map((entry) => entry.file), props.sessionId)
  const latestTurns = React.useMemo(() => latestWorktreeTurns(props.timeline), [props.timeline])
  return <>{files.map((target) => {
    // Bash or another tool may remove a temporary file after its structured Univer operations.
    // The Host's current workspace state is authoritative, so no historical shell is rendered.
    if (missingFiles.has(target.file)) return null
    const outcome = outcomeOfTurnFile(target)
    const worktreeId = outcome.primaryWorktreeId ?? pendingWorktree(target)
    const historical = worktreeId !== null && latestTurns.get(worktreeId) !== props.matched.turn
    return <ReviewPanel
      key={target.file}
      file={target.file}
      state={states[target.file]}
      worktreeId={worktreeId}
      preferredUnitId={outcome.preferredUnitId}
      historical={historical}
      t={props.t}
      viewerLocale={props.getViewerLocale()}
    />
  })}</>
}

function pendingWorktree(target: UniverTurnFile): string | null {
  for (let index = target.operations.length - 1; index >= 0; index -= 1) {
    const operation = target.operations[index]
    if (operation !== undefined && operation.worktreeId !== null) return operation.worktreeId
  }
  return null
}

function latestWorktreeTurns(timeline: ConversationTimelineSnapshot): Map<string, number> {
  const latest = new Map<string, number>()
  for (const [turnNumber, turn] of timeline.turns) {
    const data = turn.data.get('univerTurn')
    if (data === undefined) continue
    for (const file of data.files) {
      for (const operation of file.operations) {
        if (operation.worktreeId !== null) latest.set(operation.worktreeId, turnNumber)
      }
    }
  }
  return latest
}
