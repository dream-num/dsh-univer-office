import basesHistoryUI from "@univerjs-pro/bases-history-ui/locale/sk-SK";
import boardsHistoryUI from "@univerjs-pro/boards-history-ui/locale/sk-SK";
import collaborationClient from "@univerjs-pro/collaboration-client/locale/sk-SK";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/sk-SK";
import docsHistoryUI from "@univerjs-pro/docs-history-ui/locale/sk-SK";
import editHistoryUI from "@univerjs-pro/edit-history-ui/locale/sk-SK";
import exchangeClient from "@univerjs-pro/exchange-client/locale/sk-SK";
import sheetsHistoryUI from "@univerjs-pro/sheets-history-ui/locale/sk-SK";
import slidesHistoryUI from "@univerjs-pro/slides-history-ui/locale/sk-SK";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("sk-SK");
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
