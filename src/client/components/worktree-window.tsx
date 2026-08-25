import * as React from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { FileState, WorktreeStatus } from '../../shared/wire/state.ts'
import { startGateway } from '../api/univer-api.ts'
import { basename } from '../conversation/univer-turn-definition.ts'
import { localizeViewerUrl } from '../viewer-locale.ts'
import type { ViewerLocale } from '../viewer-locale.ts'
import { UnitChips, unitViewerUrl } from './unit-chips.tsx'

interface ViewportSize { readonly width: number; readonly height: number }
interface WindowRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
type ResizeDirection = typeof RESIZE_DIRECTIONS[number]
type Interaction = 'move' | ResizeDirection

const RESIZE_DIRECTIONS = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'] as const
const VIEWPORT_GUTTER = 12
const DEFAULT_WIDTH = 560
const DEFAULT_HEIGHT = 420
const MIN_WIDTH = 360
const MIN_HEIGHT = 260
const CASCADE_OFFSET = 24

interface WorktreeWindowProps {
  readonly file: string
  readonly state: FileState | undefined
  readonly worktreeId: string | null
  readonly preferredUnitId: string | null
  readonly stackIndex: number
  readonly t: TranslateNS<'univer'>
  readonly viewerLocale: ViewerLocale
  readonly onDismiss: () => void
}

