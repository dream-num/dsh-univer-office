import type { ScreenshotImageAssetResolver } from '@univer-cli/unit-screenshot'
import { resolveUnitScreenshotImageAssets } from '@univer-cli/unit-screenshot'
import type {
  UniverRenderEmbeddedUnit,
  UniverRenderFormulaReferenceUnit,
  UniverRenderUnit
} from '@univer-cli/univer-render-runtime'
import { GatewayClient } from '../adapters/gateway/client.ts'
import { GatewayFileApi, fileKeyOf } from '../adapters/gateway/file-api.ts'
import { GatewayWorktreeApi } from '../adapters/gateway/worktree-api.ts'
import { mapUnits, type GatewayUnit } from '../adapters/gateway/mapping.ts'
import { UniverError } from '../service/errors.ts'
import type { JsonValue, UniverUnitKind } from '../service/types.ts'
import type { UnitContentOperations } from './unit-content-operations.ts'

const EXTERNAL_REFERENCE_RESOURCE = 'UNIVER_EXTERNAL_REFERENCE_PLUGIN'
const EMBED_RESOURCE = 'UNIVER_EMBED_RESOURCE_PLUGIN'

interface RenderSourceRecord {
  readonly unitType: UniverUnitKind
  readonly unitData: { [key: string]: JsonValue }
}

/** Assemble one render target with dependency Units and authorized embedded image bytes. */
export class RenderSourceOperations {
  constructor(
    private readonly unitContent: UnitContentOperations,
    private readonly gatewayRequestTimeoutMs: number
  ) {}

  async load(
    gateway: string,
    file: string,
    unitId: string,
    worktreeId: string | undefined,
    signal?: AbortSignal
  ): Promise<UniverRenderUnit> {
    const primary = await this.unitContent.renderSource(gateway, file, unitId, worktreeId, signal)
    const client = new GatewayClient(gateway, this.gatewayRequestTimeoutMs)
    const listing =
      worktreeId === undefined
        ? await new GatewayFileApi(client).listUnits(file)
        : await new GatewayWorktreeApi(client).listUnits(file, worktreeId)
    const units = mapUnits(listing)
    const formulaIds = externalReferenceUnitIds(primary.unitData)
    const embeddedIds = embeddedUnitIds(primary.unitData)
    const formulaReferenceUnits: UniverRenderFormulaReferenceUnit[] = []
    const formulaSet = new Set<string>()
    for (const dependencyId of formulaIds) {
      signal?.throwIfAborted()
      if (dependencyId === unitId) continue
      const dependency = requireDependency(units, dependencyId, 'formula reference')
      if (dependency.type !== 2 && dependency.type !== 5) {
        throw new UniverError(
          `Formula reference Unit ${dependencyId} is ${dependency.type}; expected Sheet or Base.`,
          'SCREENSHOT_REFERENCE_UNIT_TYPE_UNSUPPORTED'
        )
      }
      const source = await this.unitContent.renderSource(
        gateway,
        file,
        dependencyId,
        worktreeId,
        signal
      )
      formulaReferenceUnits.push(asFormulaReferenceUnit(source))
      formulaSet.add(dependencyId)
    }

    const embeddedUnits: UniverRenderEmbeddedUnit[] = []
    for (const dependencyId of embeddedIds) {
      signal?.throwIfAborted()
      if (dependencyId === unitId || formulaSet.has(dependencyId)) continue
      requireDependency(units, dependencyId, 'embedded')
      embeddedUnits.push(
        asEmbeddedUnit(
          await this.unitContent.renderSource(gateway, file, dependencyId, worktreeId, signal)
        )
      )
    }

    const source = asRenderUnit(primary, formulaReferenceUnits, embeddedUnits)
    return resolveUnitScreenshotImageAssets(
      source,
      assetResolver(gateway, file, worktreeId, this.gatewayRequestTimeoutMs),
      signal
    )
  }
}

function asRenderUnit(
  source: RenderSourceRecord,
  formulaReferenceUnits: readonly UniverRenderFormulaReferenceUnit[],
  embeddedUnits: readonly UniverRenderEmbeddedUnit[]
): UniverRenderUnit {
  const dependencies = {
    ...(formulaReferenceUnits.length === 0 ? {} : { formulaReferenceUnits }),
    ...(embeddedUnits.length === 0 ? {} : { embeddedUnits })
  }
  return { ...asEmbeddedUnit(source), ...dependencies }
}

function asEmbeddedUnit(source: RenderSourceRecord): UniverRenderEmbeddedUnit {
  if (source.unitType === 'sheet') return { unitType: 'sheet', unitData: source.unitData as never }
  if (source.unitType === 'doc') return { unitType: 'doc', unitData: source.unitData as never }
  if (source.unitType === 'slide') return { unitType: 'slide', unitData: source.unitData as never }
  if (source.unitType === 'base') return { unitType: 'base', unitData: source.unitData as never }
  return { unitType: 'board', unitData: source.unitData as never }
}

function asFormulaReferenceUnit(source: RenderSourceRecord): UniverRenderFormulaReferenceUnit {
  if (source.unitType === 'sheet') return { unitType: 'sheet', unitData: source.unitData as never }
  if (source.unitType === 'base') return { unitType: 'base', unitData: source.unitData as never }
  throw new UniverError(
    `Formula reference Unit is ${source.unitType}; expected Sheet or Base.`,
    'SCREENSHOT_REFERENCE_UNIT_TYPE_UNSUPPORTED'
  )
}

function requireDependency(
  units: readonly GatewayUnit[],
  unitId: string,
  role: string
): GatewayUnit {
  const unit = units.find((candidate) => candidate.unitId === unitId)
  if (unit !== undefined) return unit
  throw new UniverError(
    `${role} Unit ${unitId} was not found in the selected scope.`,
    'SCREENSHOT_UNIT_NOT_FOUND'
  )
}

