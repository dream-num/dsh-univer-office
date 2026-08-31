import basesHistoryUI from "@univerjs-pro/bases-history-ui/locale/en-US";
import boardsHistoryUI from "@univerjs-pro/boards-history-ui/locale/en-US";
import collaborationClient from "@univerjs-pro/collaboration-client/locale/en-US";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/en-US";
import docsHistoryUI from "@univerjs-pro/docs-history-ui/locale/en-US";
import editHistoryUI from "@univerjs-pro/edit-history-ui/locale/en-US";
import exchangeClient from "@univerjs-pro/exchange-client/locale/en-US";
import sheetsHistoryUI from "@univerjs-pro/sheets-history-ui/locale/en-US";
import slidesHistoryUI from "@univerjs-pro/slides-history-ui/locale/en-US";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("en-US");
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
