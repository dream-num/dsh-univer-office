import type { IDisposable, IWorkbookData, Workbook } from '@univerjs/core'
import type { IError } from '@univerjs/protocol'
import type { Observable } from 'rxjs'
import type { LocaleKey } from '../locale/types.js'
import { ExchangeFormat, IExchangeService } from '@univerjs-pro/exchange-client'
import { ISheetExchangeService } from '@univerjs-pro/sheets-exchange-client'
import {
  createIdentifier,
  Disposable,
  IResourceLoaderService,
  IUniverInstanceService,
  LocaleService,
  setDependencies,
  toDisposable,
  UniverInstanceType
} from '@univerjs/core'
import { MessageType } from '@univerjs/design'
import { ErrorCode } from '@univerjs/protocol'
import { IMessageService } from '@univerjs/ui'
import { BehaviorSubject } from 'rxjs'
import {
  IUploadNotificationService,
  UploadNotificationState
} from './upload-notification.service.js'
import { getUploadFile, isSupportedFileType } from './utils/tool.js'

export interface IExchangeOperateService extends IDisposable {
  interrupt(): void

  importSheetToUnitId(): Promise<string | undefined>

  retryImportSheetToUnitId(): Promise<string | undefined>

  importSheetToSnapshot(): Promise<void>

  exportSheetByUnitId(
    unitId?: string,
    unitName?: string,
    format?: ExchangeFormat,
    sheetId?: string
  ): Promise<void>

  exportSheetBySnapshot(format?: ExchangeFormat, sheetId?: string): Promise<void>

  /**
   * Observable of upload progress
   */
  progress$: Observable<IUploadProgress>
}

export interface IUploadProgress {
  /** Task that already completed. */
  done: number
  /** The total number of tasks need to execute. */
  count: number
}

const NilProgress: IUploadProgress = { done: 0, count: 0 }

export const IExchangeOperateService = createIdentifier<IExchangeOperateService>(
  'custom-import-export.operate.service'
)

export class ExchangeOperateService extends Disposable implements IExchangeOperateService {
  private readonly _progress$ = new BehaviorSubject<IUploadProgress>(NilProgress)

  readonly progress$ = this._progress$.asObservable()

  private _totalUploadTaskCount = 0

  private _doneUploadTaskCount = 0

  private _isSelectingUnitImportFile = false

  private _canRetryImport = false

  constructor(
    private readonly _univerInstanceService: IUniverInstanceService,
    private readonly _messageService: IMessageService,
    private readonly _localeService: LocaleService,
    private readonly _exchangeService: IExchangeService,
    private readonly _sheetExchangeService: ISheetExchangeService,
    private readonly _resourceLoaderService: IResourceLoaderService,
    private readonly _uploadNotificationService: IUploadNotificationService
  ) {
    super()
    this.disposeWithMe(
      toDisposable(
        this._exchangeService.requestState$.subscribe((data) => {
          if (data.error?.code === ErrorCode.OK) {
            this._addDoneTask(1)
          } else {
            this._showNetworkError(data.error)
          }
        })
      )
    )
  }

  override dispose(): void {
    super.dispose()
    this._canRetryImport = false
    this._progress$.complete()
  }

  interrupt(): void {
    this._clearProgress()
    this._uploadNotificationService.updateState(UploadNotificationState.ERROR)
    this._exchangeService.interruptImportTask()
  }

  async importSheetToUnitId(): Promise<string | undefined> {
    if (this._isSelectingUnitImportFile || this._uploadTaskNotDone()) {
      this._messageService.show({
        type: MessageType.Warning,
        content: this._localeService.t<LocaleKey>('custom-import-export.uploading')
      })
      return
    }

    let file: FileList | null
    this._isSelectingUnitImportFile = true
    try {
      file = await getUploadFile([UniverInstanceType.UNIVER_SHEET])
    } finally {
      this._isSelectingUnitImportFile = false
    }

    const selected = file?.[0]
    if (!selected) {
      return
    }

    const isFileTypeError = this._fileTypeError(selected)

    if (isFileTypeError) {
      return
    }

    this._canRetryImport = true

    return this._importSheetToUnitId(selected)
  }

