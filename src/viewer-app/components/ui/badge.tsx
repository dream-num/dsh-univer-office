import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1 rounded-full font-medium ring-1 ring-inset [&_svg]:size-3 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        neutral: 'bg-neutral-50 text-neutral-600 ring-neutral-600/15',
        info: 'bg-blue-50 text-blue-700 ring-blue-600/20',
        warn: 'bg-amber-50 text-amber-700 ring-amber-600/25',
        ok: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
        danger: 'bg-red-50 text-red-700 ring-red-600/20',
        outline: 'bg-background text-muted-foreground ring-neutral-300'
      },
      size: {
        default: 'px-2 py-0.5 text-xs',
        sm: 'px-1.5 py-0 text-[11px] leading-4.5'
      }
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'default'
    }
  }
)

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}
