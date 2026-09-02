import type { BaseDataModel, IUniverInstanceService } from '@univerjs/core'
import type {
  IEmbedResourceRefDataProviderRegistration,
  IReferencedUnitManagerService
} from '@univerjs-pro/embed'
import { ensureBaseTableCellLayout, getBaseCellFormulaValue } from '@univerjs-pro/bases'
import { isResourceRefTablePart, ReferencedUnitDataType } from '@univerjs-pro/embed'
import { createBaseFormulaTableNameMap, Tools, UniverInstanceType } from '@univerjs/core'

const VIEW_BASE_RESOURCE_REF_DATA_PROVIDER_ID = 'univer-view-base-resource-ref-data-provider'

interface ViewBaseResourceRefDataProviderServices {
  referencedUnitManager: Pick<IReferencedUnitManagerService, 'ensure'>
  univerInstanceService: Pick<IUniverInstanceService, 'getUnit'>
}

export function createViewBaseResourceRefDataProviderRegistration(
  getServices: () => ViewBaseResourceRefDataProviderServices
): IEmbedResourceRefDataProviderRegistration {
  return {
    registrationId: VIEW_BASE_RESOURCE_REF_DATA_PROVIDER_ID,
    match: {
      fileKinds: ['self'],
      unitTypes: ['base']
    },
    provider: {
      async readData(input) {
        if (
          input.dataType !== ReferencedUnitDataType.TABLE ||
          !isResourceRefTablePart(input.selector)
        ) {
          throw new Error('View Base ResourceRef provider only supports table reads.')
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
        const base = services.univerInstanceService.getUnit<BaseDataModel>(
          record.unitId,
          UniverInstanceType.UNIVER_BASE
        )
        if (!base) {
          throw new Error(`Referenced Base Unit is unavailable: ${record.unitId}`)
        }

        const sourceSnapshot = base.getSnapshot()
        const requestedTableName = input.selector.tableName
        const sourceTable =
          sourceSnapshot.tables[requestedTableName] ??
          uniqueTableByFormulaName(sourceSnapshot.tables, requestedTableName) ??
          uniqueTableByName(sourceSnapshot.tables, requestedTableName)
        if (!sourceTable) {
          throw new Error(`Referenced Base table is unavailable: ${requestedTableName}`)
        }

        const table = ensureBaseTableCellLayout(Tools.deepClone(sourceTable))
        const recordIds = table.recordOrder ?? []
        const fieldIds = table.fieldOrder
        const values = recordIds.map((recordId) =>
          fieldIds.map((fieldId) => {
            // The record-hierarchy SDK baseline uses the primary cell for internal identity in
            // layout data. ResourceRef keeps exposing the authored primary value to consumers.
            const authoredPrimaryValue =
              fieldId === table.primaryFieldId
                ? table.records[recordId]?.values[fieldId]
                : undefined
            if (
              typeof authoredPrimaryValue === 'string' ||
              typeof authoredPrimaryValue === 'number' ||
              typeof authoredPrimaryValue === 'boolean'
            ) {
              return authoredPrimaryValue
            }
            return getBaseCellFormulaValue(table, recordId, fieldId) ?? null
          })
        )

        return {
          type: ReferencedUnitDataType.TABLE,
          tableName: requestedTableName,
          sheetName: table.name,
          sheetId: table.id,
          range: {
            startRow: 0,
            endRow: Math.max(0, recordIds.length - 1),
            startColumn: 0,
            endColumn: Math.max(0, fieldIds.length - 1)
          },
          columns: fieldIds.map((fieldId) => table.fields[fieldId]?.name ?? fieldId),
          showHeader: false,
          values
        }
      }
    }
  }
}

function uniqueTableByFormulaName<T extends { id: string; name: string }>(
  tables: Record<string, T>,
  requestedName: string
): T | undefined {
  const normalizedName = requestedName.toLowerCase()
  const formulaNames = createBaseFormulaTableNameMap({ tables })
  const matches = Object.values(tables).filter(
    (table) => formulaNames.get(table.id)?.toLowerCase() === normalizedName
  )
  return matches.length === 1 ? matches[0] : undefined
}

function uniqueTableByName<T extends { name: string }>(
  tables: Record<string, T>,
  requestedName: string
): T | undefined {
  const normalizedName = requestedName.toLowerCase()
  const matches = Object.values(tables).filter(
    (table) => table.name.toLowerCase() === normalizedName
  )
  return matches.length === 1 ? matches[0] : undefined
}
