import basesHistoryUI from "@univerjs-pro/bases-history-ui/locale/id-ID";
import boardsHistoryUI from "@univerjs-pro/boards-history-ui/locale/id-ID";
import collaborationClient from "@univerjs-pro/collaboration-client/locale/id-ID";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/id-ID";
import docsHistoryUI from "@univerjs-pro/docs-history-ui/locale/id-ID";
import editHistoryUI from "@univerjs-pro/edit-history-ui/locale/id-ID";
import exchangeClient from "@univerjs-pro/exchange-client/locale/id-ID";
import sheetsHistoryUI from "@univerjs-pro/sheets-history-ui/locale/id-ID";
import slidesHistoryUI from "@univerjs-pro/slides-history-ui/locale/id-ID";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("id-ID");
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
