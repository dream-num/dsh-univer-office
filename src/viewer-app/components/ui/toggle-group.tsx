import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { cn } from "../../lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedToggleProps<T extends string> {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}

/** shadcn tabs-list style segmented control over Base UI ToggleGroup + Toggle. */
export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  className
}: SegmentedToggleProps<T>) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(groupValue) => {
        const next = groupValue[0] as T | undefined;
        if (next !== undefined && next !== value) {
          onChange(next);
        }
      }}
      data-slot="toggle-group"
      className={cn("inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5", className)}
    >
      {options.map((opt) => (
        <Toggle
          key={opt.value}
          value={opt.value}
          aria-label={opt.label}
          data-slot="toggle-group-item"
          className={cn(
            "cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[pressed]:bg-background data-[pressed]:text-foreground data-[pressed]:shadow-xs"
          )}
        >
          {opt.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
