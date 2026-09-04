import type {
  IBaseSnapshot,
  IDocumentData,
  IWorkbookData,
  LocaleType,
  Univer,
  UniverInstanceType
} from '@univerjs/core'
import type { IBoardData } from '@univerjs-pro/boards'
import type { ISlideData } from '@univerjs-pro/slides'
import type { ReactNode } from 'react'
import type { UnitComparisonViewerMessageOverrides } from './i18n/types.js'

export type UnitComparisonType =
  | UniverInstanceType.UNIVER_DOC
  | UniverInstanceType.UNIVER_SHEET
  | UniverInstanceType.UNIVER_SLIDE
  | UniverInstanceType.UNIVER_BASE
  | UniverInstanceType.UNIVER_BOARD

export type UnitComparisonDiffKind = 'delete' | 'insert' | 'update'

export interface IUnitComparisonChange {
  readonly path: readonly string[]
  readonly sourcePath?: readonly string[]
  readonly kind: UnitComparisonDiffKind
  readonly valueType: string
  readonly before?: unknown
  readonly after?: unknown
  readonly segments?: {
    readonly left: readonly {
      readonly kind: 'delete' | 'equal' | 'insert'
      readonly text: string
    }[]
    readonly right: readonly {
      readonly kind: 'delete' | 'equal' | 'insert'
      readonly text: string
    }[]
  }
}

export type UnitComparisonLocationTarget =
  | {
      readonly kind: 'sheet-axis'
      readonly entityType: string
      readonly stableId: string
      readonly comparisonStableId: string
      readonly parentStableId?: string
      readonly axis: 'column' | 'row'
      readonly start: number
      readonly end: number
    }
  | {
      readonly kind: 'sheet-range'
      readonly entityType: string
      readonly stableId: string
      readonly comparisonStableId: string
      readonly parentStableId?: string
      readonly range?: IUnitComparisonRange
      readonly ranges?: readonly IUnitComparisonRange[]
    }
  | {
      readonly kind: 'base-cell'
      readonly entityType: string
      readonly stableId: string
      readonly comparisonStableId: string
      readonly parentStableId?: string
      readonly tableId: string
      readonly recordId: string
      readonly fieldId: string
    }
  | {
      readonly kind: 'entity'
      readonly entityType: string
      readonly stableId: string
      readonly comparisonStableId: string
      readonly parentStableId?: string
    }

export interface IUnitComparisonRange {
  readonly startRow: number
  readonly endRow: number
  readonly startColumn: number
  readonly endColumn: number
}

export interface IUnitComparisonLocation {
  readonly path: readonly string[]
  readonly stableId: string
  readonly parentStableId?: string
  readonly position?: number | null
  readonly target?: UnitComparisonLocationTarget
}

export interface IUnitComparisonItem {
  readonly id: string
  readonly stableId: string
  readonly parentStableId?: string
  readonly scope?: { readonly entityType: string; readonly stableId: string }
  readonly kind: UnitComparisonDiffKind
  readonly entityType: string
  readonly path: readonly string[]
  readonly title: string
  readonly moved: boolean
  readonly changes: readonly IUnitComparisonChange[]
  readonly details: readonly {
    readonly label: string
    readonly before?: string | null
    readonly after?: string | null
    readonly kind?: UnitComparisonDiffKind | null
  }[]
  readonly locations: {
    readonly left: IUnitComparisonLocation | null
    readonly right: IUnitComparisonLocation | null
  }
  readonly values?: { readonly left?: unknown; readonly right?: unknown }
}

export interface IUnitComparisonAxisAlignment {
  readonly leftStart: number | null
  readonly rightStart: number | null
  readonly count: number
}

export interface IUnitComparisonPage {
  readonly offset: number
  readonly limit: number
  readonly matched: number
  readonly hasMore: boolean
}

export interface IUnitComparisonDocAlignmentRow {
  readonly id: string
  readonly stableId: string
  readonly kind: 'delete' | 'equal' | 'insert' | 'update'
  readonly moved: boolean
  readonly leftIndex: number | null
  readonly rightIndex: number | null
  readonly leftNativeStableId: string | null
  readonly rightNativeStableId: string | null
  readonly segmentPath?: readonly string[]
}