/** Live floating Viewer window for one active worktree. */
export function WorktreeWindow(props: WorktreeWindowProps): React.ReactElement {
  const [folded, setFolded] = React.useState(false)
  const [maximized, setMaximized] = React.useState(false)
  const [interaction, setInteraction] = React.useState<Interaction | null>(null)
  const [rect, setRect] = React.useState<WindowRect>(() => initialRect(props.stackIndex, viewportSize()))
  const [selected, setSelected] = React.useState<string | undefined>(props.preferredUnitId ?? undefined)
  const rectRef = React.useRef(rect)
  const cancelPointerSessionRef = React.useRef<() => void>(() => undefined)

  React.useLayoutEffect(() => {
    rectRef.current = rect
  }, [rect])

  React.useEffect(() => {
    if (props.preferredUnitId !== null) setSelected(props.preferredUnitId)
  }, [props.preferredUnitId])

  React.useEffect(() => {
    const onViewportResize = (): void => setRect((current) => fitRect(current, viewportSize()))
    window.addEventListener('resize', onViewportResize)
    return () => window.removeEventListener('resize', onViewportResize)
  }, [])

  React.useEffect(() => () => cancelPointerSessionRef.current(), [])

  const worktree = props.worktreeId === null ? undefined : props.state?.worktrees.find((entry) => entry.worktreeId === props.worktreeId)
  const units = worktree?.units ?? []
  const selectedUnit = selected !== undefined && units.some((unit) => unit.unitId === selected) ? selected : units[0]?.unitId
  const target = props.worktreeId === null
    ? props.state?.viewerUrl ?? undefined
    : worktree === undefined
      ? undefined
      : unitViewerUrl(worktree.status === 'ready' ? worktree.mergeUrl : worktree.worktreeUrl, units, selectedUnit, worktree.status === 'ready' ? 'merge' : 'worktree')
  const url = target === undefined ? undefined : localizeViewerUrl(target, props.viewerLocale)
  const title = worktree?.name || worktree?.worktreeId || props.worktreeId || props.t('dock.currentVersion')
  const status: WorktreeStatus | 'trunk' | 'loading' | 'unavailable' = props.state === undefined
    ? 'loading'
    : props.worktreeId === null
      ? 'trunk'
      : worktree?.status ?? 'unavailable'

  const beginPointerSession = (event: React.PointerEvent<HTMLElement>, kind: Interaction): void => {
    if (event.button !== 0 || maximized) return
    event.preventDefault()
    event.stopPropagation()
    cancelPointerSessionRef.current()
    const view = event.currentTarget.ownerDocument.defaultView
    if (view === null) return
    const pointerId = event.pointerId
    const origin = { x: event.clientX, y: event.clientY }
    const start = rectRef.current
    const element = event.currentTarget
    setInteraction(kind)
    try { element.setPointerCapture(pointerId) } catch { /* Pointer capture is optional in embedded and synthetic DOMs. */ }

    const move = (next: PointerEvent): void => {
      if (next.pointerId !== pointerId) return
      const dx = next.clientX - origin.x
      const dy = next.clientY - origin.y
      setRect(kind === 'move'
        ? moveRect(start, dx, dy, viewportSize())
        : resizeRect(start, kind, dx, dy, viewportSize()))
    }
    const cleanup = (): void => {
      view.removeEventListener('pointermove', move)
      view.removeEventListener('pointerup', finish)
      view.removeEventListener('pointercancel', finish)
      cancelPointerSessionRef.current = () => undefined
      try { element.releasePointerCapture(pointerId) } catch { /* Pointer capture may already be released. */ }
    }
    const finish = (next: PointerEvent): void => {
      if (next.pointerId !== pointerId) return
      cleanup()
      setInteraction(null)
    }
    cancelPointerSessionRef.current = cleanup
    view.addEventListener('pointermove', move)
    view.addEventListener('pointerup', finish)
    view.addEventListener('pointercancel', finish)
  }

  const toggleFolded = (): void => {
    setMaximized(false)
    setFolded((current) => !current)
  }
  const toggleMaximized = (): void => {
    setFolded(false)
    setMaximized((current) => !current)
  }
  const onHeaderPointerDown = (event: React.PointerEvent<HTMLElement>): void => {
    if ((event.target as Element).closest('[data-window-control]') !== null) return
    beginPointerSession(event, 'move')
  }
  const onHeaderDoubleClick = (event: React.MouseEvent<HTMLElement>): void => {
    if ((event.target as Element).closest('[data-window-control]') === null) toggleMaximized()
  }

  const className = [
    'uvf_win',
    folded ? 'uvf_win_folded' : '',
    maximized ? 'uvf_win_max' : '',
  ].filter(Boolean).join(' ')
  const style: React.CSSProperties = {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
  }

  return <section className={className} style={style} data-interaction={interaction ?? undefined} aria-label={`${title} · ${basename(props.file)}`}>
    <header className="uvf_windowHeader" onPointerDown={onHeaderPointerDown} onDoubleClick={onHeaderDoubleClick}>
      <span className="uvf_windowGlyph" aria-hidden="true"><GridIcon /></span>
      <span className="uvf_windowIdentity">
        <span className="uvf_windowTitle">{title}</span>
        <span className="uvf_windowFile">{basename(props.file)}</span>
      </span>
      <span className="uvf_chip" data-status={status}>
        <span className="uvf_pulse" aria-hidden="true" />
        {status === 'trunk' ? props.t('dock.currentVersion') : status === 'loading' ? props.t('dock.loading') : status === 'unavailable' ? props.t('dock.unavailable') : props.t(`dock.${status}`)}
      </span>
      <span className="uvf_windowControls">
        <WindowControl action="fold" label={props.t(folded ? 'dock.expand' : 'dock.fold')} onClick={toggleFolded}>
          <FoldIcon expanded={folded} />
        </WindowControl>
        <WindowControl action="maximize" label={props.t(maximized ? 'dock.restore' : 'dock.maximize')} onClick={toggleMaximized}>
          <MaximizeIcon restored={maximized} />
        </WindowControl>
        <WindowControl action="close" label={props.t('dock.close')} onClick={props.onDismiss} danger>
          <CloseIcon />
        </WindowControl>
      </span>
    </header>
    <div className="uvf_windowBody" hidden={folded}>
      <UnitChips units={units} selected={selectedUnit} t={props.t} onSelect={setSelected} />
      <div className="uvf_viewerShell">
        {url === undefined
          ? <div className="uvf_note"><span>{props.t('dock.gatewayDown')}</span><button type="button" onClick={() => void startGateway()}>{props.t('dock.startGateway')}</button></div>
          : <iframe className="uvf_frame" src={url} title={title} />}
      </div>
    </div>
    {!folded && !maximized ? RESIZE_DIRECTIONS.map((direction) => <span
      key={direction}
      className={`uvf_resizeHandle uvf_resize_${direction}`}
      data-direction={direction}
      onPointerDown={(event) => beginPointerSession(event, direction)}
    />) : null}
  </section>
}

