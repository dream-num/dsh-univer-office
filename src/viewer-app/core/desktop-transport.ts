import { VIEWER_RUNTIME_CONFIG } from '../../shared/wire/viewer.ts'

let desktopStreamBaseUrl: string | undefined

/** Load once before any desktop Viewer collaboration or lifecycle channel starts. */
export async function initializeDesktopTransport(): Promise<void> {
  if (location.protocol !== 'dsh-app:') return
  const response = await fetch(VIEWER_RUNTIME_CONFIG, { cache: 'no-store' })
  if (!response.ok) throw new Error('Desktop Viewer transport configuration is unavailable')
  const config: unknown = await response.json()
  if (
    typeof config !== 'object' ||
    config === null ||
    !('desktopStreamBaseUrl' in config) ||
    typeof config.desktopStreamBaseUrl !== 'string'
  ) {
    throw new Error('Invalid desktop Viewer transport configuration')
  }
  const base = new URL(config.desktopStreamBaseUrl)
  if (
    base.protocol !== 'http:' ||
    base.hostname !== '127.0.0.1' ||
    base.port === '' ||
    base.username !== '' ||
    base.password !== '' ||
    base.pathname !== '/' ||
    base.search !== '' ||
    base.hash !== ''
  ) {
    throw new Error('Invalid desktop Viewer Host address')
  }
  desktopStreamBaseUrl = base.origin
}

/** Desktop uses the authenticated Host socket; web deployments use their public origin. */
export function viewerStreamBaseUrl(): string {
  if (location.protocol !== 'dsh-app:') return location.origin
  if (desktopStreamBaseUrl === undefined) {
    throw new Error('Desktop Viewer transport configuration has not been loaded')
  }
  return desktopStreamBaseUrl
}
