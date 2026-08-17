import type { SpawnOptions } from 'node:child_process'
import { delimiter } from 'node:path'
import { GATEWAY_ENTRY, PLUGIN_NODE_MODULES, VIEWER_ROOT } from '../../artifacts/paths.ts'

/** Build the fixed executable and environment used for a bundled Gateway. */
export function gatewayLaunch(port: number): { readonly command: string; readonly args: readonly string[]; readonly options: SpawnOptions } {
  const inherited = ['HOME', 'LANG', 'LC_ALL', 'PATH', 'TMPDIR'].flatMap((key) => {
    const value = process.env[key]
    return value === undefined ? [] : [[key, value] as const]
  })
  return {
    command: process.execPath,
    args: [GATEWAY_ENTRY],
    options: {
      env: {
        ...Object.fromEntries(inherited),
        UNIVER_COLLAB_GATEWAY_PORT: String(port),
        UNIVER_VIEW_ASSETS_ROOT: VIEWER_ROOT,
        // Let the gateway and worker resolve their native dependencies
        // (@univerjs-pro/uexcli, engine-formula-rust-binding, libsql) from this
        // plugin's node_modules; the formula binding package resolves its own
        // platform binary (no NAPI_RS_NATIVE_LIBRARY_PATH override needed).
        NODE_PATH: [PLUGIN_NODE_MODULES, process.env.NODE_PATH].filter((value): value is string => value !== undefined && value.length > 0).join(delimiter),
      },
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    },
  }
}
