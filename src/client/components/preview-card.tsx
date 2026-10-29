import * as React from 'react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ConversationTimelineSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  outcomeOfTurnFile,
  resolveTurnFiles,
  selectUniverTurn,
  type UniverTurnFile,
  type UniverTurnMatch
} from '../conversation/univer-turn-definition.ts'
import { useUniverStates } from '../hooks/use-univer-state.ts'
import type { UniverPreferences } from '../settings/univer-preferences.ts'
import type { ViewerLocaleInjected } from '../viewer-locale.ts'
import { ReviewPanel } from './review-panel.tsx'

interface PreviewCardShared extends PropsLocale<'univer'>, ViewerLocaleInjected {
  readonly matched: UniverTurnMatch
  readonly preferences: UniverPreferences
}

export type PreviewCardProps = PropsRuntime<'conversation.chat.turnTail'> &
  Omit<PreviewCardShared, 'matched'>

/**
 * List-slot entry for the Turn tail: list slots inject the owner props
 * directly instead of a chain `matched`, so the Turn match is resolved here.
 * Turns without Univer operations render nothing, and so does a Turn whose
 * review cards the user turned off in the plugin settings.
 */
export function PreviewCard(props: PreviewCardProps): React.ReactElement | null {
  const reviewCards = React.useSyncExternalStore(
    props.preferences.subscribe,
    () => props.preferences.getSnapshot().conversationReviewCards,
    () => props.preferences.getSnapshot().conversationReviewCards
  )
  const matched = selectUniverTurn(props)
  const timeline = props.useChat((snapshot: ChatSnapshot) => snapshot.timeline)
  const cwd = props.useSessions((state: SessionListState) => state.byId[props.sessionId]?.cwd)
  if (matched === null || !reviewCards) return null
  return <PreviewCardContent {...props} matched={matched} timeline={timeline} cwd={cwd} />
}

/** Render one unified Univer card for every file touched during the owning Turn. */
function PreviewCardContent(
  props: PreviewCardShared & {
    readonly sessionId: SessionId
    readonly timeline: ConversationTimelineSnapshot
    readonly cwd: string | undefined
  }
): React.ReactElement {
  const files = React.useMemo(
    () => resolveTurnFiles(props.matched.files, props.cwd),
    [props.matched.files, props.cwd]
  )
  const { states, missingFiles } = useUniverStates(
    files.map((entry) => entry.file),
    props.sessionId
  )
  const latestTurn = React.useMemo(() => latestCardTurn(props.timeline), [props.timeline])
  // Only the latest Turn with cards opens by default; folded cards mount no Viewer, so one
  // file has a single live Viewer however long the conversation grows (#99).
  const historical = latestTurn !== undefined && props.matched.turn < latestTurn
  return (
    <>
      {files.map((target) => {
        // Bash or another tool may remove a temporary file after its structured Univer operations.
        // The Host's current workspace state is authoritative, so no historical shell is rendered.
        if (missingFiles.has(target.file)) return null
        const outcome = outcomeOfTurnFile(target)
        const worktreeId = outcome.primaryWorktreeId ?? pendingWorktree(target)
        return (
          <ReviewPanel
            key={target.file}
            file={target.file}
            state={states[target.file]}
            worktreeId={worktreeId}
            preferredUnitId={outcome.preferredUnitId}
            historical={historical}
            t={props.t}
            viewerLocale={props.getViewerLocale()}
          />
        )
      })}
    </>
  )
}

function pendingWorktree(target: UniverTurnFile): string | null {
  for (let index = target.operations.length - 1; index >= 0; index -= 1) {
    const operation = target.operations[index]
    if (operation !== undefined && operation.worktreeId !== null) return operation.worktreeId
  }
  return null
}

/** The newest Turn that renders cards, matching `selectUniverTurn`; turns without Univer files do not count. */
function latestCardTurn(timeline: ConversationTimelineSnapshot): number | undefined {
  let latest: number | undefined
  for (const [turnNumber, turn] of timeline.turns) {
    const data = turn.data.get('univerTurn')
    if (data === undefined || data.files.length === 0) continue
    if (latest === undefined || turnNumber > latest) latest = turnNumber
  }
  return latest
}