function WindowControl(props: { readonly action: string; readonly label: string; readonly danger?: boolean; readonly onClick: () => void; readonly children: React.ReactNode }): React.ReactElement {
  return <button
    type="button"
    className={`uvf_windowControl${props.danger === true ? ' uvf_windowControl_danger' : ''}`}
    data-window-control=""
    data-window-action={props.action}
    title={props.label}
    aria-label={props.label}
    onClick={props.onClick}
  >{props.children}</button>
}

function GridIcon(): React.ReactElement {
  return <svg viewBox="0 0 18 18" aria-hidden="true"><rect x="3" y="3" width="12" height="12" rx="2" /><path d="M3 7h12M7 3v12" /></svg>
}

function FoldIcon(props: { readonly expanded: boolean }): React.ReactElement {
  return <svg viewBox="0 0 16 16" aria-hidden="true">{props.expanded
    ? <path d="m4 10 4-4 4 4" />
    : <path d="M4 9h8" />}</svg>
}

function MaximizeIcon(props: { readonly restored: boolean }): React.ReactElement {
  return <svg viewBox="0 0 16 16" aria-hidden="true">{props.restored
    ? <><rect x="3" y="5" width="8" height="8" rx="1" /><path d="M5 5V3h8v8h-2" /></>
    : <rect x="3" y="3" width="10" height="10" rx="1.5" />}</svg>
}

function CloseIcon(): React.ReactElement {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" /></svg>
}

function viewportSize(): ViewportSize {
  return {
    width: Math.max(1, window.innerWidth),
    height: Math.max(1, window.innerHeight),
  }
}

function initialRect(stackIndex: number, viewport: ViewportSize): WindowRect {
  const availableWidth = Math.max(1, viewport.width - VIEWPORT_GUTTER * 2)
  const availableHeight = Math.max(1, viewport.height - VIEWPORT_GUTTER * 2)
  const width = Math.min(DEFAULT_WIDTH, availableWidth)
  const height = Math.min(DEFAULT_HEIGHT, availableHeight)
  return fitRect({
    x: viewport.width - VIEWPORT_GUTTER - width - stackIndex * CASCADE_OFFSET,
    y: VIEWPORT_GUTTER + stackIndex * CASCADE_OFFSET,
    width,
    height,
  }, viewport)
}

function fitRect(rect: WindowRect, viewport: ViewportSize): WindowRect {
  const availableWidth = Math.max(1, viewport.width - VIEWPORT_GUTTER * 2)
  const availableHeight = Math.max(1, viewport.height - VIEWPORT_GUTTER * 2)
  const width = clamp(rect.width, Math.min(MIN_WIDTH, availableWidth), availableWidth)
  const height = clamp(rect.height, Math.min(MIN_HEIGHT, availableHeight), availableHeight)
  return {
    x: clamp(rect.x, VIEWPORT_GUTTER, Math.max(VIEWPORT_GUTTER, viewport.width - VIEWPORT_GUTTER - width)),
    y: clamp(rect.y, VIEWPORT_GUTTER, Math.max(VIEWPORT_GUTTER, viewport.height - VIEWPORT_GUTTER - height)),
    width,
    height,
  }
}

function moveRect(start: WindowRect, dx: number, dy: number, viewport: ViewportSize): WindowRect {
  return fitRect({ ...start, x: start.x + dx, y: start.y + dy }, viewport)
}

function resizeRect(start: WindowRect, direction: ResizeDirection, dx: number, dy: number, viewport: ViewportSize): WindowRect {
  const fitted = fitRect(start, viewport)
  const minWidth = Math.min(MIN_WIDTH, Math.max(1, viewport.width - VIEWPORT_GUTTER * 2))
  const minHeight = Math.min(MIN_HEIGHT, Math.max(1, viewport.height - VIEWPORT_GUTTER * 2))
  let left = fitted.x
  let right = fitted.x + fitted.width
  let top = fitted.y
  let bottom = fitted.y + fitted.height

  if (direction.includes('w')) left = clamp(fitted.x + dx, VIEWPORT_GUTTER, right - minWidth)
  if (direction.includes('e')) right = clamp(right + dx, left + minWidth, viewport.width - VIEWPORT_GUTTER)
  if (direction.includes('n')) top = clamp(fitted.y + dy, VIEWPORT_GUTTER, bottom - minHeight)
  if (direction.includes('s')) bottom = clamp(bottom + dy, top + minHeight, viewport.height - VIEWPORT_GUTTER)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
