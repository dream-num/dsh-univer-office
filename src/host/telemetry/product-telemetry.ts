// Best-effort product telemetry. Three allowlisted events travel through the
// Univer-owned proxy (https://univer.ai/api/telemetry/cli); the proxy holds the
// only analytics credentials, and this client never carries a key. Telemetry
// must never change startup or uninstall behavior: every failure is
// swallowed, sends are bounded by a short timeout, and there is no retry.
//
// Deduplication is local-only, recorded in one state file before the first
// send attempt (at-most-once: a crash between write and send loses the event
// but never duplicates it). Concurrent host starts may race on that file and
// double-send once; this is accepted because the signal is read as a trend.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { resolveDshHome } from '../dsh-home.ts'

export const TELEMETRY_STATE_VERSION = 1
export const TELEMETRY_TIMEOUT_MS = 5_000

export type TelemetryEventName =
  | 'dsh_plugin_activated'
  | 'dsh_plugin_daily_active'
  | 'dsh_plugin_uninstall_hook'

export type TelemetryEventSource = 'uninstall-hook' | 'host-activate'

/** Version and commit recorded at build time by scripts/build.mjs. */
export interface TelemetryBuildInfo {
  readonly telemetryEndpoint?: string
  readonly version?: string
  readonly commit?: string
}

export interface TelemetryState {
  readonly anonymousInstallId: string
  /** Mirrored from the `telemetry` config so hook-fired sends honor it too. */
  readonly disabled?: boolean
  readonly activatedAttemptedAt?: string
  readonly dailyActiveSentDate?: string
  readonly version: typeof TELEMETRY_STATE_VERSION
}

export interface TelemetryStateIo {
  readonly readFile?: typeof readFile
  readonly writeFile?: typeof writeFile
  readonly rename?: typeof rename
  readonly mkdir?: typeof mkdir
}

export interface TelemetryCapture {
  readonly distinctId: string
  readonly event: TelemetryEventName
  readonly properties: Record<string, string | number>
}

export type TelemetryTransport = (input: {
  readonly body: TelemetryCapture
  readonly endpoint: string
}) => Promise<void>

export interface CaptureTelemetryInput {
  readonly event: TelemetryEventName
  readonly source: TelemetryEventSource
  readonly buildInfo: TelemetryBuildInfo
  readonly endpoint: string
  readonly env?: NodeJS.ProcessEnv
  readonly now?: Date
  readonly randomId?: () => string
  readonly stateIo?: TelemetryStateIo
  readonly statePath?: string
  readonly transport?: TelemetryTransport
}

export interface CaptureTelemetryResult {
  readonly reason?:
    | 'already-attempted'
    | 'already-sent-today'
    | 'capture-failed'
    | 'disabled'
    | 'do-not-track'
    | 'missing-endpoint'
    | 'state-unavailable'
  readonly status: 'captured' | 'skipped'
}

export interface HostTelemetryInput {
  /** Mirrored into the state file so hook-fired sends honor the config too. */
  readonly telemetryEnabled: boolean
  readonly buildInfo?: TelemetryBuildInfo
  readonly env?: NodeJS.ProcessEnv
  readonly now?: Date
  readonly randomId?: () => string
  readonly stateIo?: TelemetryStateIo
  readonly statePath?: string
  readonly transport?: TelemetryTransport
}

export function resolveTelemetryStatePath(
  input: {
    readonly env?: NodeJS.ProcessEnv
    readonly homeDir?: string
  } = {}
): string {
  const env = input.env ?? process.env
  return resolve(resolveDshHome(env, input.homeDir), 'telemetry', 'dsh-univer-office', 'state.json')
}

/**
 * Resolution order: an explicitly set `UNIVER_TELEMETRY_ENDPOINT` (even empty,
 * which disables telemetry) wins over the address hardcoded into the build, so
 * tests and incident response can always redirect or cut the endpoint. An
 * empty result disables telemetry entirely.
 */
export function telemetryEndpointFor(input: {
  readonly buildInfo: TelemetryBuildInfo
  readonly env?: NodeJS.ProcessEnv
}): string {
  const env = input.env ?? process.env
  const override = env.UNIVER_TELEMETRY_ENDPOINT
  if (override !== undefined) {
    const trimmed = override.trim()
    return trimmed.length === 0 ? '' : trimmed
  }
  const fromBuildInfo = input.buildInfo.telemetryEndpoint?.trim()
  return fromBuildInfo === undefined || fromBuildInfo.length === 0 ? '' : fromBuildInfo
}

/**
 * Reads the build-info file generated next to the bundled entry by
 * scripts/build.mjs. Absent or malformed file (dev checkout without a build)
 * yields an empty info, which keeps telemetry inert via the empty endpoint.
 */
