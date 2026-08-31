import type { Context } from '@deepseek-ai/cordis'
import { resolveConfig } from './config.ts'
import type { Config as UniverConfig } from './config.ts'
import * as provider from './provider/plugin.ts'
import * as skills from './skills/plugin.ts'
import { runHostTelemetry } from './telemetry/product-telemetry.ts'
import * as tools from './tools/plugin.ts'
import * as webServer from './webServer/plugin.ts'

export { Config, resolveConfig } from './config.ts'
export type { UniverConfig }
export { GatewayUniverService } from './provider/gateway-univer-service.ts'
export { UniverService } from './service/univer-service.ts'
export { createUniverRouter } from './webServer/router.ts'
export {
  captureTelemetry,
  parseTelemetryState,
  resolveTelemetryStatePath,
  runHostTelemetry,
} from './telemetry/product-telemetry.ts'
export type {
  TelemetryCapture,
  TelemetryState,
  TelemetryStateIo,
} from './telemetry/product-telemetry.ts'
export * from '../shared/wire/actions.ts'
export * from '../shared/wire/state.ts'
export * from '../shared/wire/status.ts'

export const name = 'dsh-univer-office'

/** Compose the Univer Provider and its Web/Tools Consumers. */
export function apply(ctx: Context, config: UniverConfig = {}): void {
  const resolved = resolveConfig(config)
  // Fire-and-forget: bounded by an internal timeout and never throws, so it
  // can neither delay activation nor leave work for unload to settle.
  void runHostTelemetry({ telemetryEnabled: resolved.telemetry })
  ctx.plugin(provider, resolved)
  ctx.plugin(webServer)
  if (resolved.tools) ctx.plugin(tools, resolved)
  if (resolved.skills) ctx.plugin(skills)
}
