import { el } from './dom'

export { confirmDialog, conflictDialog, escapeHtml, type DialogChip } from './dialogs'

const TOAST_HIDDEN = ['opacity-0', 'translate-y-2', 'pointer-events-none'] as const
const TOAST_SHOWN = ['opacity-100', 'translate-y-0'] as const

let toastTimer: number | undefined
export function toast(message: string): void {
  let host = document.getElementById('toast')
  if (!host) {
    host = el('div', {
      class:
        'fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-border bg-popover px-4 py-2.5 text-sm text-popover-foreground shadow-lg transition-all duration-200',
      attrs: { id: 'toast', role: 'status', 'aria-live': 'polite', 'data-slot': 'toast' }
    })
    host.classList.add(...TOAST_HIDDEN)
    document.body.append(host)
  }
  host.textContent = message
  // Force a layout pass so the transition replays even for back-to-back toasts.
  void host.offsetWidth
  host.classList.remove(...TOAST_HIDDEN)
  host.classList.add(...TOAST_SHOWN)
  if (toastTimer !== undefined) {
    window.clearTimeout(toastTimer)
  }
  toastTimer = window.setTimeout(() => {
    host?.classList.remove(...TOAST_SHOWN)
    host?.classList.add(...TOAST_HIDDEN)
  }, 2600)
}
