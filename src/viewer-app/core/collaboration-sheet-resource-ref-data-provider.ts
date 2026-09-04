import type {
  ICommandInfo,
  ICommandService,
  IDisposable,
  IUniverInstanceService,
  Workbook
} from '@univerjs/core'
import type {
  IEmbedResourceRefDataProviderRegistration,
  IReferencedUnitManagerService,
  IResourceRef
} from '@univerjs-pro/embed'
import type { ISetFormulaCalculationResultMutation } from '@univerjs/engine-formula'
import type {
  IInsertColMutationParams,
  IInsertRowMutationParams,
  IRemoveColMutationParams,
  IRemoveRowsMutationParams,
  IReorderRangeMutationParams,
  ISetRangeValuesMutationParams
} from '@univerjs/sheets'
import { getOriginCellValue, ObjectMatrix, Rectangle, UniverInstanceType } from '@univerjs/core'
import { isResourceRefRangePart, ReferencedUnitDataType } from '@univerjs-pro/embed'
import { deserializeRangeWithSheet } from '@univerjs/engine-formula'
import {
  InsertColMutation,
  InsertRowMutation,
  RemoveColMutation,
  RemoveRowMutation,
  ReorderRangeMutation,
  SetRangeValuesMutation
} from '@univerjs/sheets'

const COLLABORATION_SHEET_RESOURCE_REF_DATA_PROVIDER_ID =
  'univer-collaboration-sheet-resource-ref-data-provider'

interface CollaborationSheetResourceRefDataProviderServices {
  referencedUnitManager: Pick<IReferencedUnitManagerService, 'ensure'>
  univerInstanceService: Pick<IUniverInstanceService, 'getUnit'>
  commandService: Pick<ICommandService, 'onCommandExecuted'>
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
      },
      watchData(input, onChange): IDisposable {
        if (
          input.dataType !== ReferencedUnitDataType.RANGE ||
          !isResourceRefRangePart(input.selector)
        ) {
          throw new Error('Collaboration Sheet ResourceRef provider only supports range watches.')
        }
        return watchReferencedSheetRange(
          getServices(),
          input.ref,
          input.selector.sheetName,
          input.selector.sheetId,
          input.selector.range,
          onChange
        )
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

type SheetRangeMutationParams =
  | ISetRangeValuesMutationParams
  | IReorderRangeMutationParams
  | IInsertRowMutationParams
  | IInsertColMutationParams
  | IRemoveRowsMutationParams
  | IRemoveColMutationParams

const SHEET_STRUCTURE_MUTATION_IDS = new Set([
  InsertRowMutation.id,
  InsertColMutation.id,
  RemoveRowMutation.id,
  RemoveColMutation.id
])

const SHEET_RANGE_MUTATION_IDS = new Set([
  SetRangeValuesMutation.id,
  ReorderRangeMutation.id,
  ...SHEET_STRUCTURE_MUTATION_IDS
])

/**
 * Watch a referenced Sheet range so a Chart fed by this ResourceRef re-reads its
 * cells when the source range mutates. Mirrors the SDK's built-in
 * `EmbedLocalRuntimeResourceRefDataProvider.watchData` for the collaborative
 * runtime, which otherwise has no data-source subscription and only refreshes on
 * reload (a chart never sees source edits live).
 */
function watchReferencedSheetRange(
  services: CollaborationSheetResourceRefDataProviderServices,
  ref: IResourceRef,
  sheetName: string,
  requestedSheetId: string | undefined,
  rangeText: string,
  onChange: () => void
): IDisposable {
  const sourceRange = deserializeRangeWithSheet(rangeText).range
  let sheetId = requestedSheetId

  return services.commandService.onCommandExecuted((command) => {
    const params = sheetRangeMutationParams(command)
    if (!params) return

    if (!sheetId) {
      const workbook = services.univerInstanceService.getUnit<Workbook>(
        ref.unit.selector,
        UniverInstanceType.UNIVER_SHEET
      )
      sheetId = workbook?.getSheetBySheetName(sheetName)?.getSheetId()
    }
    if (params.unitId !== ref.unit.selector || params.subUnitId !== sheetId) {
      return
    }

    if (command.id === SetRangeValuesMutation.id) {
      const { cellValue } = params as ISetRangeValuesMutationParams
      if (!cellValue) {
        onChange()
        return
      }
      if (Rectangle.intersects(sourceRange, new ObjectMatrix(cellValue).getStartEndScope())) {
        onChange()
      }
      return
    }

    if (command.id === ReorderRangeMutation.id) {
      const { range } = params as IReorderRangeMutationParams
      if (Rectangle.intersects(sourceRange, range)) {
        onChange()
      }
      return
    }

    // Structural mutations shift what an A1 reference resolves to, so refresh even when
    // the mutated range sits immediately before the referenced one.
    if (SHEET_STRUCTURE_MUTATION_IDS.has(command.id)) {
      onChange()
    }
  })
}

function sheetRangeMutationParams(command: ICommandInfo): SheetRangeMutationParams | undefined {
  if (
    !SHEET_RANGE_MUTATION_IDS.has(command.id) ||
    command.params == null ||
    typeof command.params !== 'object'
  ) {
    return undefined
  }
  const params = command.params as Record<string, unknown>
  if (!('unitId' in params) || !('subUnitId' in params)) {
    return undefined
  }
  return command.params as unknown as SheetRangeMutationParams
}
