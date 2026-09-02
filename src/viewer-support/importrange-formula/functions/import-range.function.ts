import type { IReferencedUnitManagerService, IResourceRef } from '@univerjs-pro/embed'
import type {
  FormulaFunctionResultValueType,
  FormulaFunctionValueType
} from '@univerjs/engine-formula'
import {
  BaseValueObject,
  deserializeRangeWithSheet,
  ErrorType,
  type PrimitiveValueType,
  serializeRange
} from '@univerjs/engine-formula'
import { EmbedError, EmbedErrorCode, parseResourceRef } from '@univerjs-pro/embed'

export const IMPORT_RANGE_FORMULA_NAME = 'IMPORTRANGE'

interface RangeSelector {
  ref: string
  range: string
  sheetName: string
}

const READ_DATA_REF_ERROR_CODES = new Set<EmbedErrorCode>([
  EmbedErrorCode.LocalRuntimeResourceRefUnitNotFound,
  EmbedErrorCode.LocalRuntimeResourceRefDataUnitNotFound,
  EmbedErrorCode.LocalRuntimeResourceRefDataSheetNotFound
])

export function createImportRangeFunction(
  referencedUnitManager: IReferencedUnitManagerService
): (...args: FormulaFunctionValueType[]) => Promise<FormulaFunctionResultValueType> {
  return async (...args) => {
    if (args.length !== 2) {
      return ErrorType.VALUE
    }

    const refText = normalizeScalarStringArgument(args[0])
    const rangeText = normalizeScalarStringArgument(args[1])
    if (refText === undefined || rangeText === undefined) {
      return ErrorType.VALUE
    }

    const ref = parseSheetResourceRef(refText)
    const selector = parseRangeSelector(rangeText)
    if (ref === undefined || selector === undefined) {
      return ErrorType.REF
    }

    return await readReferencedRangeValues(referencedUnitManager, {
      ...ref,
      part: {
        kind: 'range',
        ref: selector.ref,
        sheetName: selector.sheetName,
        range: selector.range
      }
    })
  }
}

async function readReferencedRangeValues(
  referencedUnitManager: IReferencedUnitManagerService,
  ref: Parameters<IReferencedUnitManagerService['readData']>[0]
): Promise<FormulaFunctionResultValueType> {
  try {
    const result = await referencedUnitManager.readData(ref)
    return result.values
  } catch (error) {
    if (isReadDataRefError(error)) {
      return ErrorType.REF
    }
    throw error
  }
}

function isReadDataRefError(error: unknown): boolean {
  return error instanceof EmbedError && READ_DATA_REF_ERROR_CODES.has(error.code)
}

function normalizeScalarStringArgument(
  value: FormulaFunctionValueType | undefined
): string | undefined {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const cellValue = getSingleMatrixValue(value)
    return typeof cellValue === 'string' ? cellValue : undefined
  }

  if (value instanceof BaseValueObject) {
    if (!value.isString()) {
      return undefined
    }
    return String(value.getValue())
  }

  return undefined
}

function getSingleMatrixValue(value: PrimitiveValueType[][]): PrimitiveValueType | undefined {
  if (value.length !== 1 || value[0]?.length !== 1) {
    return undefined
  }

  return value[0][0]
}

function parseSheetResourceRef(input: string): IResourceRef | undefined {
  try {
    const ref = parseResourceRef(input)
    return ref.file.kind === 'self' && ref.unit.type === 'sheet' && ref.unit.selector !== ''
      ? ref
      : undefined
  } catch {
    return undefined
  }
}

function parseRangeSelector(input: string): RangeSelector | undefined {
  try {
    const parsed = deserializeRangeWithSheet(input)
    if (parsed.unitId !== '' || parsed.sheetName === '') {
      return undefined
    }
    return {
      ref: input,
      sheetName: parsed.sheetName,
      range: serializeRange(parsed.range)
    }
  } catch {
    return undefined
  }
}
