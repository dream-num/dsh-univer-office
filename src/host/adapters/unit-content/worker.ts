import { spawn } from 'node:child_process'
import { delimiter } from 'node:path'
import { PLUGIN_NODE_MODULES, UNIT_CONTENT_WORKER_ENTRY } from '../../artifacts/paths.ts'
import { UniverError } from '../../service/errors.ts'
import type { JsonValue } from '../../service/types.ts'
import { parseUnitContentWorkerEnvelope, type UnitContentWorkerRequest } from './protocol.ts'

/** Invoke one isolated package-local Unit content operation. */
export class UnitContentWorker {
  constructor(private readonly timeoutMs: number) {}

  /** Run one request and return its JSON result. */
  async run(request: UnitContentWorkerRequest, signal?: AbortSignal): Promise<JsonValue> {
    signal?.throwIfAborted()
    const child = spawn(process.execPath, [UNIT_CONTENT_WORKER_ENTRY], {
      env: unitContentWorkerEnvironment(),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))

    const completed = new Promise<void>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', () => resolve())
    })
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill()
    }, this.timeoutMs)
    const abort = (): void => {
      child.kill()
    }
    signal?.addEventListener('abort', abort, { once: true })
    child.stdin.end(JSON.stringify(request))
    try {
      await completed
      signal?.throwIfAborted()
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }
    if (timedOut) {
      throw new UniverError(`Unit content operation timed out after ${String(this.timeoutMs)}ms.`, 'UNIT_CONTENT_WORKER_TIMEOUT')
    }

    let envelope: ReturnType<typeof parseUnitContentWorkerEnvelope>
    try {
      envelope = parseUnitContentWorkerEnvelope(JSON.parse(Buffer.concat(stdout).toString('utf8')) as unknown)
    } catch (error) {
      throw new UniverError(workerDiagnostic(stderr, 'Unit content worker returned invalid JSON.'), 'UNIT_CONTENT_WORKER_INVALID_RESPONSE', { cause: error })
    }
    if (envelope === null) {
      throw new UniverError(workerDiagnostic(stderr, 'Unit content worker returned an invalid response.'), 'UNIT_CONTENT_WORKER_INVALID_RESPONSE')
    }
    if (!envelope.ok) throw new UniverError(envelope.error.message, envelope.error.code)
    return envelope.result
  }
}

function workerDiagnostic(stderr: readonly Buffer[], fallback: string): string {
  const diagnostic = Buffer.concat(stderr)
    .toString('utf8')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .trim()
  if (diagnostic.length === 0) return fallback
  const limit = 2_000
  return `${fallback} ${diagnostic.length <= limit ? diagnostic : `${diagnostic.slice(0, limit)}…`}`
}

function unitContentWorkerEnvironment(): NodeJS.ProcessEnv {
  const env = Object.fromEntries(['HOME', 'LANG', 'LC_ALL', 'PATH', 'TMPDIR'].flatMap((key) => {
    const value = process.env[key]
    return value === undefined ? [] : [[key, value]]
  }))
  // Let the worker resolve its native dependencies (@univerjs-pro/engine-formula-
  // rust-binding and platform sub-packages) from this plugin's node_modules.
  env.NODE_PATH = [PLUGIN_NODE_MODULES, process.env.NODE_PATH].filter((value): value is string => value !== undefined && value.length > 0).join(delimiter)
  return env
}
