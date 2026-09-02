import { encodeUniverfile } from '@univer/collab-gateway-contract'

/** Server origin + the .univer being viewed (passed to WorktreeControlClient / viewer). */
export interface AppConfig {
  /** Same-origin (the vite dev server proxies `/uf` to the real ucb server). */
  origin: string
  /** Absolute .univer path being viewed, or the same-origin gateway route for display. */
  univerfile: string
  /** Same-origin gateway file key from `?file=<enc>`. */
  gatewayFileKey?: string
}

export type AppMode = 'standalone' | 'embedded'
export type AppContentScope = 'trunk' | 'worktree' | 'mergePreview'

/** What the address bar encodes: which file, which worktree (absent = current version), which unit. */
export interface AppLocation {
  univerfile: string | null
  gatewayFileKey: string | null
  worktreeId: string | null
  unitId: string | null
  mode: AppMode
  scope: AppContentScope
  editable: boolean | null
}

export interface WriteLocationOptions {
  univerfile: string
  gatewayFileKey?: string
  worktreeId?: string
  unitId?: string
  mode?: AppMode
  scope?: AppContentScope
  editable?: boolean
  /** Shell UI language; written only when the address bar carried it or the user toggled it. */
  lang?: string
}

/** Read the current view from the address bar. No file is a real "nothing selected" state. */
export function readLocation(): AppLocation {
  const p = new URLSearchParams(location.search)
  const mode = readAppMode(p)
  const file = p.get('file')
  const gatewayFileKey = file !== null && isGatewayFileKey(file) ? file : null
  return {
    univerfile: gatewayFileKey === null ? file : null,
    gatewayFileKey,
    worktreeId: p.get('worktree'),
    unitId: p.get('unit'),
    mode,
    scope: readContentScope(p, mode),
    editable: mode === 'embedded' ? readEditable(p) : null
  }
}

/**
 * Reflect the current view in the address bar (`?file=…&worktree=…&unit=…`) so the user always
 * sees what they're looking at, refresh keeps it, and the URL is shareable. replaceState — we
 * don't push a history entry per click.
 */
export function writeLocation(loc: WriteLocationOptions): void {
  const p = new URLSearchParams()
  if (loc.gatewayFileKey !== undefined) {
    p.set('file', loc.gatewayFileKey)
  } else {
    p.set('file', loc.univerfile)
  }
  if (loc.mode === 'embedded') {
    p.set('mode', loc.mode)
    if (loc.scope !== undefined) {
      p.set('scope', loc.scope)
    }
    if (loc.editable !== undefined) {
      p.set('editable', loc.editable ? 'true' : 'false')
    }
  }
  if (loc.worktreeId !== undefined) {
    p.set('worktree', loc.worktreeId)
  }
  if (loc.unitId !== undefined) {
    p.set('unit', loc.unitId)
  }
  if (loc.lang !== undefined) {
    p.set('lang', loc.lang)
  }
  history.replaceState(null, '', `${location.pathname}?${p.toString()}`)
}

/** Gateway file endpoint prefix for the configured target, including lifecycle WebSocket URLs. */
export function ufPrefix(config: AppConfig): string {
  if (config.gatewayFileKey !== undefined) {
    return `/uf/${config.gatewayFileKey}`
  }
  return `/uf/${encodeUniverfile(config.univerfile)}`
}

export function gatewayFileEndpointFromKey(origin: string, key: string): string {
  return `${origin.replace(/\/+$/u, '')}/uf/${key}`
}

function readAppMode(params: URLSearchParams): AppMode {
  return params.get('mode') === 'embedded' ? 'embedded' : 'standalone'
}

function readContentScope(params: URLSearchParams, mode: AppMode): AppContentScope {
  if (mode !== 'embedded') {
    return params.get('worktree') === null ? 'trunk' : 'worktree'
  }
  const scope = params.get('scope')
  if (scope === 'trunk' || scope === 'worktree' || scope === 'mergePreview') {
    return scope
  }
  return params.get('worktree') === null ? 'trunk' : 'worktree'
}

function readEditable(params: URLSearchParams): boolean | null {
  const editable = params.get('editable')
  if (editable === 'true') {
    return true
  }
  if (editable === 'false') {
    return false
  }
  return null
}

function isGatewayFileKey(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/u.test(value)
}
