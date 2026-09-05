import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils.ts'

interface ResponsiveWorktreeHeaderProps {
  title: ReactNode
  view: ReactNode
  preview?: ReactNode
  actions: ReactNode
}

/** Application slots share one wrapping flow once symmetric columns no longer fit. */
export function ResponsiveWorktreeHeader({
  title,
  view,
  preview,
  actions
}: ResponsiveWorktreeHeaderProps): ReactElement {
  const headerRef = useRef<HTMLElement>(null)
  const [layout, setLayout] = useState<'measure' | 'centered' | 'flow'>('measure')
  const [titleMinimum, setTitleMinimum] = useState(0)
  const flow = layout === 'flow'

  useLayoutEffect(() => {
    const header = headerRef.current!
    let width = header.clientWidth
    let active = true
    setLayout('measure')
    const observer = new ResizeObserver(() => {
      if (width !== header.clientWidth) {
        width = header.clientWidth
        setLayout('measure')
      }
    })
    observer.observe(header)
    void document.fonts?.ready.then(() => {
      if (active) setLayout('measure')
      return undefined
    })
    return () => {
      active = false
      observer.disconnect()
    }
  }, [title, view, preview, actions])

  useLayoutEffect(() => {
    if (layout !== 'measure') return
    const header = headerRef.current!
    const style = getComputedStyle(header)
    const center = header.querySelector<HTMLElement>('[data-header-view]')!
    const right = header.querySelector<HTMLElement>('[data-header-trailing]')!
    const titleRow = header.querySelector<HTMLElement>('[data-header-title-row]')!
    const name = header.querySelector<HTMLElement>('[data-header-name]')!
    const nameWidth = name.getBoundingClientRect().width
    // Only the filename may shrink; icon, badge, and leading controls retain their space.
    const minimum = Math.ceil(
      titleRow.getBoundingClientRect().width -
        nameWidth +
        Math.min(nameWidth, parseFloat(getComputedStyle(name).flexBasis))
    )
    setTitleMinimum(minimum)
    const available =
      header.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    const required =
      center.getBoundingClientRect().width +
      2 * Math.max(minimum, right.scrollWidth) +
      2 * parseFloat(style.columnGap)
    // Both measurement and final attributes are rendered by React before paint.
    setLayout(available >= required ? 'centered' : 'flow')
  }, [layout])

  return (
    <header
      ref={headerRef}
      data-header-layout={layout}
      style={{ '--header-title-min': `${titleMinimum}px` } as CSSProperties}
      className={cn(
        'topbar relative min-h-11 min-w-0 shrink-0 items-center gap-x-3 gap-y-1.5 border-b border-border bg-background px-4 py-1.5',
        flow
          ? 'flex flex-wrap'
          : 'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] [&_[data-slot=toggle-group-item]]:whitespace-nowrap',
        layout === 'measure' &&
          '[&_[data-header-title-row]]:w-max [&_[data-header-title-row]]:max-w-none [&_[data-header-title-row]]:shrink-0'
      )}
    >
      <div
        data-testid="worktree-title"
        className={cn(
          'min-w-0',
          flow && 'min-w-[min(var(--header-title-min),100%)] flex-[1_1_var(--header-title-min)]'
        )}
      >
        {title}
      </div>
      <div
        data-header-view
        data-testid="view-diff-center"
        className={cn(
          'flex-none',
          flow ? 'max-w-full min-w-[min(174px,100%)]' : 'w-max min-w-[174px]'
        )}
      >
        {view}
      </div>
      <div
        data-header-trailing
        className={flow ? 'contents' : 'flex w-max items-center gap-3 justify-self-end'}
      >
        {preview && (
          <div
            data-header-preview
            className={cn(
              'flex-none',
              flow ? 'max-w-full min-w-[min(236px,100%)]' : 'min-w-[236px]'
            )}
          >
            {preview}
          </div>
        )}
        <div
          data-testid="worktree-actions"
          className={cn(
            'flex min-w-0 flex-none items-center justify-end gap-2 empty:hidden',
            flow ? 'ml-auto max-w-full flex-wrap' : 'flex-nowrap'
          )}
        >
          {actions}
        </div>
      </div>
    </header>
  )
}
