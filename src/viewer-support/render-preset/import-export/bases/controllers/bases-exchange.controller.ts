import { BASE_TOOLBAR_EXTRA_ACTIONS } from '@univerjs-pro/bases-ui'
import { Disposable, ICommandService, Injector, setDependencies } from '@univerjs/core'
import { connectInjector, IUIPartsService } from '@univerjs/ui'
import {
  ExportBaseByFormatOperation,
  ExportBaseOperation,
  ImportBaseOperation
} from '../commands/operations/exchange.operation.js'
import { BaseExchangeToolbarActions } from '../views/BaseExchangeToolbarActions.js'

export class BasesExchangeClientController extends Disposable {
  constructor(
    private readonly _commandService: ICommandService,
    injector: Injector,
    uiPartsService: IUIPartsService
  ) {
    super()

    ;[ImportBaseOperation, ExportBaseOperation, ExportBaseByFormatOperation].forEach((command) => {
      this.disposeWithMe(this._commandService.registerCommand(command))
    })
    this.disposeWithMe(
      uiPartsService.registerComponent(BASE_TOOLBAR_EXTRA_ACTIONS, () =>
        connectInjector(BaseExchangeToolbarActions, injector)
      )
    )
  }
}

setDependencies(BasesExchangeClientController, [ICommandService, Injector, IUIPartsService])