export type UnitComparisonProductContext =
  | {
      readonly kind: 'sheet'
      readonly sheets: readonly {
        readonly id: string
        readonly name: string
        readonly status: UnitComparisonDiffKind | 'unchanged'
        readonly changeCount: number
        readonly rows?: readonly IUnitComparisonAxisAlignment[]
        readonly columns?: readonly IUnitComparisonAxisAlignment[]
      }[]
    }
  | {
      readonly kind: 'doc'
      readonly paragraphAlignment: {
        readonly total: number
        readonly page: IUnitComparisonPage
        readonly rows: readonly IUnitComparisonDocAlignmentRow[]
      }
    }
  | { readonly kind: 'slide' }
  | { readonly kind: 'base'; readonly visualProjection: 'raw-table-data' }
  | { readonly kind: 'board' }

export interface IUnitComparisonResult {
  readonly schemaVersion: 1
  readonly comparisonId: string
  readonly unit: {
    readonly unitId: string
    readonly type: UnitComparisonType
    readonly name: string
  }
  readonly fidelity: 'history' | 'snapshot'
  readonly commonBaseRevision?: number
  readonly stale: boolean
  readonly detail: 'summary' | 'changes' | 'full'
  readonly summary: {
    readonly total: number
    readonly insert: number
    readonly delete: number
    readonly update: number
    readonly moved: number
    readonly byEntityType: Readonly<Record<string, number>>
  }
  readonly coverage: { readonly supportedEntityTypes: readonly string[] }
  readonly scopes: readonly {
    readonly entityType: string
    readonly stableId: string
    readonly displayName: string
    readonly kind: UnitComparisonDiffKind
  }[]
  readonly page: IUnitComparisonPage
  readonly items: readonly IUnitComparisonItem[]
  readonly diagnostics: {
    readonly readiness: 'degraded' | 'ready'
    readonly unsupportedMutationIds: readonly string[]
    readonly codes: readonly string[]
  }
  readonly productContext: UnitComparisonProductContext
}

export interface IUnitComparisonViewerProps {
  readonly comparison: UnitComparisonViewerValue
  readonly createUniver: UnitComparisonUniverFactory
  readonly leftHeaderControl?: ReactNode
  readonly locale: LocaleType
  readonly darkMode: boolean
  /** Optional wording overrides layered over the package-owned locale selected by `locale`. */
  readonly messages?: UnitComparisonViewerMessageOverrides
}

export type UnitComparisonUniverFactory = (
  options: IUnitComparisonUniverFactoryOptions
) => Promise<IUnitComparisonUniverInstance>

export interface IUnitComparisonUniverFactoryOptions {
  readonly container: HTMLElement
  readonly unitType: UnitComparisonType
  readonly locale: LocaleType
  readonly darkMode: boolean
}

export interface IUnitComparisonUniverInstance {
  readonly univer: Univer
  dispose(): void
}

interface IUnitComparisonViewerValue<TType extends UnitComparisonType, TData> {
  readonly result: Omit<IUnitComparisonResult, 'unit'> & {
    readonly unit: IUnitComparisonResult['unit'] & { readonly type: TType }
  }
  readonly left: IUnitComparisonViewerSide<TData>
  readonly right: IUnitComparisonViewerSide<TData>
}

export interface IUnitComparisonViewerSide<TData> {
  readonly label: string
  readonly revision?: number
  readonly unitData: TData | null
}

export type UnitComparisonViewerValue =
  | SheetComparisonViewerValue
  | NativeComparisonViewerValue
  | BaseComparisonViewerValue

export type SheetComparisonViewerValue = IUnitComparisonViewerValue<
  UniverInstanceType.UNIVER_SHEET,
  IWorkbookData
>

export type BaseComparisonViewerValue = IUnitComparisonViewerValue<
  UniverInstanceType.UNIVER_BASE,
  IBaseSnapshot
>

export type NativeComparisonViewerValue =
  | IUnitComparisonViewerValue<UniverInstanceType.UNIVER_DOC, IDocumentData>
  | IUnitComparisonViewerValue<UniverInstanceType.UNIVER_SLIDE, ISlideData>
  | IUnitComparisonViewerValue<UniverInstanceType.UNIVER_BOARD, IBoardData>
