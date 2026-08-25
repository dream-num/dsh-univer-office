import { Menu } from "@base-ui/react/menu";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils";

export const MenuRoot = Menu.Root;
export const MenuTrigger = Menu.Trigger;

interface MenuContentProps {
  children: ReactNode;
  className?: string;
  sideOffset?: number;
}

/** Dropdown menu content anchored above its trigger (settings popover). */
export function MenuContent({ children, className, sideOffset = 6 }: MenuContentProps) {
  return (
    <Menu.Portal>
      <Menu.Positioner side="top" align="start" sideOffset={sideOffset} className="z-50">
        <Menu.Popup
          data-slot="menu"
          className={cn(
            "settings-menu min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md",
            className
          )}
        >
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

export function MenuItem({ className, ...props }: Menu.Item.Props) {
  return (
    <Menu.Item
      data-slot="menu-item"
      className={cn(
        "settings-opt flex w-full cursor-pointer items-center justify-between gap-6 rounded-md px-2 py-1.5 text-left text-[13px] outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        className
      )}
      {...props}
    />
  );
}
