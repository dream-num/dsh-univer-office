import type { BaseDataModel, ICommand, IDisposable } from '@univerjs/core'
import type { LocaleKey } from '../../locale/types.js'
import { IBaseUIStateService } from '@univerjs-pro/bases-ui'
import { ExchangeFormat } from '@univerjs-pro/exchange-client'
import {
  CommandType,
  ICommandService,
  IUniverInstanceService,
  LocaleService,
  UniverInstanceType
} from '@univerjs/core'
import { IDialogService } from '@univerjs/ui'
import { IExchangeOperateService } from '../../services/operate.service.js'
import { isCurrentUnitLoadedFromServer } from '../../services/utils/collaboration.js'
import { EXPORT_FORMAT_DIALOG } from '../../views/export-format-dialog/ExportFormatDialog.js'

export const BASE_EXPORT_FORMAT_DIALOG_ID = 'custom-bases-import-export.dialog.export-format'

export interface IExportBaseByFormatOperationParams {
  format: ExchangeFormat
  tableId?: string
}

export function createBaseExportDialogData(base: BaseDataModel, activeTableId?: string) {
  const snapshot = base.getSnapshot()
  const items = snapshot.tableOrder
    .map((tableId) => snapshot.tables[tableId])
    .filter((table) => table !== undefined)
    .map((table) => ({ label: table.name, value: table.id }))
  return {
    selectedId: items.some((item) => item.value === activeTableId)
      ? activeTableId!
      : (items[0]?.value ?? ''),
    items
  }
}

export const ImportBaseOperation: ICommand = {
  id: 'custom-bases-import-export.operation.import-base',
  type: CommandType.OPERATION,
  handler: async (accessor) => {
    const operateService = accessor.get(IExchangeOperateService)
    if (isCurrentUnitLoadedFromServer(accessor, UniverInstanceType.UNIVER_BASE)) {
      await operateService.importBaseToUnitId()
    } else {
      await operateService.importBaseToSnapshot()
    }
    return true
  }
}

export const ExportBaseByFormatOperation: ICommand<IExportBaseByFormatOperationParams> = {
  id: 'custom-bases-import-export.operation.export-base-by-format',
  type: CommandType.OPERATION,
  handler: async (accessor, params) => {
    if (!params) return false
    const operateService = accessor.get(IExchangeOperateService)
    if (isCurrentUnitLoadedFromServer(accessor, UniverInstanceType.UNIVER_BASE)) {
      await operateService.exportBaseByUnitId(params.format, params.tableId)
    } else {
      await operateService.exportBaseBySnapshot(params.format, params.tableId)
    }
    return true
  }
}

export const ExportBaseOperation: ICommand = {
  id: 'custom-bases-import-export.operation.export-base',
  type: CommandType.OPERATION,
  handler: (accessor) => {
    const base = accessor
      .get(IUniverInstanceService)
      .getCurrentUnitOfType<BaseDataModel>(UniverInstanceType.UNIVER_BASE)
    if (!base) return false

    const dialogData = createBaseExportDialogData(
      base,
      accessor.get(IBaseUIStateService).getState().activeTableId
    )
    const dialogService = accessor.get(IDialogService)
    const commandService = accessor.get(ICommandService)
    const localeService = accessor.get(LocaleService)
    let dialogDisposable: IDisposable | null = null
    const closeDialog = () => {
      dialogDisposable?.dispose()
      dialogDisposable = null
    }

    dialogDisposable = dialogService.open({
      id: BASE_EXPORT_FORMAT_DIALOG_ID,
      title: { title: localeService.t<LocaleKey>('custom-bases-import-export.download') },
      width: 420,
      draggable: false,
      mask: true,
      maskClosable: false,
      children: {
        label: {
          name: EXPORT_FORMAT_DIALOG,
          props: {
            formats: [ExchangeFormat.XLSX, ExchangeFormat.CSV, ExchangeFormat.TSV],
            ...dialogData,
            onCancel: closeDialog,
            onConfirm: async (format: ExchangeFormat, tableId: string) => {
              await commandService.executeCommand(ExportBaseByFormatOperation.id, {
                format,
                tableId
              })
              closeDialog()
            }
          }
        }
      },
      onClose: closeDialog
    })
    return true
  }
}
