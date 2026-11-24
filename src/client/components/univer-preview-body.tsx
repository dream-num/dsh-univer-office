import * as React from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { useUniverStates } from '../hooks/use-univer-state.ts'
import { useUniverLocale } from '../hooks/use-univer-locale.ts'
import { localizeViewerUrl } from '../viewer-locale.ts'
import { PreviewNotice } from './preview-notice.tsx'

/**
 * The on-demand `.univer` preview body, shared by every entry point that opens
 * one — the native right Sidebar and the optional dsh-better-sidebar file
 * viewer. Each entry point resolves this file's path and session by its own
 * route and hands them over; everything below that is identical, so the
 * loading, missing and Gateway states and the Viewer target are shared.
 * The full Viewer owns navigation between trunk and worktrees.
 */
export function UniverPreviewBody(props: {
  readonly ctx: ClientContext
  readonly path: string
  readonly sessionId: string
  readonly title: string
  /** The entry point that opened this preview, for diagnostics. */
  readonly surface: string
}): React.ReactElement {
  const { t, viewerLocale } = useUniverLocale(props.ctx)
  // Entry points hand over the wire session id; branding it is this plugin's
  // client-side boundary conversion (the brand has no runtime representation).
  const observation = useUniverStates([props.path], props.sessionId as SessionId)[props.path]
  const target = observation?.state?.viewerUrl ?? undefined
  const url = target === undefined ? undefined : localizeViewerUrl(target, viewerLocale)

  return (
    <div className="uvf_fileView" data-surface={props.surface}>
      <div className="uvf_viewerShell">
        {url === undefined ? (
          <div className="uvf_note">
            <PreviewNotice
              t={t}
              error={observation?.error}
              gatewayStopped={observation?.state?.gatewayRunning === false}
              loading={observation?.state === undefined}
            />
          </div>
        ) : (
          <iframe className="uvf_frame" src={url} title={props.title} />
        )}
      </div>
    </div>
  )
}
