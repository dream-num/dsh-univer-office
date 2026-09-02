import process from 'node:process'
import { GATEWAY_PORT_IN_USE_EXIT_CODE } from '../shared/gateway-process-protocol.js'
import { startServer } from './server.js'

// DSH plugin gateway entry: bridges the plugin launcher environment
// (UNIVER_COLLAB_GATEWAY_PORT / UNIVER_VIEW_ASSETS_ROOT) to the SDK
// startServer contract, and serves the bundled Viewer for health checks.
async function main(): Promise<void> {
  const port = Number(process.env.UNIVER_COLLAB_GATEWAY_PORT ?? 9080)
  const viewAssetsRoot = process.env.UNIVER_VIEW_ASSETS_ROOT
  const allowedRoot = process.env.UNIVER_ALLOWED_ROOT

  const server = await startServer({
    port,
    ...(viewAssetsRoot === undefined ? {} : { viewAssetsRoot }),
    ...(allowedRoot === undefined ? {} : { allowedRoot })
  })

  process.stdout.write(`[dsh-univer-gateway] listening on http://127.0.0.1:${server.port}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`[dsh-univer-gateway] failed to start: ${String(error)}\n`)
  process.exitCode = isAddressInUse(error) ? GATEWAY_PORT_IN_USE_EXIT_CODE : 1
})

function isAddressInUse(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'EADDRINUSE'
  )
}