  async retryImportSheetToUnitId(): Promise<string | undefined> {
    if (!this._canRetryImport) {
      return
    }

    return this.importSheetToUnitId()
  }

  async importSheetToSnapshot(): Promise<void> {
    if (this._uploadTaskNotDone()) {
      this._messageService.show({
        type: MessageType.Warning,
        content: this._localeService.t<LocaleKey>('custom-import-export.uploading')
      })
      return
    }

    const file = await getUploadFile([UniverInstanceType.UNIVER_SHEET])

    const selected = file?.[0]
    if (!selected || this._fileTypeError(selected)) {
      return
    }

    this._showUploadMessage(MessageType.Info)

    const snapshot = await this._sheetExchangeService.importSheetToSnapshot(selected)

    if (!snapshot) {
      return
    }

    this._refreshWorkbook(snapshot)

    this._showUploadMessage(MessageType.Success)
  }

  async exportSheetByUnitId(
    unitId?: string,
    unitName?: string,
    format = ExchangeFormat.XLSX,
    sheetId?: string
  ): Promise<void> {
    const workbook = this._getCurrentWorkbook()
    const name = unitName ?? workbook.getSnapshot().name
    this._showDownloadMessage(MessageType.Info)
    const file = await this._sheetExchangeService.exportSheetByUnitId(
      unitId ?? workbook.getUnitId(),
      format,
      sheetId
    )
    this._downloadFile(file, name, format)
  }

  async exportSheetBySnapshot(format = ExchangeFormat.XLSX, sheetId?: string): Promise<void> {
    const workbook = this._getCurrentWorkbook()
    const snapshot =
      this._resourceLoaderService.saveUnit<IWorkbookData>(workbook.getUnitId()) ??
      workbook.getSnapshot()
    this._showDownloadMessage(MessageType.Info)
    const file = await this._sheetExchangeService.exportSheetBySnapshot(snapshot, format, sheetId)
    this._downloadFile(file, snapshot.name, format)
  }

  private _downloadFile(
    file: File | undefined,
    unitName: string | undefined,
    format: ExchangeFormat
  ): void {
    if (!file) {
      return
    }

    this._exchangeService.downloadFile(
      file,
      unitName || file.name.split('.').shift() || document.title,
      format
    )

    this._showDownloadMessage(MessageType.Success)
  }

  private async _importSheetToUnitId(file: File): Promise<string | undefined> {
    // show notification, start upload
    this._uploadNotificationService.show()
    this._uploadNotificationService.updateState(UploadNotificationState.UPLOADING)

    // show progress, total 3 request, need to show progress before first request
    this._addTotalCount(4)
    this._addDoneTask(1)

    const unitId = await this._sheetExchangeService.importSheetToUnitId(file)

    if (!unitId) {
      this._clearProgress()
      this._uploadNotificationService.updateState(UploadNotificationState.ERROR)
      return
    }

    const link = {
      link: this._getLinkByUnitId(unitId, UniverInstanceType.UNIVER_SHEET),
      name: file.name,
      type: UniverInstanceType.UNIVER_SHEET
    }

    this._uploadNotificationService.pushLink(link)

    this._completeProgress()
    this._uploadNotificationService.updateState(UploadNotificationState.SUCCESS)

    return unitId
  }

  private _refreshWorkbook(snapshot: IWorkbookData): void {
    const unit = this._getCurrentWorkbook()
    this._univerInstanceService.disposeUnit(unit.getUnitId())
    const newUnit = this._univerInstanceService.createUnit<IWorkbookData, Workbook>(
      UniverInstanceType.UNIVER_SHEET,
      snapshot
    )
    this._univerInstanceService.focusUnit(newUnit.getUnitId())
  }

