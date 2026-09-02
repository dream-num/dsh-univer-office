export type Appearance = 'light' | 'dark'

export const APPEARANCE_STORAGE_KEY = 'univer-collab-client-appearance'
export const GATEWAY_DARK_CLASS = 'gateway-dark'

let active: Appearance = 'light'

export function currentAppearance(): Appearance {
  return active
}

export function setAppearance(appearance: Appearance): void {
  active = appearance
}

/** Apply the shell appearance before React or Univer renders. */
export function applyDocumentAppearance(): void {
  document.documentElement.classList.toggle(GATEWAY_DARK_CLASS, active === 'dark')
  document.documentElement.style.colorScheme = active
}

/** Persist an explicit choice when browser storage is available. */
export function persistAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, appearance)
  } catch {
    // Storage can be blocked in embedded contexts; the current page still keeps the choice.
  }
}

/** Resolve a stored choice, falling back to the existing light appearance. */
export function resolveAppearance(): Appearance {
  try {
    const stored = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') {
      return stored
    }
  } catch {
    // Storage unavailable — retain the light default.
  }
  return 'light'
}
