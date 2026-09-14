import type { ILogger, JsonObject } from '@univerjs-pro/collaboration-service'

const debugEnabled = process.env.UNIVER_DSH_GATEWAY_DEBUG === '1'

function write(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  fields?: Readonly<JsonObject>
): void {
  if ((level === 'debug' || level === 'info') && !debugEnabled) return
  const suffix = fields === undefined ? '' : ` ${JSON.stringify(fields)}`
  process.stderr.write(`[univer-collab] ${level}: ${message}${suffix}\n`)
}

/**
 * SDK collaboration services report operation failures only through the injected
 * ILogger; without one, an internal failure surfaces to clients as a bare
 * `Collaboration Service failed` 500 with no diagnostic trail.
 */
export function createSdkCollabLogger(): ILogger {
  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields)
  }
}
