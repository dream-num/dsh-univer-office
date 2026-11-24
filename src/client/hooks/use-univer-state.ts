import * as React from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { FileState } from '../../shared/wire/state.ts'
import { getFileState, isMissingUniverFile, UniverApiError } from '../api/univer-api.ts'

export interface FileObservation {
  readonly state?: FileState
  readonly error?: Error
}

/** Report null only for a Host-confirmed missing file. Other failures retry on the next poll. */
export function useUniverStates(
  files: readonly string[],
  sessionId: SessionId,
  onObservation?: (file: string, state: FileState | null) => void
): Readonly<Record<string, FileObservation>> {
  const [cache, setCache] = React.useState<{
    sessionId: SessionId
    files: Readonly<Record<string, FileObservation>>
  }>({ sessionId, files: {} })
  const key = files.join('\u0000')
  React.useEffect(() => {
    const trackedFiles = key === '' ? [] : key.split('\u0000')
    const tracked = new Set(trackedFiles)
    setCache((current) => ({
      sessionId,
      files:
        current.sessionId === sessionId
          ? Object.fromEntries(Object.entries(current.files).filter(([file]) => tracked.has(file)))
          : {}
    }))
    if (trackedFiles.length === 0) return
    const controller = new AbortController()
    let polling = false
    const poll = async (): Promise<void> => {
      if (polling) return
      polling = true
      for (const file of trackedFiles) {
        try {
          const state = await getFileState(file, sessionId, controller.signal)
          if (controller.signal.aborted) return
          onObservation?.(file, state)
          setCache((previous) => ({ sessionId, files: { ...previous.files, [file]: { state } } }))
        } catch (cause) {
          if (controller.signal.aborted) return
          const error = cause instanceof Error ? cause : new Error(String(cause))
          if (isMissingUniverFile(error)) onObservation?.(file, null)
          // Keep a live editor mounted across a transport outage. A rejected file request
          // invalidates the old Viewer URL, even if that file was previously authorized.
          const rejected =
            error instanceof UniverApiError && error.status >= 400 && error.status < 500
          setCache((previous) => ({
            sessionId,
            files: {
              ...previous.files,
              [file]: rejected ? { error } : { ...previous.files[file], error }
            }
          }))
        }
      }
      polling = false
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 900)
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void poll()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [key, sessionId, onObservation])
  return cache.sessionId === sessionId ? cache.files : {}
}
