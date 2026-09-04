import editHistoryLocale from '@univerjs-pro/edit-history-ui/locale/ca-ES'
import { LocaleType } from '@univerjs/core'
import { createComparisonSemanticMessages } from '../semantic-labels.js'
import type { IUnitComparisonViewerMessages } from '../types.js'

const semantic = createComparisonSemanticMessages(LocaleType.CA_ES, editHistoryLocale)

export const caESUnitComparisonViewerMessages = {
  changes: 'modificació',
  structuralDiff: 'Comparar · Contingut',
  kind: {
    insert: 'Afegit',
    delete: 'Eliminat',
    update: 'Modificat'
  },
  entity: semantic.entity,
  entityAt: (entityType, index) => semantic.entity(entityType) + ' ' + String(index),
  changePath: semantic.changePath,
  changeValue: semantic.changeValue,
  renderFailed: 'No s’ha pogut representar el llibre',
  itemCount: (count) => String(count) + ' Element',
  propertyCount: (count) => String(count) + ' Propietat',
  moved: 'Mogut',
  rightCurrentVersion: 'Dreta · versió actual',
  revision: (revision) => 'Revisió ' + String(revision),
  readOnly: 'Només lectura',
  side: {
    left: 'Esquerra',
    right: 'Dreta'
  },
  changeCount: (count) => String(count) + ' modificació',
  changedSlides: 'modificació · fitxer',
  changedBaseTables: 'modificació · Taules',
  noRawTableChanges: 'cap Taules modificació',
  rawTableData: 'Taules · Contingut',
  baseAlignmentHint: 'Les files i columnes s’alineen per identificadors estables',
  checkboxState: {
    checked: 'Marcat',
    unchecked: 'Sense marcar'
  },
  comparingMaterializedSnapshots: 'previsualització de fusió · Comparar',
  snapshot: 'previsualització de fusió · Comparar',
  noStructuralChanges: 'cap modificació',
  notPresent: 'cap fitxer',
  workbookTitle: 'Llibre de treball · Comparar',
  invalidPayloadTitle: 'Comparar · ha fallat',
  invalidPayloadBody: 'previsualització de fusió: no es pot',
  summaryUnavailable: 'cap Comparar',
  scopeLabel: 'Comparar · Tria',
  displayModeLabel: 'Comparar · Contingut',
  worksheet: 'Full de càlcul',
  workbook: 'Llibre de treball',
  content: 'Contingut',
  formatting: 'Format',
  showFormulas: 'Mostra les fórmules',
  searchChanges: 'Cerca modificació',
  noItems: 'cap modificació',
  selectItemHint: 'Tria modificació',
  snapshotUnavailable: 'previsualització de fusió: no es pot',
  formulaDiff: 'Comparar · Fórmula',
  baseFormula: 'versió actual · Fórmula',
  currentFormula: 'modificació · Fórmula',
  baseValue: 'versió actual · Contingut',
  currentValue: 'modificació · Contingut',
  base: 'versió actual',
  current: 'modificació',
  summaryLabel: 'Comparar · modificació',
  sheetTree: {
    categories: {
      chart: 'Gràfics',
      cell: 'Cel·les',
      conditionFormat: 'Formats condicionals',
      dataValidation: 'Validació de dades',
      move: 'Moviments',
      pivot: 'Taules dinàmiques',
      rowColumn: 'Files i columnes',
      shape: 'Formes',
      sparkline: 'Minigràfics',
      table: 'Taules',
      workbook: 'Llibre de treball',
      worksheet: 'Full de càlcul'
    },
    emptyText: '(No hi ha cap fitxer obert)',
    noActiveSheet: 'cap Full de càlcul',
    noCompareData: 'cap Comparar',
    row: (index) => 'Fila ' + String(index),
    styles: 'Estils',
    workbookRoot: 'Llibre de treball',
    titles: {
      insertedRows: 'Afegit Fila',
      deletedRows: 'Eliminat Fila',
      insertedColumns: 'Afegit Columnes',
      deletedColumns: 'Eliminat Columnes',
      rowsMoved: 'Fila · Mogut',
      columnsMoved: 'Columnes · Mogut',
      rowChanged: (index) => 'Fila ' + String(index) + ' · Modificat',
      columnChanged: (index) => 'Columnes ' + String(index) + ' · Modificat',
      sheetAdded: (name) => 'Afegit Full: ' + name,
      sheetDeleted: (name) => 'Eliminat Full: ' + name,
      sheetRenamed: 'Full · Canviat de nom',
      workbookRenamed: 'Llibre de treball · Canviat de nom'
    }
  }
} satisfies IUnitComparisonViewerMessages
