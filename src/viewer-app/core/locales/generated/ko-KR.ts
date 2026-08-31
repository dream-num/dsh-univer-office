import basesHistoryUI from "@univerjs-pro/bases-history-ui/locale/ko-KR";
import boardsHistoryUI from "@univerjs-pro/boards-history-ui/locale/ko-KR";
import collaborationClient from "@univerjs-pro/collaboration-client/locale/ko-KR";
import collaborationClientUI from "@univerjs-pro/collaboration-client-ui/locale/ko-KR";
import docsHistoryUI from "@univerjs-pro/docs-history-ui/locale/ko-KR";
import editHistoryUI from "@univerjs-pro/edit-history-ui/locale/ko-KR";
import exchangeClient from "@univerjs-pro/exchange-client/locale/ko-KR";
import sheetsHistoryUI from "@univerjs-pro/sheets-history-ui/locale/ko-KR";
import slidesHistoryUI from "@univerjs-pro/slides-history-ui/locale/ko-KR";
import { loadContentLocale, mergeLocalePacks } from "@univer/render-preset";
import type { ILanguagePack } from "@univerjs/core";

export default async function loadLocale(): Promise<ILanguagePack> {
  const content = await loadContentLocale("ko-KR");
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
