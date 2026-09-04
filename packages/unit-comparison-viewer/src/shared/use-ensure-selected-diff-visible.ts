import { useEffect, useRef, type RefObject } from 'react'

const SELECTED_DIFF_SELECTOR = '[data-diff-sidebar-selected="true"]'

/** Keeps the selected diff entry visible without moving a sidebar that already shows it. */
export function useEnsureSelectedDiffVisible<T extends HTMLElement>(
  selectedItemId: string | null | undefined
): RefObject<T> {
  const containerRef = useRef<T>(null)

  useEffect(() => {
    const container = containerRef.current
    if (container === null || selectedItemId == null) return
    const selected = container.querySelector<HTMLElement>(SELECTED_DIFF_SELECTOR)
    if (selected === null || isFullyVisibleWithin(selected, container)) return
    selected.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [selectedItemId])

  return containerRef
}

function isFullyVisibleWithin(element: HTMLElement, container: HTMLElement): boolean {
  const elementRect = element.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  return (
    elementRect.top >= containerRect.top &&
    elementRect.bottom <= containerRect.bottom &&
    elementRect.left >= containerRect.left &&
    elementRect.right <= containerRect.right
  )
}
