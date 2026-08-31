import basesHistoryUI from "@univerjs-pro/bases-history-ui/locale/de-DE";
import boardsHistoryUI from "@univerjs-pro/boards-history-ui/locale/de-DE";
import collaborationClient from "@univerjs-pro/collaboration-client/locale/de-DE";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/de-DE";
import docsHistoryUI from "@univerjs-pro/docs-history-ui/locale/de-DE";
import editHistoryUI from "@univerjs-pro/edit-history-ui/locale/de-DE";
import exchangeClient from "@univerjs-pro/exchange-client/locale/de-DE";
import sheetsHistoryUI from "@univerjs-pro/sheets-history-ui/locale/de-DE";
import slidesHistoryUI from "@univerjs-pro/slides-history-ui/locale/de-DE";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("de-DE");
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
