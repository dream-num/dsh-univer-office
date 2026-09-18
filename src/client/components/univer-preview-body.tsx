import * as React from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { FileState, WorktreeState } from '../../shared/wire/state.ts'
import { useUniverFileView } from '../hooks/use-univer-file-view.ts'
import type { UniverFileView } from '../hooks/use-univer-file-view.ts'
import { useUniverLocale } from '../hooks/use-univer-locale.ts'
import { localizeViewerUrl } from '../viewer-locale.ts'

/**
 * The on-demand `.univer` preview body, shared by every entry point that opens
 * one — the native right Sidebar and the optional dsh-better-sidebar file
 * viewer. Each entry point resolves this file's path and session by its own
 * route and hands them over; everything below that is identical, so the
 * loading, missing and Gateway states, the Viewer target and the worktree
 * switch exist once.
 *
 * Unlike the Turn-tail card this surface has no Turn context, so it defaults to
 * the current version. It only offers the file's still-open worktrees as an
 * explicit switch, because opening a file must never silently hide work that is
 * still in progress.
 */
export function UniverPreviewBody(props: {
  readonly ctx: ClientContext
  readonly path: string
  readonly sessionId: string
  readonly title: string
  /** The entry point that opened this preview, for diagnostics. */
  readonly surface: string
}): React.ReactElement {
  const { t, viewerLocale } = useUniverLocale(props.ctx)
  // Entry points hand over the wire session id; branding it is this plugin's
  // client-side boundary conversion (the brand has no runtime representation).
  const view = useUniverFileView(props.path, props.sessionId as SessionId)
  const [selected, setSelected] = React.useState<string | null>(null)
  const state = view.kind === 'ready' ? view.state : undefined
  const openWorktrees = state === undefined ? [] : openWorktreesOf(state)
  // An absent match is the trunk: a closed or merged worktree needs no reset effect.
  const worktree = openWorktrees.find((entry) => entry.worktreeId === selected)
  const target = state === undefined ? undefined : viewerTarget(state, worktree)
  const url = target === undefined ? undefined : localizeViewerUrl(target, viewerLocale)

  return (
    <div className="uvf_fileView" data-surface={props.surface}>
      {openWorktrees.length === 0 ? null : (
        <div className="uvf_units" role="tablist" aria-label={props.title}>
          <FileScopeChip active={worktree === undefined} onClick={() => setSelected(null)}>
            {t('dock.currentVersion')}
          </FileScopeChip>
          {openWorktrees.map((entry) => (
            <FileScopeChip
              key={entry.worktreeId}
              active={entry.worktreeId === worktree?.worktreeId}
              onClick={() => setSelected(entry.worktreeId)}
            >
              {t(entry.status === 'ready' ? 'dock.mergeReady' : 'dock.draft')}
            </FileScopeChip>
          ))}
        </div>
      )}
      <div className="uvf_viewerShell">
        {url === undefined ? (
          <div className="uvf_note" data-file-view={view.kind}>
            <span>{noteLabel(view.kind, t)}</span>
            {view.kind === 'gateway' ? (
              <button type="button" onClick={() => void view.start()}>
                {t('dock.startGateway')}
              </button>
            ) : null}
          </div>
        ) : (
          <iframe className="uvf_frame" src={url} title={props.title} />
        )}
      </div>
    </div>
  )
}

/** Worktrees that can still be reviewed or edited; terminal states belong to history. */
function openWorktreesOf(state: FileState): readonly WorktreeState[] {
  return state.worktrees.filter((entry) => entry.status === 'draft' || entry.status === 'ready')
}

/**
 * The Viewer target for one scope. `ready` opens the merge preview, matching the
 * Turn-tail card's table; `draft` opens the worktree page; no worktree is trunk.
 * A Host-projected target the state omits falls through to `undefined`, which
 * renders the unavailable note instead of leaving a dead frame.
 */
function viewerTarget(state: FileState, worktree: WorktreeState | undefined): string | undefined {
  if (worktree === undefined) return state.viewerUrl ?? undefined
  const url = worktree.status === 'ready' ? worktree.mergeUrl : worktree.worktreeUrl
  return url ?? worktree.openUrl
}

function noteLabel(kind: UniverFileView['kind'], t: TranslateNS<'univer'>): string {
  if (kind === 'missing') return t('viewer.missing')
  if (kind === 'gateway') return t('dock.gatewayDown')
  return t('dock.loading')
}

function FileScopeChip(props: {
  readonly active: boolean
  readonly onClick: () => void
  readonly children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.active}
      className={`uvf_unit${props.active ? ' uvf_unit_on' : ''}`}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}
