import type { IAccessor } from '@univerjs/core'
import type { IMenuButtonItem, IMenuSelectorItem } from '@univerjs/ui'
import type { LocaleKey } from '../locale/types.js'
import { UniverInstanceType } from '@univerjs/core'
import { getMenuHiddenObservable, MenuItemType } from '@univerjs/ui'
import {
  ExportSlideOperation,
  ImportSlideOperation
} from '../commands/operations/exchange.operation.js'

export const SLIDES_EXCHANGE_OPERATION_ID = 'custom-slides-import-export.operation.exchange'

export function SlidesExchangeMenuItemFactory(accessor: IAccessor): IMenuSelectorItem<LocaleKey> {
  return {
    id: SLIDES_EXCHANGE_OPERATION_ID,
    type: MenuItemType.SUBITEMS,
    icon: 'DirectExportIcon',
    tooltip: 'custom-slides-import-export.file',
    hidden$: getMenuHiddenObservable(accessor, UniverInstanceType.UNIVER_SLIDE)
  }
}

export function ImportSlideMenuItemFactory(): IMenuButtonItem<LocaleKey> {
  return {
    id: ImportSlideOperation.id,
    type: MenuItemType.BUTTON,
    title: 'custom-slides-import-export.upload',
    icon: 'FolderIcon'
  }
}

export function ExportSlideMenuItemFactory(): IMenuButtonItem<LocaleKey> {
  return {
    id: ExportSlideOperation.id,
    type: MenuItemType.BUTTON,
    title: 'custom-slides-import-export.download',
    icon: 'ExportIcon'
  }
}
