import basesHistoryUI from "@univerjs-pro/bases-history-ui/locale/fr-FR";
import boardsHistoryUI from "@univerjs-pro/boards-history-ui/locale/fr-FR";
import collaborationClient from "@univerjs-pro/collaboration-client/locale/fr-FR";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/fr-FR";
import docsHistoryUI from "@univerjs-pro/docs-history-ui/locale/fr-FR";
import editHistoryUI from "@univerjs-pro/edit-history-ui/locale/fr-FR";
import exchangeClient from "@univerjs-pro/exchange-client/locale/fr-FR";
import sheetsHistoryUI from "@univerjs-pro/sheets-history-ui/locale/fr-FR";
import slidesHistoryUI from "@univerjs-pro/slides-history-ui/locale/fr-FR";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("fr-FR");
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
