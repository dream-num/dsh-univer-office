/** Formula-bar state derived for one side of the Sheet comparison. */
export interface WorkbookComparePaneFxState {
  readonly activeCellLabel: string
  readonly displayValue: string
  readonly formula: string
  readonly selectionLabel: string
}

export type WorkbookCompareFxDiffContentKind = 'formula' | 'value' | null

export interface WorkbookCompareFxDiffSegment {
  readonly kind: 'delete' | 'equal' | 'insert'
  text: string
}

export interface WorkbookCompareFxDiffPane {
  readonly kind: WorkbookCompareFxDiffContentKind
  readonly segments: readonly WorkbookCompareFxDiffSegment[] | null
  readonly text: string
}
