import basesHistoryUI from "@univerjs-pro/bases-history-ui/locale/es-ES";
import boardsHistoryUI from "@univerjs-pro/boards-history-ui/locale/es-ES";
import collaborationClient from "@univerjs-pro/collaboration-client/locale/es-ES";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/es-ES";
import docsHistoryUI from "@univerjs-pro/docs-history-ui/locale/es-ES";
import editHistoryUI from "@univerjs-pro/edit-history-ui/locale/es-ES";
import exchangeClient from "@univerjs-pro/exchange-client/locale/es-ES";
import sheetsHistoryUI from "@univerjs-pro/sheets-history-ui/locale/es-ES";
import slidesHistoryUI from "@univerjs-pro/slides-history-ui/locale/es-ES";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("es-ES");
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
