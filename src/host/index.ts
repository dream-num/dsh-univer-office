import type { Context } from '@deepseek-ai/cordis'
import { resolveConfig } from './config.ts'
import type { Config as UniverConfig } from './config.ts'
import * as provider from './provider/plugin.ts'
import * as tools from './tools/plugin.ts'
import * as webServer from './webServer/plugin.ts'

export { Config, resolveConfig } from './config.ts'
export type { UniverConfig }
export { GatewayUniverService } from './provider/gateway-univer-service.ts'
export { UniverService } from './service/univer-service.ts'
export { createUniverRouter } from './webServer/router.ts'
export * from '../shared/wire/actions.ts'
export * from '../shared/wire/state.ts'
export * from '../shared/wire/status.ts'

export const name = 'dsh-univer-office'

/** Compose the Univer Provider and its Web/Tools Consumers. */
export function apply(ctx: Context, config: UniverConfig = {}): void {
  const resolved = resolveConfig(config)
  ctx.plugin(provider, resolved)
  ctx.plugin(webServer)
  if (resolved.tools) ctx.plugin(tools, resolved)
}
