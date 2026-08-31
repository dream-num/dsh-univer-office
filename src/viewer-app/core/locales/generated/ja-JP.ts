import basesHistoryUI from "@univerjs-pro/bases-history-ui/locale/ja-JP";
import boardsHistoryUI from "@univerjs-pro/boards-history-ui/locale/ja-JP";
import collaborationClient from "@univerjs-pro/collaboration-client/locale/ja-JP";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/ja-JP";
import docsHistoryUI from "@univerjs-pro/docs-history-ui/locale/ja-JP";
import editHistoryUI from "@univerjs-pro/edit-history-ui/locale/ja-JP";
import exchangeClient from "@univerjs-pro/exchange-client/locale/ja-JP";
import sheetsHistoryUI from "@univerjs-pro/sheets-history-ui/locale/ja-JP";
import slidesHistoryUI from "@univerjs-pro/slides-history-ui/locale/ja-JP";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("ja-JP");
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
