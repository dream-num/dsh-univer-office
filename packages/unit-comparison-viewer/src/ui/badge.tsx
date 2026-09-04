import type { HTMLAttributes, ReactElement } from 'react'
import { cn } from './cn.js'

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-neutral-50 px-2 py-0.5 text-xs font-medium text-neutral-600 ring-1 ring-inset ring-neutral-600/15',
        className
      )}
      {...props}
    />
  )
}
