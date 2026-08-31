import basesHistoryUI from "@univerjs-pro/bases-history-ui/locale/it-IT";
import boardsHistoryUI from "@univerjs-pro/boards-history-ui/locale/it-IT";
import collaborationClient from "@univerjs-pro/collaboration-client/locale/it-IT";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/it-IT";
import docsHistoryUI from "@univerjs-pro/docs-history-ui/locale/it-IT";
import editHistoryUI from "@univerjs-pro/edit-history-ui/locale/it-IT";
import exchangeClient from "@univerjs-pro/exchange-client/locale/it-IT";
import sheetsHistoryUI from "@univerjs-pro/sheets-history-ui/locale/it-IT";
import slidesHistoryUI from "@univerjs-pro/slides-history-ui/locale/it-IT";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("it-IT");
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