function assetResolver(
  gateway: string,
  file: string,
  worktreeId: string | undefined,
  timeoutMs: number
): ScreenshotImageAssetResolver {
  const scope = worktreeId === undefined ? '' : `/worktrees/${encodeURIComponent(worktreeId)}`
  return {
    async resolve(input) {
      const timeout = AbortSignal.timeout(timeoutMs)
      const signal = input.signal === undefined ? timeout : AbortSignal.any([input.signal, timeout])
      const path = `/uf/${fileKeyOf(file)}${scope}/universer-api/file/${encodeURIComponent(input.source)}/content`
      let response: Response
      try {
        response = await fetch(`${gateway}${path}`, { signal })
      } catch (error) {
        if (input.signal?.aborted === true) throw input.signal.reason
        throw new UniverError('Gateway asset request failed.', 'SCREENSHOT_ASSET_REQUEST_FAILED', {
          cause: error
        })
      }
      if (response.status === 404) return undefined
      if (!response.ok) {
        throw new UniverError(
          `Gateway asset request returned HTTP ${String(response.status)}.`,
          'SCREENSHOT_ASSET_REQUEST_FAILED'
        )
      }
      const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
      if (mediaType === undefined || !/^image\/[a-z0-9][a-z0-9.+-]*$/u.test(mediaType))
        return undefined
      const bytes = new Uint8Array(await response.arrayBuffer())
      return {
        bytes,
        mediaType,
        ...(response.headers.get('content-length') === null
          ? {}
          : { contentLength: bytes.byteLength })
      }
    }
  }
}

function externalReferenceUnitIds(unitData: Record<string, JsonValue>): readonly string[] {
  const ids = new Set<string>()
  for (const resource of namedResources(unitData, EXTERNAL_REFERENCE_RESOURCE)) {
    const decoded = parseResourceData(resource, EXTERNAL_REFERENCE_RESOURCE)
    const references = decoded.references
    if (!isRecord(references)) {
      throw new UniverError(
        `${EXTERNAL_REFERENCE_RESOURCE} references must be an object.`,
        'SCREENSHOT_REFERENCE_RESOURCE_INVALID'
      )
    }
    for (const reference of Object.values(references)) {
      if (!isRecord(reference) || !nonEmptyString(reference.sourceUnitId)) {
        throw new UniverError(
          `${EXTERNAL_REFERENCE_RESOURCE} sourceUnitId is missing.`,
          'SCREENSHOT_REFERENCE_RESOURCE_INVALID'
        )
      }
      ids.add(reference.sourceUnitId)
    }
  }
  return [...ids].sort()
}

function embeddedUnitIds(unitData: Record<string, JsonValue>): readonly string[] {
  const ids = new Set<string>()
  for (const resource of namedResources(unitData, EMBED_RESOURCE)) {
    const decoded = parseResourceData(resource, EMBED_RESOURCE)
    const embeds = decoded.embeds
    if (!isRecord(embeds)) {
      throw new UniverError(
        `${EMBED_RESOURCE} embeds must be an object.`,
        'SCREENSHOT_EMBED_RESOURCE_INVALID'
      )
    }
    for (const descriptor of Object.values(embeds)) {
      if (!isRecord(descriptor)) {
        throw new UniverError(
          `${EMBED_RESOURCE} descriptor must be an object.`,
          'SCREENSHOT_EMBED_RESOURCE_INVALID'
        )
      }
      if (descriptor.lifecycle === 'soft-deleted') continue
      const source = isRecord(descriptor.source) ? descriptor.source : undefined
      const ref = source?.ref
      const unitRef = isRecord(ref) && isRecord(ref.unit) ? ref.unit : undefined
      const fromString = typeof ref === 'string' ? unitSelectorFromResourceRef(ref) : undefined
      const unitId = nonEmptyString(descriptor.childUnitId)
        ? descriptor.childUnitId
        : nonEmptyString(unitRef?.selector)
          ? unitRef.selector
          : fromString
      if (unitId === undefined) {
        throw new UniverError(
          `${EMBED_RESOURCE} active child Unit ID is missing.`,
          'SCREENSHOT_EMBED_RESOURCE_INVALID'
        )
      }
      ids.add(unitId)
    }
  }
  return [...ids].sort()
}

function namedResources(
  unitData: Record<string, JsonValue>,
  name: string
): readonly Record<string, JsonValue>[] {
  const resources = unitData.resources
  if (!Array.isArray(resources)) return []
  return resources.filter(
    (resource): resource is Record<string, JsonValue> =>
      isRecord(resource) && resource.name === name
  )
}

function parseResourceData(
  resource: Record<string, JsonValue>,
  name: string
): Record<string, unknown> {
  if (typeof resource.data !== 'string') {
    throw new UniverError(`${name} data must be a JSON string.`, 'SCREENSHOT_RESOURCE_INVALID')
  }
  try {
    const value = JSON.parse(resource.data) as unknown
    if (!isRecord(value)) throw new Error('not an object')
    return value
  } catch (error) {
    throw new UniverError(`${name} data is not valid JSON.`, 'SCREENSHOT_RESOURCE_INVALID', {
      cause: error
    })
  }
}

function unitSelectorFromResourceRef(ref: string): string | undefined {
  const match = /(?:^|[#&])unit=([^&]+)/u.exec(ref)
  if (match?.[1] === undefined) return undefined
  try {
    return decodeURIComponent(match[1])
  } catch (error) {
    throw new UniverError(
      `${EMBED_RESOURCE} resource ref has invalid percent encoding.`,
      'SCREENSHOT_EMBED_RESOURCE_INVALID',
      { cause: error }
    )
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
