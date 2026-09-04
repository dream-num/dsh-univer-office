import editHistoryLocale from '@univerjs-pro/edit-history-ui/locale/en-US'
import { LocaleType } from '@univerjs/core'
import { createComparisonSemanticMessages } from '../semantic-labels.js'
import type { IUnitComparisonViewerMessages } from '../types.js'

const semantic = createComparisonSemanticMessages(LocaleType.EN_US, editHistoryLocale)

export const enUSUnitComparisonViewerMessages = {
  changes: 'Changes',
  structuralDiff: 'Structural diff',
  kind: {
    insert: 'Added',
    delete: 'Deleted',
    update: 'Modified'
  },
  entity: semantic.entity,
  entityAt: (entityType, index) => semantic.entity(entityType) + ' ' + String(index),
  changePath: semantic.changePath,
  changeValue: semantic.changeValue,
  renderFailed: 'Failed to render comparison',
  itemCount: (count) => (count === 1 ? String(count) + ' item' : String(count) + ' items'),
  propertyCount: (count) =>
    count === 1 ? String(count) + ' property' : String(count) + ' properties',
  moved: 'Moved',
  rightCurrentVersion: 'Right · Current version',
  revision: (revision) => 'r' + String(revision),
  readOnly: 'Read only',
  side: {
    left: 'Left',
    right: 'Right'
  },
  changeCount: (count) => String(count) + ' changes',
  changedSlides: 'Changed slides',
  changedBaseTables: 'Changed Base tables',
  noRawTableChanges: 'No raw table data changed.',
  rawTableData: 'Raw table data',
  baseAlignmentHint:
    'Fields and records are aligned by stable ID. Grid, Kanban, Calendar, and other views reuse the same raw-table comparison.',
  checkboxState: {
    checked: 'Checked',
    unchecked: 'Unchecked'
  },
  comparingMaterializedSnapshots: 'Comparing materialized snapshots.',
  snapshot: 'Snapshot comparison',
  noStructuralChanges: 'No structural changes',
  notPresent: 'Not present on this side',
  workbookTitle: 'Workbook comparison',
  invalidPayloadTitle: 'Comparison payload is invalid',
  invalidPayloadBody: 'The target snapshot is missing or cannot be rendered.',
  summaryUnavailable: 'No comparison summary is available.',
  scopeLabel: 'Comparison scope',
  displayModeLabel: 'Comparison display mode',
  worksheet: 'Worksheet',
  workbook: 'Workbook',
  content: 'Content',
  formatting: 'Formatting',
  showFormulas: 'Show formulas',
  searchChanges: 'Search changes',
  noItems: 'No comparison items in this scope.',
  selectItemHint: 'Select a comparison item to inspect the affected sheet content.',
  snapshotUnavailable: 'This snapshot is unavailable for rendering.',
  formulaDiff: 'Formula comparison',
  baseFormula: 'Base formula',
  currentFormula: 'Current formula',
  baseValue: 'Base value',
  currentValue: 'Current value',
  base: 'Base',
  current: 'Current',
  summaryLabel: 'Comparison summary',
  sheetTree: {
    categories: {
      chart: 'Charts',
      cell: 'Cells',
      conditionFormat: 'Conditional formats',
      dataValidation: 'Data validation',
      move: 'Moves',
      pivot: 'Pivots',
      rowColumn: 'Rows and columns',
      shape: 'Shapes',
      sparkline: 'Sparklines',
      table: 'Tables',
      workbook: 'Workbook',
      worksheet: 'Worksheet'
    },
    emptyText: '(empty)',
    noActiveSheet: 'No active sheet',
    noCompareData: 'No comparison data',
    row: (index) => 'Row ' + String(index),
    styles: 'Styles',
    workbookRoot: 'Workbook',
    titles: {
      insertedRows: 'Inserted rows',
      deletedRows: 'Deleted rows',
      insertedColumns: 'Inserted columns',
      deletedColumns: 'Deleted columns',
      rowsMoved: 'Rows moved',
      columnsMoved: 'Columns moved',
      rowChanged: (index) => 'Row ' + String(index) + ' changed',
      columnChanged: (index) => 'Column ' + String(index) + ' changed',
      sheetAdded: (name) => 'Sheet added: ' + name,
      sheetDeleted: (name) => 'Sheet deleted: ' + name,
      sheetRenamed: 'Sheet renamed',
      workbookRenamed: 'Workbook renamed'
    }
  }
} satisfies IUnitComparisonViewerMessages
