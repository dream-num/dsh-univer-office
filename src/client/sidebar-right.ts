import type { Context as ClientContext } from '@deepseek-ai/cordis'

/**
 * The DSH right-Sidebar surface this plugin consumes: the native tab-type
 * registry and the tab-body seat.
 *
 * These are DSH core services, but they ship no type declarations this package
 * can depend on, so — exactly like the optional `betterSidebar` surface in
 * `better-sidebar.ts` — the consumed shape is declared structurally and
 * resolved at runtime. Keep it in step with
 * `@deepseek-ai/dsh-client-ui-sidebar-right`'s registry contract.
 *
 * A host without the right Sidebar simply never provides `sidebarRightTabs`;
 * the registration is then skipped and every other Univer surface is
 * unaffected.
 */

/** Where one tab type sits in the address-claiming order. */
export type SidebarTabPriority = 'extension' | 'builtin' | 'fallback'

/** One right-Sidebar tab type. */
export interface SidebarRightTabDefinition {
  /** Unique implementation id; also the key this type's body registers under. */
  readonly id: string
  /** Tab kind; one kind carries at most one builtin and one extension registration. */
  readonly kind: string
  /**
   * Globs on `dsh-resource://` addresses. A pattern containing `:` matches the
   * whole address; one without matches the URI path at any depth,
   * case-insensitively.
   */
  readonly patterns?: readonly string[]
  /** Higher wins: `extension` > `builtin` > `fallback`; then the matched pattern length. */
  readonly priority?: SidebarTabPriority
  /** Veto one claim after a pattern matched. */
  readonly canOpen?: (address: string) => boolean
  /** The tab chip's text, captured when the tab opens. */
  readonly title: (address: string) => string
}

/** The registry service published as `ctx.sidebarRightTabs`. */
export interface SidebarRightTabsService {
  register(definition: SidebarRightTabDefinition): () => void
}

/** What the seat hands a tab body besides its own injected face. */
export interface SidebarRightTabBodyInjected {
  readonly ctx: ClientContext
  /**
   * Seat-provided hook reading the tab this body was mounted for. Only
   * `tab.contentId` is consumed: it is the resource address, and therefore
   * this plugin's only route to the file and session behind the tab.
   */
  readonly useTabInfo: () => { readonly tab: { readonly contentId: string } }
}

/** The tab-type registry, or undefined on a host without the right Sidebar. */
export function sidebarRightTabsOf(ctx: ClientContext): SidebarRightTabsService | undefined {
  return ctx.get('sidebarRightTabs') as SidebarRightTabsService | undefined
}
