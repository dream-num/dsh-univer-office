import {
  createUniverCollaborationRuntimePool,
  type UniverCollaborationRuntimeLease,
  type UniverCollaborationRuntimePool
} from '@univer-cli/univer-collaboration-runtime-pool'
import { COLLABORATION_RUNTIME_WORKER_ENTRY } from '../../artifacts/paths.ts'
import { UniverError } from '../../service/errors.ts'
import { pullUnitContent, type UnitContentSession } from '../../../shared/unit-content-session.ts'
import type { UnitContentWorkerTarget } from './protocol.ts'
import { unitContentWorkerEnvironment } from './worker.ts'

/** Initialization each pooled worker validates before binding its Unit. */
type RuntimeInit = Omit<UnitContentWorkerTarget, 'filePath'>

/** Limits for the pooled Collaboration Runtime Workers. */
export interface UnitContentRuntimePoolOptions {
  readonly maxEntries: number
  readonly idleTtlMs: number
  /** Bound on opening a worker and on each operation inside it. */
  readonly operationTimeoutMs: number
}

/**
 * Keyed Collaboration Runtime Workers reused across Unit content operations. One key is one
 * Gateway scope and Unit; the Gateway stays the only source of truth, so every use pulls before
 * running and any failed use destroys its runtime instead of reusing it.
 */
export class UnitContentRuntimePool {
  private readonly pool: UniverCollaborationRuntimePool<RuntimeInit>
  private readonly cleanups = new Set<Promise<void>>()

  constructor(private readonly options: UnitContentRuntimePoolOptions) {
    this.pool = createUniverCollaborationRuntimePool<RuntimeInit>({
      entry: COLLABORATION_RUNTIME_WORKER_ENTRY,
      env: unitContentWorkerEnvironment(),
      openTimeoutMs: options.operationTimeoutMs,
      operationTimeoutMs: options.operationTimeoutMs,
      cache: { idleTtlMs: options.idleTtlMs, maxEntries: options.maxEntries }
    })
  }

  /** Run one operation on a current runtime for `target`. */
  async use<T>(
    target: UnitContentWorkerTarget,
    signal: AbortSignal | undefined,
    run: (session: UnitContentSession) => Promise<T>
  ): Promise<T> {
    try {
      const lease = await this.acquire(runtimeKey(target), runtimeInit(target), signal)
      try {
        const result = await this.abortable(lease, signal, async () => {
          await pullUnitContent(lease)
          return await run(lease)
        })
        await lease.release()
        return result
      } catch (error) {
        if (signal?.aborted === true) void this.track(lease.invalidate())
        else await lease.invalidate()
        throw error
      }
    } catch (error) {
      throw toUniverError(error, this.options.operationTimeoutMs)
    }
  }

  /** Close every pooled worker. */
  async close(): Promise<void> {
    await this.pool.close()
    await Promise.allSettled(this.cleanups)
  }

  private async acquire(
    key: string,
    init: RuntimeInit,
    signal: AbortSignal | undefined
  ): Promise<UniverCollaborationRuntimeLease> {
    const acquiring = this.pool.acquire({ key, init })
    if (signal === undefined) return acquiring
    signal.throwIfAborted()
    let onAbort: (() => void) | undefined
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => {
        this.track(acquiring.then((lease) => lease.invalidate()).catch(() => undefined))
        reject(signal.reason)
      }
      signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      return await Promise.race([acquiring, aborted])
    } finally {
      if (onAbort !== undefined) signal.removeEventListener('abort', onAbort)
    }
  }

  /** Race `operation` with cancellation; cancelling kills the worker that runs it. */
  private async abortable<T>(
    lease: UniverCollaborationRuntimeLease,
    signal: AbortSignal | undefined,
    operation: () => Promise<T>
  ): Promise<T> {
    if (signal === undefined) return operation()
    signal.throwIfAborted()
    const running = operation()
    let onAbort: (() => void) | undefined
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => {
        running.catch(() => undefined)
        this.track(lease.invalidate())
        reject(signal.reason)
      }
      signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      return await Promise.race([running, aborted])
    } finally {
      if (onAbort !== undefined) signal.removeEventListener('abort', onAbort)
    }
  }

  private track(cleanup: Promise<void>): Promise<void> {
    const settled = cleanup.catch(() => undefined)
    this.cleanups.add(settled)
    void settled.finally(() => this.cleanups.delete(settled))
    return settled
  }
}

function runtimeKey(target: UnitContentWorkerTarget): string {
  return JSON.stringify([
    target.gatewayOrigin,
    target.filePath,
    target.worktreeId ?? null,
    target.unitId,
    target.unitType
  ])
}

function runtimeInit(target: UnitContentWorkerTarget): RuntimeInit {
  return {
    gatewayOrigin: target.gatewayOrigin,
    commitTimeoutMs: target.commitTimeoutMs,
    fileKey: target.fileKey,
    unitId: target.unitId,
    unitType: target.unitType,
    ...(target.worktreeId === undefined ? {} : { worktreeId: target.worktreeId })
  }
}

function toUniverError(error: unknown, timeoutMs: number): unknown {
  if (error instanceof UniverError) return error
  if (!(error instanceof Error)) return error
  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined
  if (
    code === 'COLLABORATION_WORKER_OPEN_TIMEOUT' ||
    code === 'COLLABORATION_WORKER_OPERATION_TIMEOUT'
  ) {
    return new UniverError(
      `Unit content operation timed out after ${String(timeoutMs)}ms.`,
      'UNIT_CONTENT_WORKER_TIMEOUT',
      { cause: error }
    )
  }
  if (error.name === 'AbortError' || code === undefined) return error
  return new UniverError(error.message, code, { cause: error })
}
