import type { MenuSchemaType } from '@univerjs/ui'
import { RibbonStartGroup } from '@univerjs/ui'
import {
  ExportDocOperation,
  ImportDocOperation
} from '../commands/operations/exchange.operation.js'
import {
  DOCS_EXCHANGE_OPERATION_ID,
  DocsExchangeMenuItemFactory,
  ExportDocMenuItemFactory,
  ImportDocMenuItemFactory
} from '../controllers/menu.js'

export const menuSchema: MenuSchemaType = {
  [RibbonStartGroup.OTHERS]: {
    [DOCS_EXCHANGE_OPERATION_ID]: {
      order: 0.3,
      gridLayout: { row: 1, column: 2, rowSpan: 2, showLabel: true },
      menuItemFactory: DocsExchangeMenuItemFactory,
      [ImportDocOperation.id]: {
        order: 0,
        menuItemFactory: ImportDocMenuItemFactory
      },
      [ExportDocOperation.id]: {
        order: 1,
        menuItemFactory: ExportDocMenuItemFactory
      }
    }
  }
}
