import { createStandardHeadlessUniverFactory } from '@univer-cli/headless-univer'
import {
  createCollaborationServerAdapter,
  createUniverCollaborationRuntimeFactory,
  type UniverCollaborationRuntime,
  type UniverFactoryContext
} from '@univer-cli/univer-collaboration-runtime'
import type { UniverInstanceType } from '@univerjs/core'
import { unitContentError, unitContentKind } from '../../../shared/unit-content-session.ts'
import { UNIVER_LICENSE } from '../license.ts'
import { createLocalReferencedUnitProviderRegistration } from './local-referenced-unit-provider.ts'
import { LocalSnapshotServerAdapter } from './local-snapshot-server-adapter.ts'

/**
 * Everything one Collaboration Runtime needs to bind a Unit through the Gateway. The one-shot
 * Unit Content Worker and the pooled Collaboration Runtime Worker both load runtimes from it.
 */
export interface UnitContentRuntimeInit {
  readonly gatewayOrigin: string
  readonly commitTimeoutMs: number
  readonly fileKey: string
  readonly unitId: string
  readonly unitType: UniverInstanceType
  readonly worktreeId?: string
}

/** Validate runtime initialization that crossed a process boundary. */
export function parseUnitContentRuntimeInit(value: unknown): UnitContentRuntimeInit {
  if (!isRecord(value)) invalidRequest('Unit content runtime init must be an object')
  return {
    gatewayOrigin: requiredHttpOrigin(value.gatewayOrigin),
    commitTimeoutMs: requiredPositiveInteger(value.commitTimeoutMs, 'commitTimeoutMs'),
    fileKey: requiredString(value.fileKey, 'fileKey'),
    unitId: requiredString(value.unitId, 'unitId'),
    unitType: requiredUnitType(value.unitType),
    ...optionalWorktreeId(value.worktreeId)
  }
}

/** Load one Collaboration Runtime bound to the Gateway scope named by `init`. */
export async function loadUnitContentRuntime(
  init: UnitContentRuntimeInit
): Promise<UniverCollaborationRuntime> {
  const urls = gatewayUrls(init)
  const snapshotServerService = new LocalSnapshotServerAdapter(urls.snapshotServerUrl)
  const createUniver = async (context: UniverFactoryContext) => {
    if (context.resolveSnapshotService === undefined) {
      throw unitContentError(
        'UNIT_CONTENT_SNAPSHOT_SERVICE_REQUIRED',
        'Referenced Unit loading requires SnapshotService'
      )
    }
    return await createStandardHeadlessUniverFactory({
      license: process.env['UNIVER_LICENSE']?.trim() || UNIVER_LICENSE,
      embedPluginConfig: {
        resourceRefUnitProviderRegistrations: [
          createLocalReferencedUnitProviderRegistration({
            resolveSnapshotService: context.resolveSnapshotService
          })
        ]
      }
    })(context)
  }
  return await createUniverCollaborationRuntimeFactory({
    backend: createCollaborationServerAdapter(urls),
    createUniver,
    snapshotServerService
  }).load(init.unitId, init.unitType)
}

function gatewayUrls(init: UnitContentRuntimeInit) {
  const root = `${init.gatewayOrigin.replace(/\/$/u, '')}/uf/${init.fileKey}`
  const wsRoot = root.replace(/^http/u, 'ws')
  const worktree =
    init.worktreeId === undefined ? '' : `/worktrees/${encodeURIComponent(init.worktreeId)}`
  const base = `${root}${worktree}`
  const wsBase = `${wsRoot}${worktree}`
  return {
    snapshotServerUrl: `${base}/universer-api/snapshot`,
    collabSubmitChangesetUrl: `${base}/universer-api/comb`,
    collabWebSocketUrl: `${wsBase}/universer-api/comb/connect`,
    wsSessionTicketUrl: `${base}/universer-api/user/session-ticket`,
    commitTimeoutMs: init.commitTimeoutMs
  }
}

function requiredHttpOrigin(value: unknown): string {
  const origin = requiredString(value, 'gatewayOrigin')
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return invalidRequest('gatewayOrigin must be a valid HTTP origin')
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.origin !== origin ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    return invalidRequest('gatewayOrigin must be an HTTP origin without credentials or a path')
  }
  return origin
}

function requiredUnitType(value: unknown): UniverInstanceType {
  if (!Number.isSafeInteger(value)) invalidRequest('unitType must be an integer')
  unitContentKind(Number(value))
  return value as UniverInstanceType
}

function requiredPositiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    invalidRequest(`${field} must be a positive integer`)
  return Number(value)
}

export function requiredString(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    return invalidRequest(`${field} must be ${allowEmpty ? 'a string' : 'a non-empty string'}`)
  }
  return value
}

function optionalWorktreeId(value: unknown): { readonly worktreeId?: string } {
  if (value === undefined) return {}
  return { worktreeId: requiredString(value, 'worktreeId') }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function invalidRequest(message: string): never {
  throw unitContentError('UNIT_CONTENT_WORKER_REQUEST_INVALID', message)
}
