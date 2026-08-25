import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const changeTagVariants = cva(
  "inline-flex shrink-0 items-center rounded px-1.5 py-px text-[11px] leading-4 font-medium",
  {
    variants: {
      variant: {
        modified: "bg-blue-50 text-blue-600",
        added: "bg-emerald-50 text-emerald-700",
        deleted: "bg-red-50 text-red-600",
        conflict: "bg-red-100 text-red-700 ring-1 ring-red-200 ring-inset",
        updated: "bg-neutral-100 text-neutral-500"
      }
    }
  }
);

export interface ChangeTagProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof changeTagVariants> {}

export function ChangeTag({ className, variant, ...props }: ChangeTagProps) {
  return (
    <span
      data-slot="change-tag"
      className={cn(changeTagVariants({ variant }), className)}
      {...props}
    />
  );
}
