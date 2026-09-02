import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

/** Bundled Gateway executable in the published package. */
export const GATEWAY_ENTRY = fileURLToPath(new URL('../artifacts/gateway.cjs', import.meta.url))

/** Bundled Viewer assets served by the Gateway. */
export const VIEWER_ROOT = fileURLToPath(new URL('../artifacts/viewer/', import.meta.url))

/** Bundled one-shot worker used for content import, inspection, execution, export, and render-source reads. */
export const UNIT_CONTENT_WORKER_ENTRY = fileURLToPath(
  new URL('../artifacts/unit-content-worker.mjs', import.meta.url)
)

/** Bundled machine-facing page used for layout analysis and text measurement. */
export const RENDER_MACHINE_ROOT = fileURLToPath(
  new URL('../artifacts/render-machine/', import.meta.url)
)

// The worker and gateway resolve their native dependencies (@univerjs-pro/exchange-node-binding,
// engine-formula-rust-binding, libsql) through this plugin's own node_modules,
// which npm populates from the declared runtime dependencies. This mirrors the
// univer-cli model: binaries come from the registry instead of being copied into this package.
const require = createRequire(import.meta.url)

/** This plugin's node_modules root — the NODE_PATH for spawned worker/gateway processes. */
export const PLUGIN_NODE_MODULES = fileURLToPath(new URL('../../node_modules/', import.meta.url))

/** Native formula binding package root, resolved from the plugin's dependencies. */
export const FORMULA_BINDING_ROOT = require.resolve('@univerjs-pro/engine-formula-rust-binding')
