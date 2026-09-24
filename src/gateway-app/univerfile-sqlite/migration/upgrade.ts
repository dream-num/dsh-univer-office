import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { UniverfileSQLiteConnection } from '../connection.ts'
import { UniverfileSQLiteAssetStore } from '../database-adapters/asset-store.ts'
import { UniverfileSQLiteHistoryDatabaseAdapter } from '../database-adapters/history-database-adapter.ts'
import { UniverfileSQLiteError } from '../errors.ts'
import { detectUniverfileSQLiteFormat } from '../schema/detect.ts'
import { createUniverfileBackup, sha256 } from './backup.ts'
import { migrateLegacyBaseContentToV2 } from './base-content.ts'
import { withUniverfileUpgradeLock } from './lock.ts'
import { pruneCandidateToCurrentSchema } from './prune.ts'
import { migrateV0CandidateToV3 } from './readers/v0.ts'
import { migrateV1CandidateToV2 } from './readers/v1.ts'
import { migrateV2CandidateToV3, normalizeChangesetCreateTimes } from './readers/v2.ts'
import { verifyV3Candidate, type UniverfileVerification } from './verify.ts'

export type UniverfileUpgradeSourceFormat = 'v0' | 'v1' | 'v2'

export type UniverfileUpgradeResult =
  | { readonly status: 'unchanged'; readonly format: 'v3' }
  | {
      readonly status: 'upgraded'
      readonly sourceFormat: UniverfileUpgradeSourceFormat
      readonly targetFormat: 'v3'
      readonly backupPath: string
      readonly backupSha256: string
      /** v0 and v1 logical Worktree commits have no Collaboration SDK equivalent. */
      readonly omitted: readonly 'logical-commit-history'[]
      readonly preserved: { readonly mergingWorktrees: number }
      readonly warnings: readonly string[]
      readonly verification: UniverfileVerification
    }

export interface UpgradeUniverfileSQLiteOptions {
  readonly lockTimeoutMs?: number
  /**
   * `subprocess` migrates in a helper process and replaces the original only after that process
   * exits. Windows needs this: libsql 0.5.29 keeps the file locked after `close()` until
   * statements are garbage-collected, so an in-process rename fails and every retry leaves
   * another backup.
   */
  readonly execution?: 'in-process' | 'subprocess'
}

const UPGRADE_WORKER_ENV = 'UNIVERFILE_UPGRADE_WORKER'
const UPGRADE_IN_PROCESS_ENV = 'UNIVERFILE_UPGRADE_IN_PROCESS'
const UPGRADE_PATH_ENV = 'UNIVERFILE_UPGRADE_PATH'
const UPGRADE_RESULT_ENV = 'UNIVERFILE_UPGRADE_RESULT'
const REPLACE_RETRY_MS = [0, 50, 100, 200, 400] as const
const WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4))

type PreparedUpgrade =
  | { readonly status: 'unchanged'; readonly format: 'v3' }
  | (Extract<UniverfileUpgradeResult, { readonly status: 'upgraded' }> & {
      readonly candidatePath?: string
    })

interface UpgradeWorkerSuccess {
  readonly ok: true
  readonly outcome: PreparedUpgrade
}

interface UpgradeWorkerFailure {
  readonly ok: false
  readonly code: ConstructorParameters<typeof UniverfileSQLiteError>[0]
  readonly message: string
}

export function upgradeUniverfileSQLite(
  filename: string,
  options: UpgradeUniverfileSQLiteOptions = {}
): UniverfileUpgradeResult {
  if (process.env[UPGRADE_IN_PROCESS_ENV] === '1')
    return publish(upgradeInProcess(filename, options))
  if (usesSubprocess(options)) return upgradeViaSubprocess(filename, options)
  return publish(upgradeInProcess(filename, options))
}

function usesSubprocess(options: UpgradeUniverfileSQLiteOptions): boolean {
  if (options.execution === 'subprocess') return true
  if (options.execution === 'in-process') return false
  return process.platform === 'win32'
}

function upgradeInProcess(
  filename: string,
  options: UpgradeUniverfileSQLiteOptions & {
    readonly assumeLocked?: boolean
    readonly deferReplace?: boolean
  }
): PreparedUpgrade {
  const run = (): PreparedUpgrade => prepareUpgrade(filename, options.deferReplace === true)
  if (options.assumeLocked === true) {
    if (detectUniverfileSQLiteFormat(filename) === 'v3')
      return { status: 'unchanged', format: 'v3' }
    return run()
  }
  const initial = detectUniverfileSQLiteFormat(filename)
  if (initial === 'v3') return { status: 'unchanged', format: 'v3' }
  return withUniverfileUpgradeLock(filename, options.lockTimeoutMs ?? 5_000, () => {
    if (detectUniverfileSQLiteFormat(filename) === 'v3')
      return { status: 'unchanged', format: 'v3' }
    return run()
  })
}

