import { LoaderCircle } from "lucide-react";
import { cn } from "../../lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <output aria-label="loading" data-slot="spinner">
      <LoaderCircle
        aria-hidden="true"
        className={cn("size-7 animate-spin text-foreground/60", className)}
      />
    </output>
  );
}
