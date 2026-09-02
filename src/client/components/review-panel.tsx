import * as React from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { FileState, WorktreeState, WorktreeStatus } from '../../shared/wire/state.ts'
import { basename } from '../conversation/univer-turn-definition.ts'
import { localizeViewerUrl } from '../viewer-locale.ts'
import type { ViewerLocale } from '../viewer-locale.ts'
import { UnitChips, unitViewerUrl } from './unit-chips.tsx'

type CardStatus = WorktreeStatus | 'trunk' | 'loading' | 'unavailable'

/** Unified Turn-tail card for trunk, worktree, loading, terminal, and historical views. */
export function ReviewPanel(props: {
  readonly file: string
  readonly state: FileState | undefined
  readonly worktreeId: string | null
  readonly preferredUnitId: string | null
  readonly historical: boolean
  readonly t: TranslateNS<'univer'>
  readonly viewerLocale: ViewerLocale
}): React.ReactElement {
  const [open, setOpen] = React.useState(!props.historical)
  const [fullscreen, setFullscreen] = React.useState(false)
  const [selected, setSelected] = React.useState<string | undefined>(
    props.preferredUnitId ?? undefined
  )
  const wasHistorical = React.useRef(props.historical)
  const worktree =
    props.worktreeId === null
      ? undefined
      : props.state?.worktrees.find((entry) => entry.worktreeId === props.worktreeId)
  const status: CardStatus =
    props.state === undefined
      ? 'loading'
      : props.worktreeId === null
        ? 'trunk'
        : (worktree?.status ?? 'unavailable')
  const units = worktree?.units ?? []
  const selectedUnit =
    selected !== undefined && units.some((unit) => unit.unitId === selected)
      ? selected
      : props.preferredUnitId !== null &&
          units.some((unit) => unit.unitId === props.preferredUnitId)
        ? props.preferredUnitId
        : units[0]?.unitId
  const target = cardTarget(props.state, props.worktreeId, worktree, selectedUnit)
  const url =
    target === undefined ? undefined : localizeViewerUrl(reviewPageUrl(target), props.viewerLocale)
  const title = worktree?.name || worktree?.worktreeId || props.t('dock.currentVersion')
  const merged = status === 'merged'
  const discarded = status === 'discarded'

  React.useEffect(() => {
    if (!wasHistorical.current && props.historical) setOpen(false)
    wasHistorical.current = props.historical
  }, [props.historical])

  React.useEffect(() => {
    if (props.preferredUnitId !== null) setSelected(props.preferredUnitId)
  }, [props.preferredUnitId])

  React.useEffect(() => {
    if (!fullscreen) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fullscreen])

  return (
    <section
      className={`uvf_panel${fullscreen ? ' uvf_panel_fullscreen' : ''}${props.historical ? ' uvf_panel_history' : ''}`}
      data-status={status}
      aria-label={basename(props.file)}
    >
      <header className="uvf_panelHead">
        <span className="uvf_panelGlyph" aria-hidden="true">
          <UniverMark merged={merged} discarded={discarded} />
        </span>
        <span className="uvf_panelIdentity">
          <span className="uvf_panelTitleRow">
            <span className="uvf_panelTitle">{basename(props.file)}</span>
            <span className="uvf_panelWorktree">{title}</span>
          </span>
          <span className="uvf_panelMeta" title={props.file}>
            {props.file}
          </span>
        </span>
        <span className="uvf_panelChip" data-status={status}>
          <span className="uvf_panelStatusDot" aria-hidden="true" />
          {statusLabel(status, props.t)}
        </span>
        <PanelControl
          action="fullscreen"
          label={props.t(fullscreen ? 'dock.exitFullscreen' : 'dock.fullscreen')}
          onClick={() => {
            setOpen(true)
            setFullscreen((value) => !value)
          }}
        >
          <FullscreenIcon restored={fullscreen} />
        </PanelControl>
        {fullscreen ? null : (
          <PanelControl
            action="fold"
            label={props.t(open ? 'dock.fold' : 'dock.expand')}
            onClick={() => setOpen((value) => !value)}
          >
            <FoldIcon open={open} />
          </PanelControl>
        )}
      </header>
      <div className="uvf_panelContent" hidden={!open}>
        <div className="uvf_panelBody">
          <UnitChips units={units} selected={selectedUnit} t={props.t} onSelect={setSelected} />
          {url === undefined ? (
            <div className="uvf_panelUnavailable">
              {props.t(status === 'loading' ? 'dock.loading' : 'dock.unavailable')}
            </div>
          ) : (
            <iframe className="uvf_panelFrame" src={url} title={title} />
          )}
        </div>
      </div>
    </section>
  )
}

function cardTarget(
  state: FileState | undefined,
  worktreeId: string | null,
  worktree: WorktreeState | undefined,
  selectedUnit: string | undefined
): string | undefined {
  if (state === undefined) return undefined
  if (worktreeId === null) return withUnit(state.viewerUrl ?? undefined, selectedUnit)
  if (worktree === undefined) return undefined
  if (worktree.status === 'merged' || worktree.status === 'discarded')
    return withUnit(state.viewerUrl ?? undefined, selectedUnit)
  return (
    unitViewerUrl(
      worktree.status === 'ready' ? worktree.mergeUrl : worktree.worktreeUrl,
      worktree.units,
      selectedUnit,
      worktree.status === 'ready' ? 'merge' : 'worktree'
    ) ?? (worktree.status === 'draft' ? worktree.openUrl : undefined)
  )
}

function statusLabel(status: CardStatus, t: TranslateNS<'univer'>): string {
  if (status === 'draft') return t('dock.draft')
  if (status === 'ready') return t('dock.mergeReady')
  if (status === 'merged') return t('dock.merged')
  if (status === 'discarded') return t('dock.discarded')
  if (status === 'trunk') return t('dock.currentVersion')
  if (status === 'loading') return t('dock.loading')
  return t('dock.unavailable')
}

function withUnit(url: string | undefined, unitId: string | undefined): string | undefined {
  if (url === undefined || unitId === undefined) return url
  const target = new URL(url)
  target.searchParams.set('unit', unitId)
  return target.toString()
}

function reviewPageUrl(url: string): string {
  const target = new URL(url)
  target.searchParams.delete('mode')
  target.searchParams.set('sidebar', 'collapsed')
  return target.toString()
}

function PanelControl(props: {
  readonly action: string
  readonly label: string
  readonly onClick: () => void
  readonly children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      className="uvf_btn"
      data-panel-action={props.action}
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

function FoldIcon(props: { readonly open: boolean }): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d={props.open ? 'm4 10 4-4 4 4' : 'm4 6 4 4 4-4'} />
    </svg>
  )
}

function UniverMark(props: {
  readonly merged: boolean
  readonly discarded: boolean
}): React.ReactElement {
  if (props.merged)
    return (
      <svg viewBox="0 0 20 20">
        <path d="m5 10 3 3 7-7" />
      </svg>
    )
  if (props.discarded)
    return (
      <svg viewBox="0 0 20 20">
        <path d="M6 10h8" />
      </svg>
    )
  return (
    <svg viewBox="0 0 20 20">
      <rect x="4" y="4" width="12" height="12" rx="2" />
      <path d="M4 8h12M8 4v12" />
    </svg>
  )
}

function FullscreenIcon(props: { readonly restored: boolean }): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      {props.restored ? (
        <path d="M6 3v3H3m10 0h-3V3m0 10v-3h3M3 10h3v3" />
      ) : (
        <path d="M6 3H3v3m10 0V3h-3m0 10h3v-3M3 10v3h3" />
      )}
    </svg>
  )
}
