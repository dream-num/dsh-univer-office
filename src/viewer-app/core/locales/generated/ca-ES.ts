import basesHistoryUI from "@univerjs-pro/bases-history-ui/locale/ca-ES";
import boardsHistoryUI from "@univerjs-pro/boards-history-ui/locale/ca-ES";
import collaborationClient from "@univerjs-pro/collaboration-client/locale/ca-ES";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/ca-ES";
import docsHistoryUI from "@univerjs-pro/docs-history-ui/locale/ca-ES";
import editHistoryUI from "@univerjs-pro/edit-history-ui/locale/ca-ES";
import exchangeClient from "@univerjs-pro/exchange-client/locale/ca-ES";
import sheetsHistoryUI from "@univerjs-pro/sheets-history-ui/locale/ca-ES";
import slidesHistoryUI from "@univerjs-pro/slides-history-ui/locale/ca-ES";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("ca-ES");
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
