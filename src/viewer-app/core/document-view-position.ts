import type { IDisposable, Univer } from '@univerjs/core'
import { fromEventSubject, LifecycleService, LifecycleStages, toDisposable } from '@univerjs/core'
import { DocPageLayoutService } from '@univerjs/docs-ui'
import { IRenderManagerService } from '@univerjs/engine-render'
import { filter, take, type Subscription } from 'rxjs'

/** Position the live Doc after its engine attaches, retaining the document's existing zoom. */
export function initializeDocumentViewPosition(univer: Univer, unitId: string): IDisposable {
  const injector = univer.__getInjector()
  let resize: Subscription | undefined
  const lifecycle = injector
    .get(LifecycleService)
    .lifecycle$.pipe(
      filter((stage) => stage >= LifecycleStages.Rendered),
      take(1)
    )
    .subscribe(() => {
      const render = injector.get(IRenderManagerService).getRenderUnitById(unitId)
      if (render == null) return
      const position = (): void => {
        // The SDK uses a 1px engine before mounting and places the Doc offscreen meanwhile.
        if (render.engine.width <= 1 || render.engine.height <= 1) return
        render.with(DocPageLayoutService).calculatePagePosition()
        resize?.unsubscribe()
      }
      resize = fromEventSubject(render.engine.onTransformChange$).subscribe(position)
      position()
    })
  return toDisposable(() => {
    lifecycle.unsubscribe()
    resize?.unsubscribe()
  })
}
