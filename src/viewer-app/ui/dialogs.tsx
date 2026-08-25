import { CircleCheck, GitMerge, Info, Pencil, Trash2, TriangleAlert } from "lucide-react";
import type { ComponentType, ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { AlertDialog, AlertDialogBody, AlertDialogTitle } from "../components/ui/dialog";
import { t } from "../i18n";
import { cn } from "../lib/utils";

export type DialogTone = "neutral" | "info" | "warn" | "danger";
export type DialogIcon = "merge" | "trash" | "pencil" | "check" | "alert" | "info";

export interface DialogChip {
  id: string;
  label: string;
}

export interface ConfirmOptions {
  title: string;
  /** Trusted i18n HTML (may contain <strong> / <br> / span.muted). */
  body: string;
  chips?: readonly DialogChip[];
  confirmLabel: string;
  danger?: boolean;
  icon?: DialogIcon;
  tone?: DialogTone;
  /** Conflict notice style: a single acknowledgement button instead of cancel+confirm. */
  singleAction?: boolean;
}

const ICONS: Record<DialogIcon, ComponentType> = {
  merge: GitMerge,
  trash: Trash2,
  pencil: Pencil,
  check: CircleCheck,
  alert: TriangleAlert,
  info: Info
};

const TONE_CLASS: Record<DialogTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-blue-50 text-blue-600",
  warn: "bg-amber-50 text-amber-600",
  danger: "bg-red-50 text-red-600"
};

function ConfirmDialog({
  opts,
  onDone
}: {
  opts: ConfirmOptions;
  onDone: (confirmed: boolean) => void;
}): ReactElement {
  const tone = opts.tone ?? (opts.danger ? "danger" : "info");
  const Icon = ICONS[opts.icon ?? (opts.danger ? "trash" : "check")];
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onDone(false);
        }
      }}
    >
      <div className="flex items-start gap-3.5">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-4.5",
            TONE_CLASS[tone]
          )}
        >
          <Icon />
        </span>
        <div className="min-w-0 flex-1">
          <AlertDialogTitle>{opts.title}</AlertDialogTitle>
          <AlertDialogBody html={opts.body} />
          {opts.chips !== undefined && opts.chips.length > 0 && (
            <div className="mt-3 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1">
              {opts.chips.map((chip) => (
                <Badge
                  key={chip.id}
                  variant="neutral"
                  className="max-w-full min-w-0 shrink text-left leading-5 wrap-break-word whitespace-normal"
                >
                  {chip.label}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        {!opts.singleAction && (
          <Button variant="outline" size="sm" onClick={() => onDone(false)}>
            {t().modal.cancel}
          </Button>
        )}
        <Button
          variant={opts.danger ? "destructive" : "default"}
          size="sm"
          onClick={() => onDone(true)}
        >
          {opts.confirmLabel}
        </Button>
      </div>
    </AlertDialog>
  );
}

/** Mount a one-shot modal outside the React shell; resolves on confirm/cancel/dismiss. */
function openConfirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let settled = false;
    const finish = (confirmed: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(confirmed);
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };
    flushSync(() => {
      root.render(<ConfirmDialog opts={opts} onDone={finish} />);
    });
  });
}

/** Modal confirm (merge = neutral, discard = danger). Resolves true on confirm. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return openConfirmDialog(opts);
}

/** Merge-conflict notice in plain language; the modification stays "awaiting confirmation". */
export function conflictDialog(failedUnit: string): Promise<void> {
  return openConfirmDialog({
    icon: "alert",
    tone: "danger",
    title: t().modal.conflictTitle,
    body: t().modal.conflictBody(escapeHtml(failedUnit)),
    confirmLabel: t().modal.gotIt,
    singleAction: true
  }).then(() => undefined);
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!
  );
}
