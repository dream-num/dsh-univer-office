import * as React from 'react'
import { fileAddressBasename, parseFileAddress } from '../resource-address.ts'
import type { SidebarRightTabBodyInjected } from '../sidebar-right.ts'
import { UniverPreviewBody } from './univer-preview-body.tsx'

/**
 * The native DSH right-Sidebar tab type's id. It is also the key this type's
 * body registers under, and it must stay unique across every tab type in the
 * composition.
 */
export const UNIVER_SIDEBAR_TAB_ID = 'dsh-univer-office'

/**
 * The tab kind `.univer` addresses open as. A kind carries at most one builtin
 * and one extension registration, so it is this plugin's own rather than a
 * takeover of the document preview's `text`.
 */
export const UNIVER_SIDEBAR_TAB_KIND = 'univer'

/**
 * The native right-Sidebar body for one `.univer` tab: what a click on the file
 * in DSH's own file tree opens, with no agent write involved.
 *
 * The address is the only handle the seat gives a body, and it carries both the
 * session and the path, so it is also the whole resolution this surface needs.
 */
export function UniverSidebarTabBody(
  props: SidebarRightTabBodyInjected
): React.ReactElement | null {
  const { tab } = props.useTabInfo()
  const address = parseFileAddress(tab.contentId)
  // Only a session-scoped address can be authorized by the Host state route;
  // the type's `canOpen` refuses the others, so this is a guard, not a branch.
  if (address === undefined || address.scope !== 'session') return null
  return (
    <UniverPreviewBody
      ctx={props.ctx}
      path={address.path}
      sessionId={address.sessionId}
      title={fileAddressBasename(tab.contentId)}
      surface="sidebar-right"
    />
  )
}
