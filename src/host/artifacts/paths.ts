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
// engine-formula-rust-binding, libsql) through this plugin's own node_modules. The bindings are
// never declared anywhere in this repository — the published manifest declares their wrappers
// (@univerjs-pro/engine-formula-rust, @univerjs-pro/exchange-node) at the SDK baseline and npm
// installs the bindings transitively, while the dev workspace hoists them via publicHoistPattern
// because the bundles embed the wrapper code instead of resolving through a wrapper package.

/** This plugin's node_modules root — the NODE_PATH for spawned worker/gateway processes. */
export const PLUGIN_NODE_MODULES = fileURLToPath(new URL('../../node_modules/', import.meta.url))
