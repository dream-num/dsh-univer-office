import type { IExchangeDocImportOption } from '@univerjs-pro/exchange-client'
import type { DocumentDataModel, IDisposable, IDocumentData } from '@univerjs/core'
import type { IError } from '@univerjs/protocol'
import type { Observable } from 'rxjs'
import type { LocaleKey } from '../locale/types.js'
import { IDocExchangeService } from '@univerjs-pro/docs-exchange-client'
import { ExchangeDocType, ExchangeFormat, IExchangeService } from '@univerjs-pro/exchange-client'
import {
  createIdentifier,
  Disposable,
  DocumentFlavor,
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

export function getDocImportOptionFromDocumentFlavor(
  documentFlavor?: DocumentFlavor
): IExchangeDocImportOption | undefined {
  switch (documentFlavor) {
    case DocumentFlavor.MODERN:
      return { docType: ExchangeDocType.MODERN }
    case DocumentFlavor.TRADITIONAL:
      return { docType: ExchangeDocType.TRADITIONAL }
    default:
      return undefined
  }
}

export interface IExchangeOperateService extends IDisposable {
  interrupt(): void

  importDocToUnitId(): Promise<string | undefined>

  retryImportDocToUnitId(): Promise<string | undefined>

  importDocToSnapshot(): Promise<void>

  exportDocByUnitId(unitId?: string, unitName?: string): Promise<void>

  exportDocBySnapshot(): Promise<void>

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
  'custom-docs-import-export.operate.service'
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
    private readonly _docExchangeService: IDocExchangeService,
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

  async importDocToUnitId(): Promise<string | undefined> {
    const options = getDocImportOptionFromDocumentFlavor(
      this._getCurrentDocument().getDocumentStyle().documentFlavor
    )
    if (this._isSelectingUnitImportFile || this._uploadTaskNotDone()) {
      this._messageService.show({
        type: MessageType.Warning,
        content: this._localeService.t<LocaleKey>('custom-docs-import-export.uploading')
      })
      return
    }

    let file: FileList | null
    this._isSelectingUnitImportFile = true
    try {
      file = await getUploadFile([UniverInstanceType.UNIVER_DOC])
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

    return this._importDocToUnitId(selected, options)
  }

  async retryImportDocToUnitId(): Promise<string | undefined> {
    if (!this._canRetryImport) {
      return
    }

    return this.importDocToUnitId()
  }

  async importDocToSnapshot(): Promise<void> {
    const options = getDocImportOptionFromDocumentFlavor(
      this._getCurrentDocument().getDocumentStyle().documentFlavor
    )
    if (this._uploadTaskNotDone()) {
      this._messageService.show({
        type: MessageType.Warning,
        content: this._localeService.t<LocaleKey>('custom-docs-import-export.uploading')
      })
      return
    }

    const file = await getUploadFile([UniverInstanceType.UNIVER_DOC])

    const selected = file?.[0]
    if (!selected || this._fileTypeError(selected)) {
      return
    }

    this._showUploadMessage(MessageType.Info)

    const snapshot = await this._docExchangeService.importDocToSnapshot(selected, options)

    if (!snapshot) {
      return
    }

    this._refreshDocument(snapshot)

    this._showUploadMessage(MessageType.Success)
  }

  async exportDocByUnitId(unitId?: string, unitName?: string): Promise<void> {
    const document = this._getCurrentDocument()
    const name = unitName ?? document.getSnapshot().title
    this._showDownloadMessage(MessageType.Info)
    const file = await this._docExchangeService.exportDocByUnitId(unitId ?? document.getUnitId())
    this._downloadFile(file, name, ExchangeFormat.DOCX)
  }

  async exportDocBySnapshot(): Promise<void> {
    const document = this._getCurrentDocument()
    const snapshot =
      this._resourceLoaderService.saveUnit<IDocumentData>(document.getUnitId()) ??
      document.getSnapshot()
    this._showDownloadMessage(MessageType.Info)
    const file = await this._docExchangeService.exportDocBySnapshot(snapshot)
    this._downloadFile(file, snapshot.title, ExchangeFormat.DOCX)
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

  private async _importDocToUnitId(
    file: File,
    options?: IExchangeDocImportOption
  ): Promise<string | undefined> {
    this._uploadNotificationService.show()
    this._uploadNotificationService.updateState(UploadNotificationState.UPLOADING)

    this._addTotalCount(4)
    this._addDoneTask(1)

    const unitId = await this._docExchangeService.importDocToUnitId(file, options)

    if (!unitId) {
      this._clearProgress()
      this._uploadNotificationService.updateState(UploadNotificationState.ERROR)
      return
    }

    const link = {
      link: this._getLinkByUnitId(unitId, UniverInstanceType.UNIVER_DOC),
      name: file.name,
      type: UniverInstanceType.UNIVER_DOC
    }

    this._uploadNotificationService.pushLink(link)

    this._completeProgress()
    this._uploadNotificationService.updateState(UploadNotificationState.SUCCESS)

    return unitId
  }

  private _refreshDocument(snapshot: IDocumentData): void {
    const unit = this._getCurrentDocument()
    this._univerInstanceService.disposeUnit(unit.getUnitId())
    const newUnit = this._univerInstanceService.createUnit<IDocumentData, DocumentDataModel>(
      UniverInstanceType.UNIVER_DOC,
      snapshot
    )
    this._univerInstanceService.focusUnit(newUnit.getUnitId())
  }

  private _getCurrentDocument(): DocumentDataModel {
    const document = this._univerInstanceService.getCurrentUnitOfType<DocumentDataModel>(
      UniverInstanceType.UNIVER_DOC
    )
    if (!document) {
      throw new Error(`No unit of type ${UniverInstanceType.UNIVER_DOC} is currently active.`)
    }
    return document
  }

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
            content: this._localeService.t<LocaleKey>('custom-docs-import-export.tooLarge')
          })
          break
        case ErrorCode.INTERNAL_ERROR:
          this._messageService.show({
            type: MessageType.Error,
            content: this._localeService.t<LocaleKey>('custom-docs-import-export.internalError')
          })
          break

        default:
          this._messageService.show({
            type: MessageType.Error,
            content: this._localeService.t<LocaleKey>('custom-docs-import-export.networkError')
          })
          break
      }

      return null
    }

    this._messageService.show({
      type: MessageType.Error,
      content: this._localeService.t<LocaleKey>('custom-docs-import-export.networkError')
    })
    return null
  }

  private _showDownloadMessage(type: MessageType) {
    let content = ''

    switch (type) {
      case MessageType.Success:
        content = this._localeService.t<LocaleKey>('custom-docs-import-export.downloadSuccess')
        break
      case MessageType.Info:
        content = this._localeService.t<LocaleKey>('custom-docs-import-export.downloading')
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
        content = this._localeService.t<LocaleKey>('custom-docs-import-export.uploadSuccess')
        break
      case MessageType.Info:
        content = this._localeService.t<LocaleKey>('custom-docs-import-export.uploading')
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
    if (!isSupportedFileType(file, UniverInstanceType.UNIVER_DOC)) {
      this._messageService.show({
        type: MessageType.Error,
        content: this._localeService.t<LocaleKey>(
          'custom-docs-import-export.fileTypeError',
          fileName
        )
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
  IDocExchangeService,
  IResourceLoaderService,
  IUploadNotificationService
])
