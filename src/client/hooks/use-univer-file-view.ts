import * as React from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { FileState } from '../../shared/wire/state.ts'
import { useGatewayStatus, useUniverStates } from './use-univer-state.ts'

/** What the on-demand `.univer` file viewer should render right now. */
export type UniverFileView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly state: FileState }
  /** The Host confirmed this session's workspace holds no `.univer` file at the path. */
  | { readonly kind: 'missing' }
  /** No Viewer target can be projected because the Gateway is down; it may be started. */
  | { readonly kind: 'gateway'; readonly start: () => Promise<void> }

/**
 * Resolve one `.univer` path to a renderable state.
 *
 * Reuses the shared Turn-preview poll (the same 900 ms cadence the review cards
 * use), so a file opened while an agent is editing it keeps following the
 * Host's authoritative worktree state instead of freezing at open time. The
 * Gateway phase is added on top because `useUniverStates` deliberately swallows
 * non-missing failures: without it a stopped Gateway would be indistinguishable
 * from a slow first load, and the user would get no way to start it.
 */
export function useUniverFileView(file: string, sessionId: SessionId): UniverFileView {
  const { states, missingFiles } = useUniverStates([file], sessionId)
  const gateway = useGatewayStatus()
  const state = states[file]
  const missing = missingFiles.has(file)
  const phase = gateway.phase
  const start = gateway.start
  return React.useMemo(() => {
    if (state !== undefined) return { kind: 'ready', state }
    if (missing) return { kind: 'missing' }
    if (phase === 'stopped' || phase === 'failed') return { kind: 'gateway', start }
    return { kind: 'loading' }
  }, [state, missing, phase, start])
}
