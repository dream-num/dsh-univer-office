import type { IDisposable, Univer } from '@univerjs/core'
import type { FWorkbook } from '@univerjs/sheets/facade'
import { CellValueType, InterceptorEffectEnum, toDisposable } from '@univerjs/core'
import { FormulaDataModel } from '@univerjs/engine-formula'
import { IRenderManagerService } from '@univerjs/engine-render'
import { INTERCEPTOR_POINT, SheetInterceptorService } from '@univerjs/sheets'
import { SheetSkeletonManagerService } from '@univerjs/sheets-ui'

/** Show formulas in this comparison workbook without changing its data or recalculating values. */
export function registerFormulaTextDisplay(univer: Univer, workbook: FWorkbook): IDisposable {
  const injector = univer.__getInjector()
  const model = workbook.getWorkbook()
  const unitId = model.getUnitId()
  const formulas = injector.get(FormulaDataModel)
  const renders = injector.get(IRenderManagerService)
  const refresh = (): void => {
    const render = renders.getRenderUnitById(unitId)
    if (render == null) return
    const skeletons = render.with(SheetSkeletonManagerService)
    for (const sheet of model.getSheets()) {
      const skeleton = skeletons.getSkeleton(sheet.getSheetId())
      skeleton?.resetCache()
      skeleton?.makeDirty(true)
    }
    skeletons.reCalculate()
    render.mainComponent?.makeDirty()
  }

  const display = injector.get(SheetInterceptorService).intercept(INTERCEPTOR_POINT.CELL_CONTENT, {
    effect: InterceptorEffectEnum.Value,
    // Apply after number formatting so cached formatted results cannot hide the formula.
    priority: 0,
    handler: (cell, location, next) => {
      if (cell == null || location.unitId !== unitId) return next(cell)
      const formula = formulas.getFormulaStringByCell(
        location.row,
        location.col,
        location.subUnitId,
        location.unitId
      )
      return next(formula ? { ...cell, t: CellValueType.STRING, v: formula, p: null } : cell)
    }
  })
  refresh()
  return toDisposable(() => {
    display.dispose()
    refresh()
  })
}
