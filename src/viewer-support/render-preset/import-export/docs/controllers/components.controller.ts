import { Disposable, setDependencies } from '@univerjs/core'
import { IconManager } from '@univerjs/ui'
import { EXCHANGE_ICONS } from '../../icons.js'

export class ComponentsController extends Disposable {
  constructor(iconManager: IconManager) {
    super()
    this.disposeWithMe(iconManager.register(EXCHANGE_ICONS))
  }
}

setDependencies(ComponentsController, [IconManager])
