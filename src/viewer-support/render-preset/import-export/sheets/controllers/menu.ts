import type { IAccessor } from '@univerjs/core'
import type { IMenuButtonItem, IMenuSelectorItem } from '@univerjs/ui'
import { UniverInstanceType } from '@univerjs/core'
import { WorkbookExportPermission } from '@univerjs/sheets'
import { getCurrentRangeDisable$ } from '@univerjs/sheets-ui'
import { getMenuHiddenObservable, MenuItemType } from '@univerjs/ui'
import type { LocaleKey } from '../locale/types.js'
import {
  ExportSheetOperation,
  ImportSheetOperation
} from '../commands/operations/exchange.operation.js'

export const SHEETS_EXCHANGE_OPERATION_ID = 'custom-import-export.operation.exchange'

export function SheetsExchangeMenuItemFactory(accessor: IAccessor): IMenuSelectorItem<LocaleKey> {
  return {
    id: SHEETS_EXCHANGE_OPERATION_ID,
    type: MenuItemType.SUBITEMS,
    icon: 'DirectExportIcon',
    tooltip: 'custom-import-export.file',
    hidden$: getMenuHiddenObservable(accessor, UniverInstanceType.UNIVER_SHEET),
    disabled$: getCurrentRangeDisable$(accessor, {
      workbookTypes: [WorkbookExportPermission]
    })
  }
}

export function ImportSheetMenuItemFactory(): IMenuButtonItem<LocaleKey> {
  return {
    id: ImportSheetOperation.id,
    type: MenuItemType.BUTTON,
    title: 'custom-import-export.upload',
    icon: 'FolderIcon'
  }
}

export function ExportSheetMenuItemFactory(): IMenuButtonItem<LocaleKey> {
  return {
    id: ExportSheetOperation.id,
    type: MenuItemType.BUTTON,
    title: 'custom-import-export.download',
    icon: 'ExportIcon'
  }
}
