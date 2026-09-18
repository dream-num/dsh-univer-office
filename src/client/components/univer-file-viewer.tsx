import * as React from 'react'
import type { BetterSidebarFileViewerProps } from '../better-sidebar.ts'
import { UniverPreviewBody } from './univer-preview-body.tsx'

/** Viewer id of the on-demand `.univer` preview registered with dsh-better-sidebar. */
export const UNIVER_FILE_VIEWER_ID = 'univer-office:univer'

/**
 * The `dsh-better-sidebar` file viewer for `.univer`.
 *
 * This entry point is only reached while that optional plugin is installed: its
 * editor tab type claims file addresses at the same `extension` tier with a
 * longer pattern, so it wins the claim and routes the address through its own
 * file-viewer registry. Hosts without it use the native right-Sidebar tab type
 * in `univer-sidebar-tab.tsx` instead.
 */
export function UniverFileViewer(props: BetterSidebarFileViewerProps): React.ReactElement {
  return (
    <UniverPreviewBody
      ctx={props.ctx}
      path={props.path}
      sessionId={props.scope.sessionId}
      title={props.title}
      surface="better-sidebar"
    />
  )
}
