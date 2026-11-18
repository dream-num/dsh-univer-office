import { once } from 'node:events'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { GatewayReadCopies } from '../../src/host/provider/read-copies.ts'
import { univerFilePath } from '../../src/host/service/identifiers.ts'
import { closeServer, listen } from '../support/net.ts'

it('cancels readers and waits for the Gateway to release each copy before disposal (#146)', async () => {
  const source = univerFilePath(join(import.meta.dirname, 'source.univer'))
  const copy = join(import.meta.dirname, 'snapshot.univer')
  const calls: string[] = []
  const server = createServer((request, response) => {
    calls.push(request.url!)
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(request.url?.endsWith('/open') ? { file: copy } : { ok: true }))
  })
  const origin = `http://127.0.0.1:${await listen(server)}`
  const copies = new GatewayReadCopies(5000)
  const reading = new AbortController()
  try {
    const entered = once(reading.signal, 'abort')
    const operation = copies.use(
      async () => origin,
      source,
      undefined,
      async (file, signal) => {
        expect(file).toBe(copy)
        reading.abort()
        await once(signal, 'abort')
        signal.throwIfAborted()
      }
    )
    const cancelled = expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    await entered
    await copies.close()
    await cancelled
    expect(calls).toHaveLength(2)
    expect(calls[1]).toBe(calls[0]?.replace('/open', '/close'))
    await expect(
      copies.use(
        async () => origin,
        source,
        undefined,
        async () => undefined
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(calls).toHaveLength(2)
  } finally {
    await copies.close()
    await closeServer(server)
  }
})
