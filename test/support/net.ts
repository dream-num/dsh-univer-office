import { createServer as createHttpServer, type Server as HttpServer } from 'node:http'
import { createServer as createNetServer, type Server } from 'node:net'

/** Listen on loopback; port 0 asks the OS for a dynamic port. Resolves the bound port. */
export async function listen(server: Server | HttpServer, port = 0): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('server has no TCP port')
  return address.port
}

export async function closeServer(server: Server | HttpServer): Promise<void> {
  if (!server.listening) return
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error)))
  )
}

/** A port that was free a moment ago; the Gateway binds it after this returns. */
export async function freePort(): Promise<number> {
  const server = createNetServer()
  const port = await listen(server)
  await closeServer(server)
  return port
}

/**
 * Occupy one dynamic port with a foreign HTTP service whose successor is free, so a test can
 * prove the Gateway skips an occupied port without touching it.
 */
export async function occupyPortWithFreeSuccessor(): Promise<{
  foreign: HttpServer
  occupiedPort: number
  availablePort: number
}> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const foreign = createHttpServer((_request, response) => response.end('not a Univer Gateway'))
    const occupiedPort = await listen(foreign)
    if (occupiedPort === 65_535) {
      await closeServer(foreign)
      continue
    }
    const successor = createNetServer()
    try {
      await listen(successor, occupiedPort + 1)
      await closeServer(successor)
      return { foreign, occupiedPort, availablePort: occupiedPort + 1 }
    } catch {
      // Another process owns the immediate successor; retry with a fresh dynamic pair.
      await closeServer(foreign)
    }
  }
  throw new Error('failed to reserve adjacent dynamic Gateway ports')
}

/** Listen on a fixed port, or report that another process already owns it. */
export async function listenOrAcceptOccupied(server: HttpServer, port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') resolve(false)
      else reject(error)
    })
    server.listen(port, '127.0.0.1', () => resolve(true))
  })
}

export async function postJson(url: string, body: unknown): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok) throw new Error(`POST ${url} failed: ${await response.text()}`)
  return response.json()
}
