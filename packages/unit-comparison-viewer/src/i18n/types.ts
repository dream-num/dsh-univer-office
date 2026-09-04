export interface IUnitComparisonViewerMessages {
  readonly changes: string
  readonly structuralDiff: string
  readonly kind: { readonly insert: string; readonly delete: string; readonly update: string }
  readonly entity: (entityType: string) => string
  readonly entityAt: (entityType: string, index: number) => string
  readonly changePath: (path: readonly string[]) => string
  readonly changeValue: (
    entityType: string,
    path: readonly string[],
    value: unknown
  ) => string | undefined
  readonly renderFailed: string
  readonly itemCount: (count: number) => string
  readonly propertyCount: (count: number) => string
  readonly moved: string
  readonly rightCurrentVersion: string
  readonly revision: (revision: number) => string
  readonly readOnly: string
  readonly side: { readonly left: string; readonly right: string }
  readonly changeCount: (count: number) => string
  readonly changedSlides: string
  readonly changedBaseTables: string
  readonly noRawTableChanges: string
  readonly rawTableData: string
  readonly baseAlignmentHint: string
  readonly checkboxState: { readonly checked: string; readonly unchecked: string }
  readonly comparingMaterializedSnapshots: string
  readonly snapshot: string
  readonly noStructuralChanges: string
  readonly notPresent: string
  readonly workbookTitle: string
  readonly invalidPayloadTitle: string
  readonly invalidPayloadBody: string
  readonly summaryUnavailable: string
  readonly scopeLabel: string
  readonly displayModeLabel: string
  readonly worksheet: string
  readonly workbook: string
  readonly content: string
  readonly formatting: string
  readonly showFormulas: string
  readonly searchChanges: string
  readonly noItems: string
  readonly selectItemHint: string
  readonly snapshotUnavailable: string
  readonly formulaDiff: string
  readonly baseFormula: string
  readonly currentFormula: string
  readonly baseValue: string
  readonly currentValue: string
  readonly base: string
  readonly current: string
  readonly summaryLabel: string
  readonly sheetTree: {
    readonly categories: {
      readonly chart: string
      readonly cell: string
      readonly conditionFormat: string
      readonly dataValidation: string
      readonly move: string
      readonly pivot: string
      readonly rowColumn: string
      readonly shape: string
      readonly sparkline: string
      readonly table: string
      readonly workbook: string
      readonly worksheet: string
    }
    readonly emptyText: string
    readonly noActiveSheet: string
    readonly noCompareData: string
    readonly row: (index: number) => string
    readonly styles: string
    readonly workbookRoot: string
    readonly titles: {
      readonly insertedRows: string
      readonly deletedRows: string
      readonly insertedColumns: string
      readonly deletedColumns: string
      readonly rowsMoved: string
      readonly columnsMoved: string
      readonly rowChanged: (index: number) => string
      readonly columnChanged: (index: number) => string
      readonly sheetAdded: (name: string) => string
      readonly sheetDeleted: (name: string) => string
      readonly sheetRenamed: string
      readonly workbookRenamed: string
    }
  }
}

type MessageOverrides<T> = T extends (...args: infer TArgs) => infer TResult
  ? (...args: TArgs) => TResult
  : T extends object
    ? { readonly [TKey in keyof T]?: MessageOverrides<T[TKey]> }
    : T

/** Optional host wording overrides layered over the package-owned locale. */
export type UnitComparisonViewerMessageOverrides = MessageOverrides<IUnitComparisonViewerMessages>

export type UnitComparisonSemanticMessages = Pick<
  IUnitComparisonViewerMessages,
  'changePath' | 'changeValue' | 'entity'
>
