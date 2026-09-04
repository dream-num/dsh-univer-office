import { LoaderCircle } from 'lucide-react'
import type { ReactElement } from 'react'
import { cn } from './cn.js'

export function Spinner({ className }: { readonly className?: string }): ReactElement {
  return (
    <output aria-label="loading" className={cn('inline-flex size-7', className)}>
      <LoaderCircle aria-hidden="true" className="size-full animate-spin text-foreground/60" />
    </output>
  )
}
