import type { IAccessor, ICommand } from '@univerjs/core'
import { CommandType, UniverInstanceType } from '@univerjs/core'
import { IExchangeOperateService } from '../../services/operate.service.js'
import { isCurrentUnitLoadedFromServer } from '../../services/utils/collaboration.js'

export const ImportDocOperation: ICommand = {
  id: 'custom-docs-import-export.operation.import-doc',
  type: CommandType.OPERATION,
  handler: async (accessor: IAccessor) => {
    const operateService = accessor.get(IExchangeOperateService)

    if (isCurrentUnitLoadedFromServer(accessor, UniverInstanceType.UNIVER_DOC)) {
      await operateService.importDocToUnitId()
    } else {
      await operateService.importDocToSnapshot()
    }

    return true
  }
}

export const ExportDocOperation: ICommand = {
  id: 'custom-docs-import-export.operation.export-doc',
  type: CommandType.OPERATION,
  handler: async (accessor: IAccessor) => {
    const operateService = accessor.get(IExchangeOperateService)

    if (isCurrentUnitLoadedFromServer(accessor, UniverInstanceType.UNIVER_DOC)) {
      await operateService.exportDocByUnitId()
    } else {
      await operateService.exportDocBySnapshot()
    }

    return true
  }
}
