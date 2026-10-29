import type { UnitRuntimeConfig } from '@univerjs-pro/collaboration-service'

/**
 * Unit runtime placement for every SDK runtime owner in the Gateway.
 *
 * Since SDK 1.0.4 the Service, Worktree Service, and Unit Snapshot Materializer default
 * to worker threads that load `unit-runtime-worker.cjs` next to the SDK module. The Gateway ships as one bundled CJS file, so that worker
 * file is never beside it at runtime, and per-request materializers would also pay a
 * full worker-pool start and teardown on every call. Keep execution in-process.
 */
export const GATEWAY_UNIT_RUNTIME: UnitRuntimeConfig = { execution: { mode: 'in-process' } }
