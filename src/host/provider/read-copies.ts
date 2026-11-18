import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { GatewayClient } from '../adapters/gateway/client.ts'
import { isRecord } from '../adapters/gateway/mapping.ts'
import { UniverError } from '../service/errors.ts'
import { univerFilePath, type UniverFilePath } from '../service/identifiers.ts'

/** The Gateway owns the SQLite handles. The Host holds each copy until its last reader settles. */
export class GatewayReadCopies {
  private readonly stopping = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()

  constructor(private readonly timeoutMs: number) {}

  async use<T>(
    openGateway: () => Promise<string>,
    original: UniverFilePath,
    signal: AbortSignal | undefined,
    read: (file: UniverFilePath, signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const lifetime =
      signal === undefined ? this.stopping.signal : AbortSignal.any([this.stopping.signal, signal])
    lifetime.throwIfAborted()
    const operation = this.readCopy(openGateway, original, lifetime, read)
    this.pending.add(operation)
    try {
      return await operation
    } finally {
      this.pending.delete(operation)
    }
  }

  async close(): Promise<void> {
    this.stopping.abort()
    await Promise.allSettled(this.pending)
  }

  private async readCopy<T>(
    openGateway: () => Promise<string>,
    original: UniverFilePath,
    signal: AbortSignal,
    read: (file: UniverFilePath, signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const client = new GatewayClient(await openGateway(), this.timeoutMs)
    signal.throwIfAborted()
    const route = `/read-copy/${randomUUID()}`
    try {
      const copy = await client.post(`${route}/open`, { file: original })
      if (
        !isRecord(copy) ||
        typeof copy.file !== 'string' ||
        !isAbsolute(copy.file) ||
        !copy.file.endsWith('.univer') ||
        copy.file === original
      ) {
        throw new UniverError('Gateway returned an invalid read copy.', 'GATEWAY_INVALID_RESPONSE')
      }
      signal.throwIfAborted()
      return await read(univerFilePath(copy.file), signal)
    } finally {
      // The caller may have cancelled while /open was in flight. Release by the caller-owned ID.
      await client.post(`${route}/close`)
    }
  }
}
