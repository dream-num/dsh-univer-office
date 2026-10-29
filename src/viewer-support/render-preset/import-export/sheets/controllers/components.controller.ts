import { Disposable, setDependencies } from '@univerjs/core'
import { ComponentManager, IconManager } from '@univerjs/ui'
import { EXCHANGE_ICONS } from '../../icons.js'
import {
  EXPORT_FORMAT_DIALOG,
  ExportFormatDialog
} from '../views/export-format-dialog/ExportFormatDialog.js'

export class ComponentsController extends Disposable {
  constructor(
    private readonly _iconManager: IconManager,
    private readonly _componentManager: ComponentManager
  ) {
    super()

    this._registerIcons()
    this._registerComponents()
  }

  private _registerIcons() {
    this.disposeWithMe(this._iconManager.register(EXCHANGE_ICONS))
  }

  private _registerComponents() {
    this.disposeWithMe(this._componentManager.register(EXPORT_FORMAT_DIALOG, ExportFormatDialog))
  }
}

setDependencies(ComponentsController, [IconManager, ComponentManager])
