// CLI entry for package lifecycle hooks. Bundled to lib/telemetry-entry.js and
// launched detached by scripts/telemetry-entry.mjs so that package install and
// removal never wait on telemetry. Unknown arguments and every failure are
// silently ignored: telemetry must never fail install or uninstall.
import {
  captureTelemetry,
  readBundledBuildInfo,
  telemetryEndpointFor
} from './product-telemetry.ts'
import type { TelemetryEventName, TelemetryEventSource } from './product-telemetry.ts'

function isTelemetryEventName(value: string | undefined): value is TelemetryEventName {
  return (
    value === 'dsh_plugin_postinstall' ||
    value === 'dsh_plugin_activated' ||
    value === 'dsh_plugin_daily_active' ||
    value === 'dsh_plugin_uninstall_hook'
  )
}

function sourceFor(event: TelemetryEventName): TelemetryEventSource {
  if (event === 'dsh_plugin_postinstall') return 'postinstall'
  if (event === 'dsh_plugin_uninstall_hook') return 'uninstall-hook'
  return 'host-activate'
}

const event = process.argv[3]
if (process.argv[2] === 'capture' && isTelemetryEventName(event)) {
  try {
    const buildInfo = readBundledBuildInfo()
    await captureTelemetry({
      buildInfo,
      endpoint: telemetryEndpointFor({ buildInfo }),
      event,
      source: sourceFor(event)
    })
  } catch {
    // Telemetry must never affect install or uninstall.
  }
}
