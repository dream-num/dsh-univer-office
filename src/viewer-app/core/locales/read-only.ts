import type { ILanguagePack } from "@univerjs/core";
import { mergeLocalePacks } from "@univer/render-preset";

export interface ReadOnlyLocaleCopy {
  title: string;
  message: string;
}

const permissionErrorKeys = [
  "alertContent",
  "commonErr",
  "editErr",
  "pasteErr",
  "setStyleErr",
  "copyErr",
  "workbookCopyErr",
  "setRowColStyleErr",
  "moveRowColErr",
  "moveRangeErr",
  "insertRowColErr",
  "removeRowColErr",
  "autoFillErr",
  "filterErr",
  "operatorSheetErr",
  "insertOrDeleteMoveRangeErr",
  "printErr",
  "formulaErr",
  "hyperLinkErr",
  "commentErr"
] as const;

function permissionMessages(message: string): Record<string, string> {
  return Object.fromEntries(permissionErrorKeys.map((key) => [key, message]));
}

/** Override permission copy only in a read-only Viewer; editable files keep native protection text. */
export function withReadOnlyPermissionLocale(
  localePack: ILanguagePack,
  copy: ReadOnlyLocaleCopy
): ILanguagePack {
  const messages = permissionMessages(copy.message);
  return mergeLocalePacks([
    localePack,
    {
      sheets: { permission: { dialog: messages } },
      "sheets-ui": { permission: { dialog: { ...messages, alert: copy.title } } },
      "sheets-drawing-ui": { permission: { dialog: { editErr: copy.message } } }
    }
  ]);
}
