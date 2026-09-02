/** Probe one Gateway origin and return whether its Viewer endpoint is healthy. */
export async function gatewayIsHealthy(origin: string, timeoutMs: number): Promise<boolean> {
  try {
    const response = await fetch(`${origin}/`, { signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return false
    const html = await response.text()
    return html.includes('<title>Univer</title>') && html.includes('<div id="app"></div>')
  } catch (error) {
    if (error instanceof Error) return false
    return false
  }
}

/** Return the first healthy Gateway origin from the configured ports. */
export async function probeGateway(
  ports: readonly number[],
  timeoutMs: number
): Promise<string | null> {
  for (const port of ports) {
    const origin = `http://127.0.0.1:${String(port)}`
    if (await gatewayIsHealthy(origin, timeoutMs)) return origin
  }
  return null
}
