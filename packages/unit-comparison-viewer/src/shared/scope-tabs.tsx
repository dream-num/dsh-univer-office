import type { ReactElement } from 'react'
import { cn } from '../ui/cn.js'

export type ComparisonPageTabStatus = 'delete' | 'insert' | 'update'

export interface ComparisonPageTabOption {
  readonly id: string
  readonly label: string
  readonly status: ComparisonPageTabStatus
}

export function ComparisonPageTabs(input: {
  readonly activeId: string | null
  readonly ariaLabel: string
  readonly options: readonly ComparisonPageTabOption[]
  readonly testId?: string
  readonly onSelect: (id: string) => void
}): ReactElement {
  return (
    <div className="grid min-h-10 min-w-0 items-end border-b border-border bg-muted/45 px-2 pt-1.5">
      <div
        className="flex min-w-0 items-end gap-0.5 overflow-x-auto"
        role="tablist"
        aria-label={input.ariaLabel}
      >
        {input.options.map((option) => {
          const active = input.activeId === option.id
          return (
            <button
              key={option.id}
              aria-selected={active}
              className={cn(
                'relative -mb-px h-8 min-w-[76px] max-w-[184px] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-t-[6px] rounded-b-none border border-b-0 border-border bg-muted/70 px-3 text-left text-[11px] font-semibold leading-none text-muted-foreground outline-none transition-[background,border-color,color,box-shadow]',
                'hover:bg-card/80 hover:text-foreground focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/25',
                option.status === 'insert' && 'border-diff-insert/45 text-diff-insert',
                option.status === 'delete' && 'border-diff-delete/45 text-diff-delete',
                option.status === 'update' && 'border-diff-update/45 text-diff-update',
                active &&
                  'z-[1] h-[33px] border-border bg-card text-foreground shadow-[inset_0_2px_0_var(--comparison-tab-accent)]',
                active &&
                  option.status === 'insert' &&
                  '[--comparison-tab-accent:var(--color-diff-insert)]',
                active &&
                  option.status === 'delete' &&
                  '[--comparison-tab-accent:var(--color-diff-delete)]',
                active &&
                  option.status === 'update' &&
                  '[--comparison-tab-accent:var(--color-diff-update)]'
              )}
              data-testid={input.testId}
              role="tab"
              type="button"
              onClick={() => input.onSelect(option.id)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
