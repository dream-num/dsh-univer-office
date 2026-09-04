import { LoaderCircle } from 'lucide-react'
import { cn } from '../../lib/utils'

export function Spinner({ className }: { className?: string }) {
  return (
    <output
      aria-label="loading"
      data-slot="spinner"
      className={cn('inline-flex size-7', className)}
    >
      <LoaderCircle aria-hidden="true" className="size-full animate-spin text-foreground/60" />
    </output>
  )
}
