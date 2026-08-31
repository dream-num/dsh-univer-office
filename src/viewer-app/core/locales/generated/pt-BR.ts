import basesHistoryUI from "@univerjs-pro/bases-history-ui/locale/pt-BR";
import boardsHistoryUI from "@univerjs-pro/boards-history-ui/locale/pt-BR";
import collaborationClient from "@univerjs-pro/collaboration-client/locale/pt-BR";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/pt-BR";
import docsHistoryUI from "@univerjs-pro/docs-history-ui/locale/pt-BR";
import editHistoryUI from "@univerjs-pro/edit-history-ui/locale/pt-BR";
import exchangeClient from "@univerjs-pro/exchange-client/locale/pt-BR";
import sheetsHistoryUI from "@univerjs-pro/sheets-history-ui/locale/pt-BR";
import slidesHistoryUI from "@univerjs-pro/slides-history-ui/locale/pt-BR";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("pt-BR");
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
