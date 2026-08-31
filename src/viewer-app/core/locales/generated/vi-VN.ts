import basesHistoryUI from "@univerjs-pro/bases-history-ui/locale/vi-VN";
import boardsHistoryUI from "@univerjs-pro/boards-history-ui/locale/vi-VN";
import collaborationClient from "@univerjs-pro/collaboration-client/locale/vi-VN";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/vi-VN";
import docsHistoryUI from "@univerjs-pro/docs-history-ui/locale/vi-VN";
import editHistoryUI from "@univerjs-pro/edit-history-ui/locale/vi-VN";
import exchangeClient from "@univerjs-pro/exchange-client/locale/vi-VN";
import sheetsHistoryUI from "@univerjs-pro/sheets-history-ui/locale/vi-VN";
import slidesHistoryUI from "@univerjs-pro/slides-history-ui/locale/vi-VN";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("vi-VN");
  return mergeLocalePacks([
    content,
    collaborationClient,
    collaborationClientUI,
    exchangeClient,
    editHistoryUI,
    sheetsHistoryUI,
    docsHistoryUI,
    slidesHistoryUI,
    basesHistoryUI,
    boardsHistoryUI
  ]);
}
