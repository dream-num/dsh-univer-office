import type { IAccessor, ICommand, IDisposable, Workbook } from '@univerjs/core'
import type { LocaleKey } from '../../locale/types.js'
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

export const SHEET_EXPORT_FORMAT_DIALOG_ID = 'custom-import-export.dialog.export-format'
export const EXPORT_SHEET_OPERATION_ID = 'custom-import-export.operation.export-sheet'

export interface IExportSheetByFormatOperationParams {
  format: ExchangeFormat
  sheetId?: string
}

export function createSheetExportDialogData(workbook: Workbook) {
  return {
    selectedId:
      workbook.getActiveSheet(true)?.getSheetId() ?? workbook.getSheets()[0]?.getSheetId() ?? '',
    items: workbook.getSheets().map((worksheet) => ({
      label: worksheet.getName(),
      value: worksheet.getSheetId()
    }))
  }
}

export const ImportSheetOperation: ICommand = {
  id: 'custom-import-export.operation.import-sheet',
  type: CommandType.OPERATION,
  handler: async (accessor: IAccessor) => {
    const operateService = accessor.get(IExchangeOperateService)
    if (isCurrentUnitLoadedFromServer(accessor, UniverInstanceType.UNIVER_SHEET)) {
      await operateService.importSheetToUnitId()
    } else {
      await operateService.importSheetToSnapshot()
    }

    return true
  }
}

export const ExportSheetByFormatOperation: ICommand<IExportSheetByFormatOperationParams> = {
  id: 'custom-import-export.operation.export-sheet-by-format',
  type: CommandType.OPERATION,
  handler: async (accessor, params) => {
    if (!params) {
      return false
    }
    const operateService = accessor.get(IExchangeOperateService)
    if (isCurrentUnitLoadedFromServer(accessor, UniverInstanceType.UNIVER_SHEET)) {
      await operateService.exportSheetByUnitId(undefined, undefined, params.format, params.sheetId)
    } else {
      await operateService.exportSheetBySnapshot(params.format, params.sheetId)
    }

    return true
  }
}

export const ExportSheetOperation: ICommand = {
  id: EXPORT_SHEET_OPERATION_ID,
  type: CommandType.OPERATION,
  handler: (accessor) => {
    const workbook = accessor
      .get(IUniverInstanceService)
      .getCurrentUnitOfType<Workbook>(UniverInstanceType.UNIVER_SHEET)
    if (!workbook) {
      return false
    }

    const dialogData = createSheetExportDialogData(workbook)
    const dialogService = accessor.get(IDialogService)
    const commandService = accessor.get(ICommandService)
    const localeService = accessor.get(LocaleService)
    let dialogDisposable: IDisposable | null = null
    const closeDialog = () => {
      dialogDisposable?.dispose()
      dialogDisposable = null
    }

    dialogDisposable = dialogService.open({
      id: SHEET_EXPORT_FORMAT_DIALOG_ID,
      title: { title: localeService.t<LocaleKey>('custom-import-export.download') },
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
            onConfirm: async (format: ExchangeFormat, sheetId: string) => {
              await commandService.executeCommand(ExportSheetByFormatOperation.id, {
                format,
                sheetId
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
