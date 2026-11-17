import { isAbsolute, join, resolve } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { DEFAULT_UNIVER_SETTINGS } from '../shared/settings.ts'
import { resolveDshHome } from './dsh-home.ts'

/** Configuration shared by the Univer service provider and its consumers. */
export interface Config {
  /** Live browser preference; modern DSH owns its resolved value. */
  autoOpenLivePreview?: boolean
  /** Live browser preference; modern DSH owns its resolved value. */
  conversationReviewCards?: boolean
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
  /** Maximum time for one content operation, or for opening a pooled runtime worker. */
  unitContentOperationTimeoutMs?: number
  /**
   * Pooled Collaboration Runtime Workers kept for inspection, execution, and render-source
   * reads. `0` runs every operation one-shot.
   */
  unitContentRuntimeMaxEntries?: number
  /** Idle time after which a pooled Collaboration Runtime Worker exits. */
  unitContentRuntimeIdleTtlMs?: number
  /** Maximum lifetime of one browser-backed screenshot operation. */
  screenshotOperationTimeoutMs?: number
  /** Maximum lifetime of one browser-backed PDF print operation. */
  printPdfOperationTimeoutMs?: number
  /** Maximum number of document or slide pages captured by one screenshot call. */
  screenshotMaxPages?: number
  /** Maximum pixel count for each rendered screenshot image. */
  screenshotMaxPixels?: number
  /**
   * Browser executable used by all browser-backed render operations. When unset,
   * the render runtime auto-detects Chrome/Chromium (and Edge on macOS); this
   * option overrides every other detection step, including `UNIVER_RENDER_BROWSER`.
   */
  browserExecutablePath?: string
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
  /**
   * Skill names whose successful loading admits every `univer_*` tool from the following
   * step. An empty list discloses them unconditionally; so does `skills: false`, because no
   * bundled skill can load then.
   */
  activationSkills?: string[]
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
  readonly unitContentRuntimeMaxEntries: number
  readonly unitContentRuntimeIdleTtlMs: number
  readonly screenshotOperationTimeoutMs: number
  readonly printPdfOperationTimeoutMs: number
  readonly screenshotMaxPages: number
  readonly screenshotMaxPixels: number
  readonly browserExecutablePath?: string
  readonly resourceCacheRoot: string
  readonly resourceDownloadTimeoutMs: number
  readonly resourceOperationTimeoutMs: number
  readonly unitContentCommitTimeoutMs: number
  readonly stateCacheTtlMs: number
  readonly unitCacheTtlMs: number
  readonly tools: boolean
  readonly skills: boolean
  readonly activationSkills: readonly string[]
  readonly telemetry: boolean
}

/**
 * Bundled skill directories that route the model to Univer; loading any one of them admits the
 * tools. The LibreOffice Kit skills belong to DSH and stay independent. A unit test keeps this
 * list in step with `skills/`.
 */
export const DEFAULT_ACTIVATION_SKILLS: readonly string[] = [
  'office',
  'office-docx',
  'office-pptx',
  'office-xlsx',
  'univer',
  'univer-base',
  'univer-board',
  'univer-cross-unit-formula',
  'univer-doc',
  'univer-embed',
  'univer-sheet',
  'univer-slide'
]

/**
 * Declare live fields using the serialized metadata understood by DSH 0.1.7+.
 * Older schemastery accepts this metadata without requiring its new volatile()
 * builder; legacy Hosts continue to own preferences through settings.register.
 */
function livePreference(value: boolean): z<boolean> {
  const field = z.boolean().default(value)
  Object.assign(field.meta, { volatile: true })
  return field
}

/** Cordis configuration schema. */
export const Config: z<Config> = z.object({
  autoOpenLivePreview: livePreference(DEFAULT_UNIVER_SETTINGS.autoOpenLivePreview),
  conversationReviewCards: livePreference(DEFAULT_UNIVER_SETTINGS.conversationReviewCards),
  gatewayPort: z.natural().max(65535).default(9080),
  autoStartGateway: z.boolean().default(true),
  gatewayStartupTimeoutMs: z.natural().default(10_000),
  gatewayRequestTimeoutMs: z.natural().default(3_000),
  gatewayMutationTimeoutMs: z.natural().default(60_000),
  unitContentOperationTimeoutMs: z.natural().default(120_000),
  unitContentRuntimeMaxEntries: z.natural().default(20),
  unitContentRuntimeIdleTtlMs: z.natural().default(300_000),
  screenshotOperationTimeoutMs: z.natural().default(120_000),
  printPdfOperationTimeoutMs: z.natural().default(120_000),
  screenshotMaxPages: z.natural().default(30),
  screenshotMaxPixels: z.natural().default(16_777_216),
  browserExecutablePath: z.string(),
  resourceCacheRoot: z.string(),
  resourceDownloadTimeoutMs: z.natural().default(15_000),
  resourceOperationTimeoutMs: z.natural().default(120_000),
  unitContentCommitTimeoutMs: z.natural().default(5_000),
  stateCacheTtlMs: z.natural().default(1_000),
  unitCacheTtlMs: z.natural().default(5_000),
  tools: z.boolean().default(true),
  skills: z.boolean().default(true),
  activationSkills: z
    .array(z.string().pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))
    .default([...DEFAULT_ACTIVATION_SKILLS]),
  telemetry: z.boolean().default(true)
})

