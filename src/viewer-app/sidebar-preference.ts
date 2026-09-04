export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'univer-collab-client-sidebar-collapsed'

/** Persist an explicit Sidebar choice when browser storage is available. */
export function persistSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed))
  } catch {
    // Storage can be blocked in embedded contexts; the current page still keeps the choice.
  }
}

/** Resolve a stored Sidebar choice, defaulting to the existing expanded shell. */
export function resolveSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}
