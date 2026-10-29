import { Disposable, Injector, setDependencies } from '@univerjs/core'
import { BuiltInUIPart, connectInjector, IUIPartsService } from '@univerjs/ui'
import { UploadNotification } from '../views/upload-notification/UploadNotification.js'

export class ExchangeClientController extends Disposable {
  constructor(
    private readonly _injector: Injector,
    private readonly _uiPartsService: IUIPartsService
  ) {
    super()
    this._registerUIParts()
  }

  private _registerUIParts() {
    this.disposeWithMe(
      this._uiPartsService.registerComponent(BuiltInUIPart.CONTENT, () =>
        connectInjector(UploadNotification, this._injector)
      )
    )
  }
}

setDependencies(ExchangeClientController, [Injector, IUIPartsService])