/** Apply defaults and reject configuration that cannot run. */
export function resolveConfig(config: Config = {}): ResolvedConfig {
  const browserExecutablePath = resolveBrowserExecutablePath(config.browserExecutablePath)
  const resolved: ResolvedConfig = {
    gatewayPort: config.gatewayPort ?? 9080,
    autoStartGateway: config.autoStartGateway ?? true,
    gatewayStartupTimeoutMs: config.gatewayStartupTimeoutMs ?? 10_000,
    gatewayRequestTimeoutMs: config.gatewayRequestTimeoutMs ?? 3_000,
    gatewayMutationTimeoutMs: config.gatewayMutationTimeoutMs ?? 60_000,
    unitContentOperationTimeoutMs: config.unitContentOperationTimeoutMs ?? 120_000,
    unitContentRuntimeMaxEntries: config.unitContentRuntimeMaxEntries ?? 20,
    unitContentRuntimeIdleTtlMs: config.unitContentRuntimeIdleTtlMs ?? 300_000,
    screenshotOperationTimeoutMs: config.screenshotOperationTimeoutMs ?? 120_000,
    printPdfOperationTimeoutMs: config.printPdfOperationTimeoutMs ?? 120_000,
    screenshotMaxPages: config.screenshotMaxPages ?? 30,
    screenshotMaxPixels: config.screenshotMaxPixels ?? 16_777_216,
    ...(browserExecutablePath === undefined ? {} : { browserExecutablePath }),
    resourceCacheRoot: resolveResourceCacheRoot(config.resourceCacheRoot),
    resourceDownloadTimeoutMs: config.resourceDownloadTimeoutMs ?? 15_000,
    resourceOperationTimeoutMs: config.resourceOperationTimeoutMs ?? 120_000,
    unitContentCommitTimeoutMs: config.unitContentCommitTimeoutMs ?? 5_000,
    stateCacheTtlMs: config.stateCacheTtlMs ?? 1_000,
    unitCacheTtlMs: config.unitCacheTtlMs ?? 5_000,
    tools: config.tools ?? true,
    skills: config.skills ?? true,
    activationSkills: resolveActivationSkills(config.activationSkills),
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
    unitContentRuntimeIdleTtlMs: resolved.unitContentRuntimeIdleTtlMs,
    screenshotOperationTimeoutMs: resolved.screenshotOperationTimeoutMs,
    printPdfOperationTimeoutMs: resolved.printPdfOperationTimeoutMs,
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
  if (
    !Number.isSafeInteger(resolved.unitContentRuntimeMaxEntries) ||
    resolved.unitContentRuntimeMaxEntries < 0
  ) {
    throw new Error('univer: unitContentRuntimeMaxEntries must be a non-negative integer')
  }
  return resolved
}

/** Bundled skill identifiers are kebab-case directory names; duplicates collapse. */
const ACTIVATION_SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function resolveActivationSkills(configured: readonly string[] | undefined): readonly string[] {
  if (configured === undefined) return DEFAULT_ACTIVATION_SKILLS
  const skills: string[] = []
  for (const name of configured) {
    if (!ACTIVATION_SKILL_NAME.test(name)) {
      throw new Error(
        `univer: activationSkills entries must be kebab-case skill names, got ${JSON.stringify(name)}`
      )
    }
    if (!skills.includes(name)) skills.push(name)
  }
  return skills
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

/** A relative browser path would silently depend on the Host process working directory. */
function resolveBrowserExecutablePath(configured: string | undefined): string | undefined {
  if (configured === undefined) return undefined
  const trimmed = configured.trim()
  if (trimmed.length === 0 || !isAbsolute(trimmed)) {
    throw new Error('univer: browserExecutablePath must be a non-empty absolute path')
  }
  return resolve(trimmed)
}
