import basesHistoryUI from "@univerjs-pro/bases-history-ui/locale/zh-HK";
import boardsHistoryUI from "@univerjs-pro/boards-history-ui/locale/zh-HK";
import collaborationClient from "@univerjs-pro/collaboration-client/locale/zh-HK";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/zh-HK";
import docsHistoryUI from "@univerjs-pro/docs-history-ui/locale/zh-HK";
import editHistoryUI from "@univerjs-pro/edit-history-ui/locale/zh-HK";
import exchangeClient from "@univerjs-pro/exchange-client/locale/zh-HK";
import sheetsHistoryUI from "@univerjs-pro/sheets-history-ui/locale/zh-HK";
import slidesHistoryUI from "@univerjs-pro/slides-history-ui/locale/zh-HK";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("zh-HK");
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
