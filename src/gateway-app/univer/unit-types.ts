import type { IBoardData } from "@univerjs-pro/boards";
import { getBoardsEmptySnapshot } from "@univerjs-pro/boards";
import type { IBaseSnapshot, IDocumentData, IWorkbookData } from "@univerjs/core";
import {
  DocumentFlavor,
  getBasesEmptySnapshot,
  getDocsEmptySnapshot,
  getSheetsEmptySnapshot,
  LocaleType,
  mergeWorksheetSnapshotWithDefault,
} from "@univerjs/core";
import type { ISlideData } from "@univerjs-pro/slides";
import { getEmptySnapshot } from "@univerjs-pro/slides";
import {
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SHEET,
  UNIT_TYPE_SLIDE,
  type UnitType,
} from "../contract";

const DEFAULT_SHEET_ID = "sheet-1";
const DEFAULT_ROW_COUNT = 1000;
const DEFAULT_COLUMN_COUNT = 26;

/**
 * The gateway only supplies initial engine data and the legacy sheet-order response field.
 * Snapshot conversion, materialization, OT and persistence belong to the collaboration SDK.
 */
export interface UnitTypeAdapter {
  readonly type: UnitType;
  defaultData(unitId: string, name: string): object;
  sheetOrder(data: object): string[] | undefined;
}

function defaultWorkbookData(unitId: string, name: string): IWorkbookData {
  const workbook = getSheetsEmptySnapshot(unitId, LocaleType.EN_US, name);
  return {
    ...workbook,
    sheetOrder: [DEFAULT_SHEET_ID],
    sheets: {
      [DEFAULT_SHEET_ID]: mergeWorksheetSnapshotWithDefault({
        id: DEFAULT_SHEET_ID,
        name: "Sheet1",
        rowCount: DEFAULT_ROW_COUNT,
        columnCount: DEFAULT_COLUMN_COUNT,
      }),
    },
  };
}

function defaultDocumentData(unitId: string, name: string): IDocumentData {
  return getDocsEmptySnapshot(unitId, LocaleType.EN_US, name, DocumentFlavor.MODERN);
}

const UNIT_ADAPTER_ENTRIES: ReadonlyArray<readonly [UnitType, UnitTypeAdapter]> = [
  [
    UNIT_TYPE_SHEET,
    {
      type: UNIT_TYPE_SHEET,
      defaultData: defaultWorkbookData,
      sheetOrder: (data) => (data as IWorkbookData).sheetOrder,
    },
  ],
  [
    UNIT_TYPE_DOC,
    {
      type: UNIT_TYPE_DOC,
      defaultData: defaultDocumentData,
      sheetOrder: () => undefined,
    },
  ],
  [
    UNIT_TYPE_SLIDE,
    {
      type: UNIT_TYPE_SLIDE,
      defaultData: (unitId, name) => getEmptySnapshot(unitId, LocaleType.EN_US, name) as ISlideData,
      sheetOrder: () => undefined,
    },
  ],
  [
    UNIT_TYPE_BASE,
    {
      type: UNIT_TYPE_BASE,
      defaultData: (unitId, name) => getBasesEmptySnapshot(unitId, name) as IBaseSnapshot,
      sheetOrder: () => undefined,
    },
  ],
  [
    UNIT_TYPE_BOARD,
    {
      type: UNIT_TYPE_BOARD,
      defaultData: (unitId, name) => getBoardsEmptySnapshot(unitId, name) as IBoardData,
      sheetOrder: () => undefined,
    },
  ],
];

const UNIT_ADAPTERS: ReadonlyMap<UnitType, UnitTypeAdapter> = new Map(UNIT_ADAPTER_ENTRIES);

export function unitAdapter(type: number): UnitTypeAdapter {
  const adapter = UNIT_ADAPTERS.get(type as UnitType);
  if (adapter === undefined) {
    throw new Error(
      `unsupported unit type ${type} (supported: doc=1, sheet=2, slide=3, base=5, board=6)`,
    );
  }
  return adapter;
}
