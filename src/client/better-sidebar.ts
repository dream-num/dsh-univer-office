import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'

/**
 * The optional `dsh-better-sidebar` client surface this plugin consumes.
 *
 * `dsh-better-sidebar` stays an OPTIONAL host plugin, so this plugin does not
 * depend on it: a dependency would pull the sidebar's whole peer tree into
 * every consumer's install, and the only seam used here is the file-viewer
 * registration. The consumed shape is therefore declared structurally and
 * resolved at runtime — the same erasure `legacySlots` in `index.tsx` applies
 * to host surfaces the installed slot types do not declare.
 *
 * A host without the plugin simply never provides `ctx.betterSidebar`; the
 * registration below is then skipped and every other Univer surface is
 * unaffected. Because the shape is structural, keep it in step with the
 * published `FileViewerDescriptor` contract when the sidebar changes it.
 */

/** Props the sidebar passes to one registered file viewer. */
export interface BetterSidebarFileViewerProps {
  readonly ctx: ClientContext
  /** The owning tab's session scope; `sessionId` is the wire session id string. */
  readonly scope: { readonly sessionId: string; readonly cwd?: string }
  readonly path: string
  readonly title: string
  readonly viewerId: string
}

/** One file-previewer registration. */
export interface BetterSidebarFileViewerDescriptor {
  /** Unique id; `'univer'` is reserved for viewers the sidebar itself ships. */
  readonly id: string
  readonly title?: string
  /** Lowercase extensions without a leading dot; `[]` would be a catch-all. */
  readonly exts: readonly string[]
  /** Higher wins; the sidebar's own viewers register at 0 and its catch-all at -100. */
  readonly priority?: number
  /**
   * The viewer renders from Host state (the authorized Viewer URL), so the
   * sidebar must not read the file's bytes. This is load-bearing rather than a
   * micro-optimization: `.univer` is a binary container, and a byte-reading
   * strategy would route it to the generic download pane instead of this viewer.
   */
  readonly fetchStrategy: 'none'
  readonly component: (props: BetterSidebarFileViewerProps) => ReactNode
}

/** The registry service `dsh-better-sidebar` publishes on the client context. */
export interface BetterSidebarService {
  registerFileViewer(descriptor: BetterSidebarFileViewerDescriptor): () => void
}

/** The sidebar service, or undefined on a host that does not mount the plugin. */
export function betterSidebarOf(ctx: ClientContext): BetterSidebarService | undefined {
  return ctx.get('betterSidebar') as BetterSidebarService | undefined
}
