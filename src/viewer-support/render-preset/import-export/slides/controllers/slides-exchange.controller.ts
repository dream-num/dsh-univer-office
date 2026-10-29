import { Disposable, ICommandService, setDependencies } from '@univerjs/core'
import { IMenuManagerService } from '@univerjs/ui'
import {
  ExportSlideOperation,
  ImportSlideOperation
} from '../commands/operations/exchange.operation.js'
import { menuSchema } from '../menu/schema.js'

export class SlidesExchangeClientController extends Disposable {
  constructor(
    private readonly _commandService: ICommandService,
    protected readonly _menuManagerService: IMenuManagerService
  ) {
    super()

    this._initCommands()
    this._initMenus()
  }

  private _initCommands(): void {
    ;[ImportSlideOperation, ExportSlideOperation].forEach((c) => {
      this.disposeWithMe(this._commandService.registerCommand(c))
    })
  }

  private _initMenus(): void {
    this._menuManagerService.mergeMenu(menuSchema)
  }
}

setDependencies(SlidesExchangeClientController, [ICommandService, IMenuManagerService])
