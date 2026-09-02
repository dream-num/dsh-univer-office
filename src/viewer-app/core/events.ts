import type { WorktreeLifecycleEvent } from '@univer/collab-gateway-contract'

export interface EventChannelHandlers {
  worktree?: (e: Extract<WorktreeLifecycleEvent, { type: 'worktree' }>) => void
  reset?: (e: Extract<WorktreeLifecycleEvent, { type: 'reset' }>) => void
  unit_added?: (e: Extract<WorktreeLifecycleEvent, { type: 'unit_added' }>) => void
  unit_updated?: (e: Extract<WorktreeLifecycleEvent, { type: 'unit_updated' }>) => void
  unit_removed?: (e: Extract<WorktreeLifecycleEvent, { type: 'unit_removed' }>) => void
  /** Fires on every successful (re)connect — reconcile by re-pulling the channel's full state. */
  open?: () => void
}

export interface EventChannel {
  close(): void
}

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 15_000

/**
 * Open one lifecycle-event WebSocket channel and dispatch typed events:
 *  - univerfile channel: `${ufPrefix}/events`                     → `worktree` upserts + trunk `unit_*`
 *  - worktree channel:   `${ufPrefix}/worktrees/<id>/events`      → `reset` + that worktree's `unit_*`
 * The server pushes each event as one JSON text message. Unlike EventSource, WebSocket has no
 * built-in retry, so this reconnects itself with exponential backoff until `close()` is called;
 * callers reconcile by re-pulling `/worktrees` and `/units` in the `open` handler on every
 * (re)connect — the channel only pushes deltas.
 */
export function openEventChannel(url: string, handlers: EventChannelHandlers): EventChannel {
  const wsUrl = toWebSocketUrl(url)
  let ws: WebSocket | undefined
  let closed = false
  let attempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined

  const connect = (): void => {
    if (closed) {
      return
    }
    ws = new WebSocket(wsUrl)
    ws.onopen = () => {
      attempt = 0
      handlers.open?.()
    }
    ws.onmessage = (ev: MessageEvent) => {
      let event: WorktreeLifecycleEvent
      try {
        event = JSON.parse(String(ev.data)) as WorktreeLifecycleEvent
      } catch {
        return // ignore malformed frames
      }
      switch (event.type) {
        case 'worktree':
          handlers.worktree?.(event)
          break
        case 'reset':
          handlers.reset?.(event)
          break
        case 'unit_added':
          handlers.unit_added?.(event)
          break
        case 'unit_updated':
          handlers.unit_updated?.(event)
          break
        case 'unit_removed':
          handlers.unit_removed?.(event)
          break
        default:
          break
      }
    }
    // Errors always surface as a close; schedule the retry from onclose only.
    ws.onclose = () => {
      if (closed) {
        return
      }
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)
      attempt += 1
      retryTimer = setTimeout(connect, delay)
    }
  }

  connect()

  return {
    close: () => {
      closed = true
      if (retryTimer !== undefined) {
        clearTimeout(retryTimer)
      }
      ws?.close()
    }
  }
}

/** `/uf/...` or `http(s)://.../uf/...` → absolute `ws(s)://` URL on the same origin. */
function toWebSocketUrl(url: string): string {
  const absolute = new URL(url, window.location.origin)
  absolute.protocol = absolute.protocol === 'https:' ? 'wss:' : 'ws:'
  return absolute.toString()
}
