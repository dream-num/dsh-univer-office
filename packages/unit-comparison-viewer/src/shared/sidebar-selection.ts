const INTERACTIVE_DIFF_SIDEBAR_SELECTOR =
  "button,input,summary,a,select,textarea,[role='button'],[role='tab']"

/** Empty sidebar chrome clears the transient comparison focus without changing diff data. */
export function shouldClearDiffSidebarSelection(target: EventTarget | null): boolean {
  return (
    typeof Element !== 'undefined' &&
    target instanceof Element &&
    target.closest(INTERACTIVE_DIFF_SIDEBAR_SELECTOR) === null
  )
}
