import basesHistoryUI from "@univerjs-pro/bases-history-ui/locale/ru-RU";
import boardsHistoryUI from "@univerjs-pro/boards-history-ui/locale/ru-RU";
import collaborationClient from "@univerjs-pro/collaboration-client/locale/ru-RU";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/ru-RU";
import docsHistoryUI from "@univerjs-pro/docs-history-ui/locale/ru-RU";
import editHistoryUI from "@univerjs-pro/edit-history-ui/locale/ru-RU";
import exchangeClient from "@univerjs-pro/exchange-client/locale/ru-RU";
import sheetsHistoryUI from "@univerjs-pro/sheets-history-ui/locale/ru-RU";
import slidesHistoryUI from "@univerjs-pro/slides-history-ui/locale/ru-RU";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("ru-RU");
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
