import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

/** Vendored Gateway executable in the published package. */
export const GATEWAY_ENTRY = fileURLToPath(new URL('../vendor/collaboration/artifacts/gateway.cjs', import.meta.url))

/** Vendored Viewer assets served by the Gateway. */
export const VIEWER_ROOT = fileURLToPath(new URL('../vendor/collaboration/artifacts/viewer/', import.meta.url))

/** Bundled one-shot worker used for content inspection, execution, and export. */
export const UNIT_CONTENT_WORKER_ENTRY = fileURLToPath(new URL('../vendor/unit-content/artifacts/unit-content-worker.mjs', import.meta.url))

// The worker and gateway resolve their native dependencies (@univerjs-pro/uexcli,
// engine-formula-rust-binding, libsql) through this plugin's own node_modules,
// which npm populates from the declared runtime dependencies. This mirrors the
// univer-cli model: binaries are never vendored, they come from the registry.
const require = createRequire(import.meta.url)

/** This plugin's node_modules root — the NODE_PATH for spawned worker/gateway processes. */
export const PLUGIN_NODE_MODULES = fileURLToPath(new URL('../../node_modules/', import.meta.url))

/** Native formula binding package root, resolved from the plugin's dependencies. */
export const FORMULA_BINDING_ROOT = require.resolve('@univerjs-pro/engine-formula-rust-binding')
