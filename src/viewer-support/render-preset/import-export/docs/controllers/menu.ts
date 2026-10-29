import type { IAccessor } from '@univerjs/core'
import type { IMenuButtonItem, IMenuSelectorItem } from '@univerjs/ui'
import type { LocaleKey } from '../locale/types.js'
import { UniverInstanceType } from '@univerjs/core'
import { getMenuHiddenObservable, MenuItemType } from '@univerjs/ui'
import {
  ExportDocOperation,
  ImportDocOperation
} from '../commands/operations/exchange.operation.js'

export const DOCS_EXCHANGE_OPERATION_ID = 'custom-docs-import-export.operation.exchange'

export function DocsExchangeMenuItemFactory(accessor: IAccessor): IMenuSelectorItem<LocaleKey> {
  return {
    id: DOCS_EXCHANGE_OPERATION_ID,
    type: MenuItemType.SUBITEMS,
    icon: 'DirectExportIcon',
    tooltip: 'custom-docs-import-export.file',
    hidden$: getMenuHiddenObservable(accessor, UniverInstanceType.UNIVER_DOC)
    // disabled$: TODO@Dushusir permission
  }
}

export function ImportDocMenuItemFactory(): IMenuButtonItem<LocaleKey> {
  return {
    id: ImportDocOperation.id,
    type: MenuItemType.BUTTON,
    title: 'custom-docs-import-export.upload',
    icon: 'FolderIcon'
  }
}

export function ExportDocMenuItemFactory(): IMenuButtonItem<LocaleKey> {
  return {
    id: ExportDocOperation.id,
    type: MenuItemType.BUTTON,
    title: 'custom-docs-import-export.download',
    icon: 'ExportIcon'
  }
}
