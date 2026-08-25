import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

/**
 * shadcn alert-dialog layout over Base UI Dialog: centered card, dimmed backdrop,
 * Escape / outside press dismiss, focus managed by the primitive.
 */
export function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 animate-fade-in bg-black/40" />
        <Dialog.Popup
          data-slot="dialog-content"
          className={cn(
            "fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto",
            "animate-zoom-in rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-lg"
          )}
        >
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function AlertDialogTitle({ className, ...props }: Dialog.Title.Props) {
  return (
    <Dialog.Title className={cn("text-[15px] leading-6 font-semibold", className)} {...props} />
  );
}

export function AlertDialogBody({ html, className }: { html: string; className?: string }) {
  return (
    <Dialog.Description
      className={cn(
        "mt-3 text-sm leading-relaxed text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground [&_.muted]:text-muted-foreground/70",
        className
      )}
      render={<p dangerouslySetInnerHTML={{ __html: html }} />}
    />
  );
}
