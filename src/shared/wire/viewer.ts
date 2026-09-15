/** Browser-facing URL prefix under which the plugin serves the Viewer on the DSH origin. */
export const VIEWER_BASE = '/univer-viewer'

/** Fixed upgrade path for the same-origin WebSocket tunnel; DSH upgrades register exact paths only. */
export const VIEWER_WS_TUNNEL = `${VIEWER_BASE}/ws`

/** Cookie carrying the live DSH sessions whose files this browser may open in the Viewer. */
export const VIEWER_SESSION_COOKIE = 'univer-viewer-sessions'