export function readBundledBuildInfo(): TelemetryBuildInfo {
  try {
    const value: unknown = JSON.parse(
      readFileSync(new URL('build-info.json', import.meta.url), 'utf8')
    )
    if (!isRecord(value)) return {}
    return {
      ...(typeof value.telemetryEndpoint === 'string' && value.telemetryEndpoint.length > 0
        ? { telemetryEndpoint: value.telemetryEndpoint }
        : {}),
      ...(typeof value.commit === 'string' ? { commit: value.commit } : {}),
      ...(typeof value.version === 'string' ? { version: value.version } : {})
    }
  } catch {
    return {}
  }
}

/**
 * Runs the host-side telemetry pass at plugin activation: syncs the disabled
 * flag, then reports activation and the daily session. Never throws and
 * registers nothing, so plugin unload has no telemetry resources to settle.
 */
export async function runHostTelemetry(input: HostTelemetryInput): Promise<void> {
  const env = input.env ?? process.env
  if (isDoNotTrack(env)) return
  try {
    const buildInfo = input.buildInfo ?? readBundledBuildInfo()
    const statePath = input.statePath ?? resolveTelemetryStatePath({ env })
    const enabled = await syncTelemetryDisabled({
      statePath,
      telemetryEnabled: input.telemetryEnabled,
      ...(input.stateIo === undefined ? {} : { stateIo: input.stateIo })
    })
    if (!enabled) return
    const endpoint = telemetryEndpointFor({ buildInfo, env })
    if (endpoint.length === 0) return
    const base = {
      buildInfo,
      endpoint,
      env,
      ...(input.now === undefined ? {} : { now: input.now }),
      ...(input.randomId === undefined ? {} : { randomId: input.randomId }),
      ...(input.stateIo === undefined ? {} : { stateIo: input.stateIo }),
      statePath,
      ...(input.transport === undefined ? {} : { transport: input.transport })
    }
    await captureTelemetry({ ...base, event: 'dsh_plugin_activated', source: 'host-activate' })
    await captureTelemetry({ ...base, event: 'dsh_plugin_daily_active', source: 'host-activate' })
  } catch {
    // Telemetry must never affect plugin activation.
  }
}

/** Returns false when telemetry must stay off for hook sends as well. */
async function syncTelemetryDisabled(input: {
  readonly statePath: string
  readonly stateIo?: TelemetryStateIo
  readonly telemetryEnabled: boolean
}): Promise<boolean> {
  const state = await readOrCreateTelemetryState({
    path: input.statePath,
    ...(input.stateIo === undefined ? {} : { stateIo: input.stateIo })
  })
  if (!input.telemetryEnabled) {
    if (state.disabled !== true) {
      await writeTelemetryState({
        path: input.statePath,
        state: { ...state, disabled: true, version: TELEMETRY_STATE_VERSION },
        ...(input.stateIo === undefined ? {} : { stateIo: input.stateIo })
      })
    }
    return false
  }
  if (state.disabled === true) {
    // The config re-enabled telemetry: clear the flag so hook sends resume.
    const { disabled: _disabled, ...withoutDisabled } = state
    await writeTelemetryState({
      path: input.statePath,
      state: { ...withoutDisabled, version: TELEMETRY_STATE_VERSION },
      ...(input.stateIo === undefined ? {} : { stateIo: input.stateIo })
    })
  }
  return true
}

export async function captureTelemetry(
  input: CaptureTelemetryInput
): Promise<CaptureTelemetryResult> {
  const env = input.env ?? process.env
  if (isDoNotTrack(env)) return { reason: 'do-not-track', status: 'skipped' }
  if (input.endpoint.length === 0) return { reason: 'missing-endpoint', status: 'skipped' }

  const now = input.now ?? new Date()
  const statePath = input.statePath ?? resolveTelemetryStatePath({ env })
  const state = await readOrCreateTelemetryState({
    path: statePath,
    ...(input.randomId === undefined ? {} : { randomId: input.randomId }),
    ...(input.stateIo === undefined ? {} : { stateIo: input.stateIo })
  })
  if (state.disabled === true) return { reason: 'disabled', status: 'skipped' }

  const next = markTelemetryEvent({ event: input.event, now, state })
  if (next === undefined) return { reason: alreadyReason(input.event), status: 'skipped' }
  const persisted = await writeTelemetryState({
    path: statePath,
    state: next,
    ...(input.stateIo === undefined ? {} : { stateIo: input.stateIo })
  })
  // Fail closed: an unpersisted mark would let later starts send duplicates,
  // so the send is dropped instead (losing one event beats double counting).
  if (!persisted) return { reason: 'state-unavailable', status: 'skipped' }

  const nodeMajor = readNodeMajorVersion(process.versions.node)
  const capture: TelemetryCapture = {
    distinctId: next.anonymousInstallId,
    event: input.event,
    properties: {
      arch: process.arch,
      build_commit: input.buildInfo.commit ?? '',
      event_source: input.source,
      // The proxy rejects unknown or non-scalar values wholesale, so an
      // unavailable version is omitted instead of sent as a placeholder.
      ...(nodeMajor === undefined ? {} : { node_major_version: nodeMajor }),
      package_name: 'dsh-univer-office',
      package_version: input.buildInfo.version ?? '',
      platform: process.platform,
      telemetry_state_version: TELEMETRY_STATE_VERSION
    }
  }
  try {
    const send = input.transport ?? fetchTelemetryTransport
    await send({ body: capture, endpoint: input.endpoint })
    return { status: 'captured' }
  } catch {
    return { reason: 'capture-failed', status: 'skipped' }
  }
}

