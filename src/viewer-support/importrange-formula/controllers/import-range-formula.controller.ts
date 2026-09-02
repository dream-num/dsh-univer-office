import type { IReferencedUnitManagerService } from '@univerjs-pro/embed'
import type { IDisposable } from '@univerjs/core'
import { Disposable, setDependencies } from '@univerjs/core'
import { IReferencedUnitManagerService as IReferencedUnitManagerServiceToken } from '@univerjs-pro/embed'
import { IRegisterFunctionService as IRegisterFunctionServiceToken } from '@univerjs/engine-formula'
import {
  createImportRangeFunction,
  IMPORT_RANGE_FORMULA_NAME
} from '../functions/import-range.function.js'

export interface IImportRangeFunctionRegistrar {
  registerAsyncFunction(params: {
    name: string
    description: string
    func: ReturnType<typeof createImportRangeFunction>
  }): IDisposable
}

export class ImportRangeFormulaController extends Disposable {
  constructor(
    private readonly _referencedUnitManager: IReferencedUnitManagerService,
    private readonly _registerFunctionService: IImportRangeFunctionRegistrar
  ) {
    super()

    this.disposeWithMe(
      this._registerFunctionService.registerAsyncFunction({
        name: IMPORT_RANGE_FORMULA_NAME,
        description: 'Import a range from a referenced Univer sheet unit.',
        func: createImportRangeFunction(this._referencedUnitManager)
      })
    )
  }
}

setDependencies(ImportRangeFormulaController, [
  IReferencedUnitManagerServiceToken,
  IRegisterFunctionServiceToken
])
