import type { IUniverInstanceService, Workbook } from '@univerjs/core'
import type {
  IEmbedResourceRefDataProviderRegistration,
  IReferencedUnitManagerService
} from '@univerjs-pro/embed'
import type { ISetFormulaCalculationResultMutation } from '@univerjs/engine-formula'
import { getOriginCellValue, UniverInstanceType } from '@univerjs/core'
import { isResourceRefRangePart, ReferencedUnitDataType } from '@univerjs-pro/embed'
import { deserializeRangeWithSheet } from '@univerjs/engine-formula'

const COLLABORATION_SHEET_RESOURCE_REF_DATA_PROVIDER_ID =
  'univer-collaboration-sheet-resource-ref-data-provider'

interface CollaborationSheetResourceRefDataProviderServices {
  referencedUnitManager: Pick<IReferencedUnitManagerService, 'ensure'>
  univerInstanceService: Pick<IUniverInstanceService, 'getUnit'>
  waitForFormulaResultApplied: () => Promise<void>
  executeFormulaCalculation: () => void
}

export interface CollaborationSheetResourceRefDataProvider {
  registration: IEmbedResourceRefDataProviderRegistration
  formulaResultApplied(result: ISetFormulaCalculationResultMutation): Promise<void> | undefined
  dispose(): void
}

export function createCollaborationSheetResourceRefDataProvider(
  getServices: () => CollaborationSheetResourceRefDataProviderServices
): CollaborationSheetResourceRefDataProvider {
  const referencedFormulaUnits = new Set<string>()
  const pendingFormulaUnits = new Set<string>()
  const readyFormulaUnits = new Set<string>()
  let settling: Promise<void> | undefined
  let refreshing: Promise<void> | undefined
  let disposed = false

  const refreshHostFormulas = (): Promise<void> => {
    if (disposed) return Promise.resolve()
    if (refreshing) return refreshing
    const operation = Promise.resolve()
      .then(async () => {
        if (disposed) return
        const services = getServices()
        const applied = services.waitForFormulaResultApplied()
        services.executeFormulaCalculation()
        await applied
      })
      .finally(() => {
        if (refreshing === operation) refreshing = undefined
      })
    refreshing = operation
    return operation
  }

  const settlePendingFormulaUnits = (): Promise<void> => {
    if (settling) return settling
    const operation = (async () => {
      await getServices().waitForFormulaResultApplied()
      if (disposed) return
      for (const unitId of pendingFormulaUnits) readyFormulaUnits.add(unitId)
      pendingFormulaUnits.clear()
      await refreshHostFormulas()
    })().finally(() => {
      if (settling === operation) settling = undefined
    })
    settling = operation
    return operation
  }

  const registration: IEmbedResourceRefDataProviderRegistration = {
    registrationId: COLLABORATION_SHEET_RESOURCE_REF_DATA_PROVIDER_ID,
    match: {
      fileKinds: ['self'],
      unitTypes: ['sheet']
    },
    provider: {
      async readData(input) {
        if (
          input.dataType !== ReferencedUnitDataType.RANGE ||
          !isResourceRefRangePart(input.selector)
        ) {
          throw new Error('Collaboration Sheet ResourceRef provider only supports range reads.')
        }

        const services = getServices()
        const record = await services.referencedUnitManager.ensure(
          {
            file: input.ref.file,
            unit: input.ref.unit
          },
          {
            unitType: input.unitType,
            ...(input.signal ? { signal: input.signal } : {})
          }
        )

        const workbook = services.univerInstanceService.getUnit<Workbook>(
          record.unitId,
          UniverInstanceType.UNIVER_SHEET
        )
        if (!workbook) {
          throw new Error(`Referenced Sheet Unit is unavailable: ${record.unitId}`)
        }

        const worksheet = input.selector.sheetId
          ? workbook.getSheetBySheetId(input.selector.sheetId)
          : workbook.getSheetBySheetName(input.selector.sheetName)
        if (!worksheet) {
          throw new Error(`Referenced Sheet is unavailable: ${input.selector.sheetName}`)
        }

        const range = deserializeRangeWithSheet(input.selector.range).range
        const cells = worksheet.getRange(range).getValues()
        const hasFormula = cells.some((row) =>
          row.some((cell) => typeof cell?.f === 'string' || typeof cell?.si === 'string')
        )
        if (hasFormula) {
          referencedFormulaUnits.add(record.unitId)
          if (!readyFormulaUnits.has(record.unitId)) {
            pendingFormulaUnits.add(record.unitId)
            throw new Error(`Referenced Sheet formulas are pending: ${record.unitId}`)
          }
        }

        return {
          type: ReferencedUnitDataType.RANGE,
          values: cells.map((row) =>
            row.map((cell) => {
              const value = getOriginCellValue(cell)
              return typeof value === 'string' ||
                typeof value === 'number' ||
                typeof value === 'boolean'
                ? value
                : null
            })
          )
        }
      }
    }
  }

  return {
    registration,
    formulaResultApplied(result) {
      if (disposed || settling || refreshing) return
      if (pendingFormulaUnits.size > 0) {
        return settlePendingFormulaUnits()
      }
      if (Object.keys(result.unitData).some((unitId) => referencedFormulaUnits.has(unitId))) {
        return refreshHostFormulas()
      }
      return undefined
    },
    dispose() {
      disposed = true
      referencedFormulaUnits.clear()
      pendingFormulaUnits.clear()
      readyFormulaUnits.clear()
    }
  }
}