  private _getCurrentWorkbook(): Workbook {
    const workbook = this._univerInstanceService.getCurrentUnitOfType<Workbook>(
      UniverInstanceType.UNIVER_SHEET
    )
    if (!workbook) {
      throw new Error(`No unit of type ${UniverInstanceType.UNIVER_SHEET} is currently active.`)
    }
    return workbook
  }

  /**
   * Get unit link /?unit={unitId}&type=2
   */
  private _getLinkByUnitId(unitId: string, type: UniverInstanceType) {
    const url = new URL(window.location.href)
    url.searchParams.set('unit', unitId)
    url.searchParams.set('type', `${type}`)
    return url.toString()
  }

  private _showNetworkError(error?: IError) {
    if (error) {
      const { code } = error

      switch (code) {
        case ErrorCode.CONNECTOR_DATA_TOO_LARGE:
          this._messageService.show({
            type: MessageType.Error,
            content: this._localeService.t<LocaleKey>('custom-import-export.tooLarge')
          })
          break
        case ErrorCode.INTERNAL_ERROR:
          this._messageService.show({
            type: MessageType.Error,
            content: this._localeService.t<LocaleKey>('custom-import-export.internalError')
          })
          break

        default:
          this._messageService.show({
            type: MessageType.Error,
            content: this._localeService.t<LocaleKey>('custom-import-export.networkError')
          })
          break
      }

      return null
    }

    this._messageService.show({
      type: MessageType.Error,
      content: this._localeService.t<LocaleKey>('custom-import-export.networkError')
    })
    return null
  }

  private _showDownloadMessage(type: MessageType) {
    let content = ''

    switch (type) {
      case MessageType.Success:
        content = this._localeService.t<LocaleKey>('custom-import-export.downloadSuccess')
        break
      case MessageType.Info:
        content = this._localeService.t<LocaleKey>('custom-import-export.downloading')
        break
      default:
        break
    }

    this._messageService.show({
      type,
      content
    })
  }

  private _showUploadMessage(type: MessageType) {
    let content = ''

    switch (type) {
      case MessageType.Success:
        content = this._localeService.t<LocaleKey>('custom-import-export.uploadSuccess')
        break
      case MessageType.Info:
        content = this._localeService.t<LocaleKey>('custom-import-export.uploading')
        break
      default:
        break
    }

    this._messageService.show({
      type,
      content
    })
  }

  private _emitProgress(): void {
    this._progress$.next({ done: this._doneUploadTaskCount, count: this._totalUploadTaskCount })
  }

  private _addTotalCount(count: number): void {
    this._totalUploadTaskCount += count
    this._emitProgress()
  }

  private _addDoneTask(count: number): void {
    this._doneUploadTaskCount += count
    this._doneUploadTaskCount = Math.min(this._doneUploadTaskCount, this._totalUploadTaskCount)
    this._emitProgress()
  }

  private _completeProgress(): void {
    this._doneUploadTaskCount = this._totalUploadTaskCount
    this._emitProgress()
  }

  private _clearProgress(): void {
    this._doneUploadTaskCount = 0
    this._totalUploadTaskCount = 0
    this._emitProgress()
  }

  /**
   * Although we have specified the supported file types in advance, users can still switch to select all types of files.
   * In order to prevent such unsupported files from being transmitted to the server, they need to be intercepted in advance.
   */
  private _fileTypeError(file: File): boolean {
    const fileName = file.name

    // Get file type, if file type is not expected, return fail message
    if (!isSupportedFileType(file, UniverInstanceType.UNIVER_SHEET)) {
      this._messageService.show({
        type: MessageType.Error,
        content: this._localeService.t<LocaleKey>('custom-import-export.fileTypeError', fileName)
      })

      return true
    }

    return false
  }

  private _uploadTaskNotDone(): boolean {
    return (
      this._totalUploadTaskCount !== 0 && this._doneUploadTaskCount !== this._totalUploadTaskCount
    )
  }
}

setDependencies(ExchangeOperateService, [
  IUniverInstanceService,
  IMessageService,
  LocaleService,
  IExchangeService,
  ISheetExchangeService,
  IResourceLoaderService,
  IUploadNotificationService
])
