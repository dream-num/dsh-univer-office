/** Browser-facing URL prefix under which the plugin serves the Viewer on the DSH origin. */
export const VIEWER_BASE = '/univer-viewer'

/** Fixed upgrade path for the same-origin WebSocket tunnel; DSH upgrades register exact paths only. */
export const VIEWER_WS_TUNNEL = `${VIEWER_BASE}/ws`

/** Host-owned transport configuration for a Viewer inside the desktop custom protocol. */
export const VIEWER_RUNTIME_CONFIG = `${VIEWER_BASE}/runtime-config`

export interface ViewerRuntimeConfig {
  desktopStreamBaseUrl: string
}
