import * as React from 'react'
import { getUniverStatus, startGateway } from '../api/univer-api.ts'

type GatewayCheck =
  | { phase: 'checking' | 'running' | 'starting' | 'stopped' }
  | { phase: 'failed' | 'unknown'; reason: string }

/** Mounted only while a preview is waiting for the Gateway. A manual action supersedes a pending check. */
export function useGatewayStatus() {
  const [status, setStatus] = React.useState<GatewayCheck>({ phase: 'checking' })
  const [request, setRequest] = React.useState<{ start: boolean }>({ start: false })
  React.useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined
    let startFailure: string | undefined
    const check = async (start: boolean): Promise<void> => {
      try {
        let next: GatewayCheck
        if (start) {
          const result = await startGateway(controller.signal)
          if (!result.ok) startFailure = result.reason
          next = result.ok ? { phase: 'running' } : { phase: 'failed', reason: result.reason }
        } else {
          const { gateway } = await getUniverStatus(controller.signal)
          if (gateway.phase === 'running') startFailure = undefined
          next =
            gateway.phase === 'failed' ||
            (gateway.phase === 'stopped' && startFailure !== undefined)
              ? { phase: 'failed', reason: startFailure ?? gateway.reason ?? '' }
              : { phase: gateway.phase }
        }
        if (!controller.signal.aborted) setStatus(next)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        if (start) startFailure = reason
        if (!controller.signal.aborted) setStatus({ phase: start ? 'failed' : 'unknown', reason })
      }
      if (!controller.signal.aborted) timer = window.setTimeout(() => void check(false), 2000)
    }
    void check(request.start)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [request])
  return {
    status,
    retry(start: boolean) {
      setStatus({ phase: start ? 'starting' : 'checking' })
      setRequest({ start })
    }
  }
}
