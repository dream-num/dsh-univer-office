import type { MenuSchemaType } from '@univerjs/ui'
import { RibbonStartGroup } from '@univerjs/ui'
import {
  ExportSlideOperation,
  ImportSlideOperation
} from '../commands/operations/exchange.operation.js'
import {
  ExportSlideMenuItemFactory,
  ImportSlideMenuItemFactory,
  SLIDES_EXCHANGE_OPERATION_ID,
  SlidesExchangeMenuItemFactory
} from '../controllers/menu.js'

export const menuSchema: MenuSchemaType = {
  [RibbonStartGroup.OTHERS]: {
    [SLIDES_EXCHANGE_OPERATION_ID]: {
      order: 0.3,
      gridLayout: { row: 1, column: 3, rowSpan: 2, showLabel: true },
      menuItemFactory: SlidesExchangeMenuItemFactory,
      [ImportSlideOperation.id]: {
        order: 0,
        menuItemFactory: ImportSlideMenuItemFactory
      },
      [ExportSlideOperation.id]: {
        order: 1,
        menuItemFactory: ExportSlideMenuItemFactory
      }
    }
  }
}
