import basesHistoryUI from "@univerjs-pro/bases-history-ui/locale/zh-TW";
import boardsHistoryUI from "@univerjs-pro/boards-history-ui/locale/zh-TW";
import collaborationClient from "@univerjs-pro/collaboration-client/locale/zh-TW";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/zh-TW";
import docsHistoryUI from "@univerjs-pro/docs-history-ui/locale/zh-TW";
import editHistoryUI from "@univerjs-pro/edit-history-ui/locale/zh-TW";
import exchangeClient from "@univerjs-pro/exchange-client/locale/zh-TW";
import sheetsHistoryUI from "@univerjs-pro/sheets-history-ui/locale/zh-TW";
import slidesHistoryUI from "@univerjs-pro/slides-history-ui/locale/zh-TW";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("zh-TW");
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
