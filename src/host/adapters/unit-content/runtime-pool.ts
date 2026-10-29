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
  /** Resident worker cap; also the number of operations that run at once. */
  readonly maxEntries: number
  readonly idleTtlMs: number
  /** Bound on opening a worker and on each operation inside it. */
  readonly operationTimeoutMs: number
}

/**
 * Keyed Collaboration Runtime Workers reused across Unit content operations. One key is one
 * Gateway scope and Unit; the Gateway stays the only source of truth, so every use pulls before
 * running and any runtime whose state is no longer clean is destroyed instead of reused.
 */
export class UnitContentRuntimePool {
  private readonly pool: UniverCollaborationRuntimePool<RuntimeInit>
  private readonly slots: Slots
  private readonly targets = new Map<string, UnitContentWorkerTarget>()
  /** Keys with a live runtime; eviction never cold-creates one just to destroy it. */
  private readonly resident = new Set<string>()
  private readonly cleanups = new Set<Promise<void>>()
  private gatewayOrigin: string | undefined

  constructor(private readonly options: UnitContentRuntimePoolOptions) {
    this.slots = new Slots(options.maxEntries)
    this.pool = createUniverCollaborationRuntimePool<RuntimeInit>({
      entry: COLLABORATION_RUNTIME_WORKER_ENTRY,
      env: unitContentWorkerEnvironment(),
      openTimeoutMs: options.operationTimeoutMs,
      operationTimeoutMs: options.operationTimeoutMs,
      cache: { idleTtlMs: options.idleTtlMs, maxEntries: options.maxEntries },
      onEvent: (event) => {
        if (event.type === 'create-complete') this.resident.add(event.key)
        if (event.type === 'destroy-start') {
          this.resident.delete(event.key)
          this.targets.delete(event.key)
        }
      }
    })
  }

  /** Run one operation on a current runtime for `target`. */
  async use<T>(
    target: UnitContentWorkerTarget,
    signal: AbortSignal | undefined,
    run: (session: UnitContentSession) => Promise<T>
  ): Promise<T> {
    signal?.throwIfAborted()
    this.followGateway(target.gatewayOrigin)
    await this.slots.acquire(signal)
    const key = runtimeKey(target)
    try {
      this.targets.set(key, target)
      const init = runtimeInit(target)
      let lease = await this.acquire(key, init, signal)
      try {
        await this.abortable(lease, signal, () => pullUnitContent(lease))
      } catch (error) {
        signal?.throwIfAborted()
        // A cached runtime cannot pull across a history restore or a replaced file; reload once.
        await lease.invalidate()
        lease = await this.acquire(key, init, signal)
        await this.abortable(lease, signal, () => pullUnitContent(lease)).catch(
          async (retryError: unknown) => {
            await lease.invalidate()
            throw retryError ?? error
          }
        )
      }
      try {
        const result = await this.abortable(lease, signal, () => run(lease))
        await lease.release()
        return result
      } catch (error) {
        if (signal?.aborted === true) {
          void this.track(lease.invalidate())
        } else if (await isClean(lease)) {
          await lease.release()
        } else {
          await lease.invalidate()
        }
        throw error
      }
    } catch (error) {
      if (!this.resident.has(key)) this.targets.delete(key)
      throw toUniverError(error, this.options.operationTimeoutMs)
    } finally {
      // The pool stops counting a destroyed runtime at once, so the slot is free even while
      // a cancelled worker is still being killed.
      this.slots.release()
    }
  }

  /** Destroy the runtimes of a worktree that was merged or discarded. */
  invalidateWorktree(filePath: string, worktreeId: string): Promise<void> {
    return this.evict((target) => target.filePath === filePath && target.worktreeId === worktreeId)
  }

  /** Destroy the runtime of a Unit removed from a worktree. */
  invalidateUnit(filePath: string, worktreeId: string, unitId: string): Promise<void> {
    return this.evict(
      (target) =>
        target.filePath === filePath && target.worktreeId === worktreeId && target.unitId === unitId
    )
  }

  /** Close every pooled worker. */
  async close(): Promise<void> {
    this.targets.clear()
    this.resident.clear()
    await this.pool.close()
    await Promise.allSettled(this.cleanups)
  }

  /** Drop runtimes that still talk to a Gateway this Host no longer uses. */
  private followGateway(origin: string): void {
    if (this.gatewayOrigin === origin) return
    const previous = this.gatewayOrigin
    this.gatewayOrigin = origin
    if (previous !== undefined) {
      void this.track(this.evict((target) => target.gatewayOrigin !== origin))
    }
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

  private async evict(matches: (target: UnitContentWorkerTarget) => boolean): Promise<void> {
    const selected = [...this.targets].filter(
      ([key, target]) => this.resident.has(key) && matches(target)
    )
    // Acquire in the same tick as the residency check so no selected runtime is recreated.
    await Promise.all(
      selected.map(async ([key, target]) => {
        try {
          const lease = await this.pool.acquire({ key, init: runtimeInit(target) })
          await lease.invalidate()
        } catch {
          // Eviction only frees memory; a later use pulls and reloads on its own.
        }
      })
    )
  }

  private track(cleanup: Promise<void>): Promise<void> {
    const settled = cleanup.catch(() => undefined)
    this.cleanups.add(settled)
    void settled.finally(() => this.cleanups.delete(settled))
    return settled
  }
}

/** A runtime is reusable after a failure only when nothing local is left to commit. */
async function isClean(lease: UniverCollaborationRuntimeLease): Promise<boolean> {
  try {
    const state = await lease.getState()
    return (
      state.connection !== 'closed' &&
      state.conflict === null &&
      state.awaitingChangeset === null &&
      state.pendingMutationCount === 0
    )
  } catch {
    return false
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

/** Counting semaphore whose waiters can be cancelled. */
class Slots {
  private available: number
  private readonly waiters: Array<() => void> = []

  constructor(size: number) {
    this.available = size
  }

  async acquire(signal: AbortSignal | undefined): Promise<void> {
    signal?.throwIfAborted()
    if (this.available > 0) {
      this.available -= 1
      return
    }
    await new Promise<void>((resolve, reject) => {
      const grant = (): void => {
        signal?.removeEventListener('abort', abort)
        resolve()
      }
      const abort = (): void => {
        const index = this.waiters.indexOf(grant)
        if (index >= 0) this.waiters.splice(index, 1)
        reject(signal?.reason)
      }
      this.waiters.push(grant)
      signal?.addEventListener('abort', abort, { once: true })
    })
  }

  release(): void {
    const next = this.waiters.shift()
    if (next === undefined) this.available += 1
    else next()
  }
}