export const fetchTelemetryTransport: TelemetryTransport = async ({ body, endpoint }) => {
  const response = await fetch(endpoint, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    signal: AbortSignal.timeout(TELEMETRY_TIMEOUT_MS)
  })
  if (!response.ok) throw new Error(`telemetry proxy responded with status ${response.status}`)
}

/**
 * Applies the once-only (or daily) mark for an event, or returns undefined
 * when the event was already attempted and must not be sent again. The
 * uninstall hook is deliberately never deduplicated: state survives
 * reinstall, so a once-mark would hide every uninstall after the first.
 */
function markTelemetryEvent(input: {
  readonly event: TelemetryEventName
  readonly now: Date
  readonly state: TelemetryState
}): TelemetryState | undefined {
  const { event, now, state } = input
  if (event === 'dsh_plugin_uninstall_hook') return state
  if (event === 'dsh_plugin_daily_active') {
    const date = localDate(now)
    if (state.dailyActiveSentDate === date) return undefined
    return { ...state, dailyActiveSentDate: date, version: TELEMETRY_STATE_VERSION }
  }
  if (event === 'dsh_plugin_activated' && state.activatedAttemptedAt !== undefined) return undefined
  return {
    ...state,
    activatedAttemptedAt: now.toISOString(),
    version: TELEMETRY_STATE_VERSION
  }
}

function alreadyReason(event: TelemetryEventName): 'already-attempted' | 'already-sent-today' {
  return event === 'dsh_plugin_daily_active' ? 'already-sent-today' : 'already-attempted'
}

export function parseTelemetryState(json: string): TelemetryState {
  const value: unknown = JSON.parse(json)
  if (!isRecord(value) || value.version !== TELEMETRY_STATE_VERSION) {
    throw new Error('Invalid telemetry state version.')
  }
  if (typeof value.anonymousInstallId !== 'string' || value.anonymousInstallId.length === 0) {
    throw new Error('Invalid telemetry anonymous install id.')
  }
  const activatedAttemptedAt = readTimestamp(value.activatedAttemptedAt)
  const dailyActiveSentDate =
    typeof value.dailyActiveSentDate === 'string' && value.dailyActiveSentDate.length > 0
      ? value.dailyActiveSentDate
      : undefined
  return {
    anonymousInstallId: value.anonymousInstallId,
    ...(activatedAttemptedAt === undefined ? {} : { activatedAttemptedAt }),
    ...(value.disabled === true ? { disabled: true } : {}),
    ...(dailyActiveSentDate === undefined ? {} : { dailyActiveSentDate }),
    version: TELEMETRY_STATE_VERSION
  }
}

export function serializeTelemetryState(state: TelemetryState): string {
  return `${JSON.stringify(state, null, 2)}\n`
}

async function readOrCreateTelemetryState(input: {
  readonly path: string
  readonly randomId?: () => string
  readonly stateIo?: TelemetryStateIo
}): Promise<TelemetryState> {
  const read = input.stateIo?.readFile ?? readFile
  try {
    return parseTelemetryState(await read(input.path, 'utf8'))
  } catch {
    // Missing or corrupt state starts a fresh anonymous identity; the old one,
    // if any, is unrecoverable and a duplicate activation is acceptable.
    return {
      anonymousInstallId: input.randomId?.() ?? randomUUID(),
      version: TELEMETRY_STATE_VERSION
    }
  }
}

async function writeTelemetryState(input: {
  readonly path: string
  readonly state: TelemetryState
  readonly stateIo?: TelemetryStateIo
}): Promise<boolean> {
  const write = input.stateIo?.writeFile ?? writeFile
  const move = input.stateIo?.rename ?? rename
  const makeDir = input.stateIo?.mkdir ?? mkdir
  const tempPath = `${input.path}.${process.pid}.${Date.now()}.tmp`
  try {
    await makeDir(dirname(input.path), { mode: 0o700, recursive: true })
    await write(tempPath, serializeTelemetryState(input.state), { encoding: 'utf8', mode: 0o600 })
    await move(tempPath, input.path)
    return true
  } catch {
    // Telemetry state must never affect plugin activation or uninstall.
    return false
  }
}

function isDoNotTrack(env: NodeJS.ProcessEnv): boolean {
  const value = env.DO_NOT_TRACK?.trim()
  return value !== undefined && value.length > 0
}

function localDate(now: Date): string {
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function readTimestamp(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readNodeMajorVersion(version: string): number | undefined {
  const major = Number(version.split('.')[0])
  return Number.isSafeInteger(major) && major > 0 ? major : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
