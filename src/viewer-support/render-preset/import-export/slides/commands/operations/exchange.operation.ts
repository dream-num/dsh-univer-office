import type { SlideModel } from '@univerjs-pro/slides'
import type { IAccessor, ICommand } from '@univerjs/core'
import { SlidePermissionCheckService } from '@univerjs-pro/slides'
import { CommandType, IUniverInstanceService, UniverInstanceType } from '@univerjs/core'
import { UnitAction } from '@univerjs/protocol'
import { IExchangeOperateService } from '../../services/operate.service.js'
import { isCurrentUnitLoadedFromServer } from '../../services/utils/collaboration.js'

export const ImportSlideOperation: ICommand = {
  id: 'custom-slides-import-export.operation.import-slide',
  type: CommandType.OPERATION,
  handler: async (accessor: IAccessor) => {
    const operateService = accessor.get(IExchangeOperateService)

    if (isCurrentUnitLoadedFromServer(accessor, UniverInstanceType.UNIVER_SLIDE)) {
      await operateService.importSlideToUnitId()
    } else {
      await operateService.importSlideToSnapshot()
    }

    return true
  }
}

export const ExportSlideOperation: ICommand = {
  id: 'custom-slides-import-export.operation.export-slide',
  type: CommandType.OPERATION,
  handler: async (accessor: IAccessor) => {
    const slide = accessor
      .get(IUniverInstanceService)
      .getCurrentUnitOfType<SlideModel>(UniverInstanceType.UNIVER_SLIDE)
    if (!slide) {
      return false
    }
    accessor.get(SlidePermissionCheckService).assertUnitAction(slide.getUnitId(), UnitAction.Export)
    const operateService = accessor.get(IExchangeOperateService)

    if (isCurrentUnitLoadedFromServer(accessor, UniverInstanceType.UNIVER_SLIDE)) {
      await operateService.exportSlideByUnitId()
    } else {
      await operateService.exportSlideBySnapshot()
    }

    return true
  }
}
