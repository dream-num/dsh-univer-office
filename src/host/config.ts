import { isAbsolute, join, resolve } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { resolveDshHome } from './dsh-home.ts'

/** Configuration shared by the Univer service provider and its consumers. */
export interface Config {
  /** Initial loopback port used by the bundled Gateway; occupied ports advance by one. */
  gatewayPort?: number
  /** Start the bundled Gateway when file state is first requested. */
  autoStartGateway?: boolean
  /** Maximum time allowed for the bundled Gateway to become healthy. */
  gatewayStartupTimeoutMs?: number
  /** HTTP timeout used for Gateway state reads. */
  gatewayRequestTimeoutMs?: number
  /** HTTP timeout used for Gateway mutations. */
  gatewayMutationTimeoutMs?: number
  /** Maximum lifetime of a one-shot content worker process. */
  unitContentOperationTimeoutMs?: number
  /** Maximum lifetime of one browser-backed screenshot operation. */
  screenshotOperationTimeoutMs?: number
  /** Maximum number of document or slide pages captured by one screenshot call. */
  screenshotMaxPages?: number
  /** Maximum pixel count for each rendered screenshot image. */
  screenshotMaxPixels?: number
  /** Persistent cache directory for downloaded resource-library SVGs. */
  resourceCacheRoot?: string
  /** Maximum time allowed for one resource-library download. */
  resourceDownloadTimeoutMs?: number
  /** Maximum lifetime of one resource-library tool operation. */
  resourceOperationTimeoutMs?: number
  /** Maximum time to wait for a collaboration commit acknowledgement before confirming by pull. */
  unitContentCommitTimeoutMs?: number
  /** Freshness window for file state reads. */
  stateCacheTtlMs?: number
  /** Freshness window for changed-unit reads. */
  unitCacheTtlMs?: number
  /** Register model-facing `univer_*` tools. */
  tools?: boolean
  /** Register version-matched bundled Univer skills. */
  skills?: boolean
  /** Send anonymous product telemetry; `DO_NOT_TRACK` also turns it off. */
  telemetry?: boolean
}

/** Fully resolved configuration used by the implementation. */
export interface ResolvedConfig {
  readonly gatewayPort: number
  readonly autoStartGateway: boolean
  readonly gatewayStartupTimeoutMs: number
  readonly gatewayRequestTimeoutMs: number
  readonly gatewayMutationTimeoutMs: number
  readonly unitContentOperationTimeoutMs: number
  readonly screenshotOperationTimeoutMs: number
  readonly screenshotMaxPages: number
  readonly screenshotMaxPixels: number
  readonly resourceCacheRoot: string
  readonly resourceDownloadTimeoutMs: number
  readonly resourceOperationTimeoutMs: number
  readonly unitContentCommitTimeoutMs: number
  readonly stateCacheTtlMs: number
  readonly unitCacheTtlMs: number
  readonly tools: boolean
  readonly skills: boolean
  readonly telemetry: boolean
}

/** Cordis configuration schema. */
export const Config: z<Config> = z.object({
  gatewayPort: z.natural().max(65535).default(9080),
  autoStartGateway: z.boolean().default(true),
  gatewayStartupTimeoutMs: z.natural().default(10_000),
  gatewayRequestTimeoutMs: z.natural().default(3_000),
  gatewayMutationTimeoutMs: z.natural().default(60_000),
  unitContentOperationTimeoutMs: z.natural().default(120_000),
  screenshotOperationTimeoutMs: z.natural().default(120_000),
  screenshotMaxPages: z.natural().default(30),
  screenshotMaxPixels: z.natural().default(16_777_216),
  resourceCacheRoot: z.string(),
  resourceDownloadTimeoutMs: z.natural().default(15_000),
  resourceOperationTimeoutMs: z.natural().default(120_000),
  unitContentCommitTimeoutMs: z.natural().default(5_000),
  stateCacheTtlMs: z.natural().default(1_000),
  unitCacheTtlMs: z.natural().default(5_000),
  tools: z.boolean().default(true),
  skills: z.boolean().default(true),
  telemetry: z.boolean().default(true)
})

/** Apply defaults and reject configuration that cannot run. */
export function resolveConfig(config: Config = {}): ResolvedConfig {
  const resolved: ResolvedConfig = {
    gatewayPort: config.gatewayPort ?? 9080,
    autoStartGateway: config.autoStartGateway ?? true,
    gatewayStartupTimeoutMs: config.gatewayStartupTimeoutMs ?? 10_000,
    gatewayRequestTimeoutMs: config.gatewayRequestTimeoutMs ?? 3_000,
    gatewayMutationTimeoutMs: config.gatewayMutationTimeoutMs ?? 60_000,
    unitContentOperationTimeoutMs: config.unitContentOperationTimeoutMs ?? 120_000,
    screenshotOperationTimeoutMs: config.screenshotOperationTimeoutMs ?? 120_000,
    screenshotMaxPages: config.screenshotMaxPages ?? 30,
    screenshotMaxPixels: config.screenshotMaxPixels ?? 16_777_216,
    resourceCacheRoot: resolveResourceCacheRoot(config.resourceCacheRoot),
    resourceDownloadTimeoutMs: config.resourceDownloadTimeoutMs ?? 15_000,
    resourceOperationTimeoutMs: config.resourceOperationTimeoutMs ?? 120_000,
    unitContentCommitTimeoutMs: config.unitContentCommitTimeoutMs ?? 5_000,
    stateCacheTtlMs: config.stateCacheTtlMs ?? 1_000,
    unitCacheTtlMs: config.unitCacheTtlMs ?? 5_000,
    tools: config.tools ?? true,
    skills: config.skills ?? true,
    telemetry: config.telemetry ?? true
  }
  if (
    !Number.isInteger(resolved.gatewayPort) ||
    resolved.gatewayPort < 1 ||
    resolved.gatewayPort > 65_535
  ) {
    throw new Error('univer: gatewayPort must be an integer between 1 and 65535')
  }
  for (const [name, value] of Object.entries({
    gatewayStartupTimeoutMs: resolved.gatewayStartupTimeoutMs,
    gatewayRequestTimeoutMs: resolved.gatewayRequestTimeoutMs,
    gatewayMutationTimeoutMs: resolved.gatewayMutationTimeoutMs,
    unitContentOperationTimeoutMs: resolved.unitContentOperationTimeoutMs,
    screenshotOperationTimeoutMs: resolved.screenshotOperationTimeoutMs,
    screenshotMaxPages: resolved.screenshotMaxPages,
    screenshotMaxPixels: resolved.screenshotMaxPixels,
    resourceDownloadTimeoutMs: resolved.resourceDownloadTimeoutMs,
    resourceOperationTimeoutMs: resolved.resourceOperationTimeoutMs,
    unitContentCommitTimeoutMs: resolved.unitContentCommitTimeoutMs,
    stateCacheTtlMs: resolved.stateCacheTtlMs,
    unitCacheTtlMs: resolved.unitCacheTtlMs
  })) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error(`univer: ${name} must be a positive integer`)
  }
  return resolved
}

function resolveResourceCacheRoot(configured: string | undefined): string {
  if (configured !== undefined) {
    if (configured.trim().length === 0 || !isAbsolute(configured)) {
      throw new Error('univer: resourceCacheRoot must be a non-empty absolute path')
    }
    return resolve(configured)
  }
  return join(resolveDshHome(), 'cache', 'dsh-univer-office', 'resources')
}