function publish(outcome: PreparedUpgrade): UniverfileUpgradeResult {
  if (outcome.status === 'unchanged') return outcome
  const { candidatePath: _candidatePath, ...result } = outcome
  return result
}

/**
 * Migrates outside this process, then replaces the original after the helper exits.
 *
 * The helper must not be this process: its libsql statements can keep both the source and the
 * candidate locked until the process ends, and `rename` over a locked file fails on Windows.
 * Session cards poll a failed open, so each failed replace used to leave another backup.
 */
function upgradeViaSubprocess(
  filename: string,
  options: UpgradeUniverfileSQLiteOptions
): UniverfileUpgradeResult {
  return withUniverfileUpgradeLock(filename, options.lockTimeoutMs ?? 5_000, () => {
    const outcome = runUpgradeChild(filename)
    if (outcome.status === 'unchanged') return outcome
    const candidatePath = outcome.candidatePath
    if (candidatePath === undefined) {
      throw new UniverfileSQLiteError(
        'UPGRADE_FAILED',
        `upgrade helper did not return a candidate for ${filename}`
      )
    }
    try {
      if (sha256(filename) !== outcome.backupSha256) {
        throw new Error('source file changed while its upgrade candidate was prepared')
      }
      replaceCandidate(candidatePath, filename)
    } catch (error) {
      if (existsSync(candidatePath)) unlinkSync(candidatePath)
      if (error instanceof UniverfileSQLiteError) throw error
      throw new UniverfileSQLiteError(
        'UPGRADE_FAILED',
        `failed to replace ${filename} with its upgrade candidate: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    }
    return publish(outcome)
  })
}

function prepareUpgrade(filename: string, deferReplace: boolean): PreparedUpgrade {
  const sourceFormat = detectUniverfileSQLiteFormat(filename)
  if (sourceFormat === 'v3') return { status: 'unchanged', format: 'v3' }
  const backup = createUniverfileBackup(filename, sourceFormat)
  const candidatePath = join(
    dirname(filename),
    `.${basename(filename)}.upgrade-${randomUUID()}.univer`
  )
  try {
    copyFileSync(backup.path, candidatePath)
    const preservedMergingWorktrees = migrateCandidate(candidatePath, sourceFormat)
    const verification = verifyV3Candidate(candidatePath)
    if (sha256(filename) !== backup.sha256) {
      throw new Error('source file changed while its upgrade candidate was prepared')
    }
    if (!deferReplace) renameSync(candidatePath, filename)
    return {
      status: 'upgraded',
      sourceFormat,
      targetFormat: 'v3',
      backupPath: backup.path,
      backupSha256: backup.sha256,
      omitted: sourceFormat === 'v2' ? [] : ['logical-commit-history'],
      preserved: { mergingWorktrees: preservedMergingWorktrees },
      warnings: [],
      verification,
      ...(deferReplace ? { candidatePath } : {})
    }
  } catch (error) {
    if (existsSync(candidatePath)) unlinkSync(candidatePath)
    if (error instanceof UniverfileSQLiteError) throw error
    throw new UniverfileSQLiteError(
      'UPGRADE_FAILED',
      `failed to upgrade ${filename} from ${sourceFormat} to v3: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }
}

function runUpgradeChild(filename: string): PreparedUpgrade {
  const resultPath = join(tmpdir(), `univerfile-upgrade-${randomUUID()}.json`)
  try {
    const child = spawnSync(process.execPath, [workerScriptPath()], {
      env: {
        ...process.env,
        [UPGRADE_WORKER_ENV]: '1',
        [UPGRADE_IN_PROCESS_ENV]: '1',
        [UPGRADE_PATH_ENV]: filename,
        [UPGRADE_RESULT_ENV]: resultPath
      },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 120_000
    })
    if (!existsSync(resultPath)) {
      const detail = `${child.stderr ?? ''}${child.stdout ?? ''}`.trim()
      throw new UniverfileSQLiteError(
        'UPGRADE_FAILED',
        detail || `upgrade helper exited (${String(child.status ?? child.signal ?? 'unknown')})`
      )
    }
    const payload = JSON.parse(readFileSync(resultPath, 'utf8')) as
      | UpgradeWorkerSuccess
      | UpgradeWorkerFailure
    if (!payload.ok) throw new UniverfileSQLiteError(payload.code, payload.message)
    return payload.outcome
  } finally {
    if (existsSync(resultPath)) unlinkSync(resultPath)
  }
}

function workerScriptPath(): string {
  const self = thisModulePath()
  const sibling = join(dirname(self), 'upgrade-worker.cjs')
  return existsSync(sibling) ? sibling : self
}

/**
 * Path of the running bundle.
 *
 * ESM keeps `import.meta.url`. The Gateway's CJS bundle leaves it empty, so the process entry is
 * the bundle itself: `gateway.cjs` while serving, `upgrade-worker.cjs` inside the helper.
 */
function thisModulePath(): string {
  try {
    const url = import.meta.url
    if (typeof url === 'string' && url.length > 0) return realpathSync(fileURLToPath(url))
  } catch {
    // CJS output does not provide import.meta.url.
  }
  const entry = process.argv[1]
  if (entry === undefined || entry.length === 0) {
    throw new UniverfileSQLiteError('UPGRADE_FAILED', 'upgrade helper cannot locate its script')
  }
  return realpathSync(entry)
}

/** Entry point for the helper process. The parent replaces the original after this process exits. */
export function runUpgradeWorker(): void {
  const filename = process.env[UPGRADE_PATH_ENV]
  const resultPath = process.env[UPGRADE_RESULT_ENV]
  if (filename === undefined || filename.length === 0 || resultPath === undefined) {
    process.stderr.write('upgrade helper is missing its path or result file\n')
    process.exit(1)
  }
  try {
    const outcome = upgradeInProcess(filename, { assumeLocked: true, deferReplace: true })
    const payload: UpgradeWorkerSuccess = { ok: true, outcome }
    writeFileSync(resultPath, JSON.stringify(payload))
    process.exit(0)
  } catch (error) {
    const payload: UpgradeWorkerFailure = {
      ok: false,
      code: error instanceof UniverfileSQLiteError ? error.code : 'UPGRADE_FAILED',
      message: error instanceof Error ? error.message : String(error)
    }
    writeFileSync(resultPath, JSON.stringify(payload))
    process.exit(1)
  }
}

function replaceCandidate(candidatePath: string, filename: string): void {
  let last: unknown
  for (const delayMs of REPLACE_RETRY_MS) {
    if (delayMs > 0) Atomics.wait(WAIT_BUFFER, 0, 0, delayMs)
    try {
      renameSync(candidatePath, filename)
      return
    } catch (error) {
      last = error
      if (!isSharingViolation(error)) throw error
    }
  }
  throw last
}

function isSharingViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ((error as { readonly code?: unknown }).code === 'EPERM' ||
      (error as { readonly code?: unknown }).code === 'EBUSY' ||
      (error as { readonly code?: unknown }).code === 'EACCES')
  )
}

function isUpgradeWorkerProcess(): boolean {
  if (process.env[UPGRADE_WORKER_ENV] !== '1') return false
  const entry = process.argv[1]
  if (entry === undefined) return false
  try {
    return realpathSync(entry) === thisModulePath()
  } catch {
    return false
  }
}

/** Returns the number of merging Worktrees normalized back to ready. */
function migrateCandidate(
  candidatePath: string,
  sourceFormat: UniverfileUpgradeSourceFormat
): number {
  const connection = new UniverfileSQLiteConnection({ filename: candidatePath })
  try {
    let normalizedMergingWorktrees = 0
    if (sourceFormat === 'v0') {
      const result = migrateV0CandidateToV3(connection)
      if (result.status !== 'migrated') throw new Error('v0 reader did not migrate the candidate')
      normalizeChangesetCreateTimes(connection.database)
    } else {
      if (sourceFormat === 'v1') normalizedMergingWorktrees = migrateV1CandidateToV2(connection)
      migrateV2CandidateToV3(connection)
    }
    new UniverfileSQLiteAssetStore({ connection })
    new UniverfileSQLiteHistoryDatabaseAdapter({ connection })
    if (sourceFormat !== 'v2') migrateLegacyBaseContentToV2(connection.database)
    pruneCandidateToCurrentSchema(connection.database)
    return normalizedMergingWorktrees
  } finally {
    connection.dispose()
  }
}

if (isUpgradeWorkerProcess()) runUpgradeWorker()
