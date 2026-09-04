import editHistoryLocale from '@univerjs-pro/edit-history-ui/locale/it-IT'
import { LocaleType } from '@univerjs/core'
import { createComparisonSemanticMessages } from '../semantic-labels.js'
import type { IUnitComparisonViewerMessages } from '../types.js'

const semantic = createComparisonSemanticMessages(LocaleType.IT_IT, editHistoryLocale)

export const itITUnitComparisonViewerMessages = {
  changes: 'modifica',
  structuralDiff: 'Confronta · Contenuto',
  kind: {
    insert: 'Inserito',
    delete: 'Eliminato',
    update: 'Modificato'
  },
  entity: semantic.entity,
  entityAt: (entityType, index) => semantic.entity(entityType) + ' ' + String(index),
  changePath: semantic.changePath,
  changeValue: semantic.changeValue,
  renderFailed: 'Impossibile visualizzare la cartella di lavoro',
  itemCount: (count) => String(count) + ' Elemento',
  propertyCount: (count) => String(count) + ' Proprietà',
  moved: 'Spostato',
  rightCurrentVersion: 'Destra · versione corrente',
  revision: (revision) => 'Revisione ' + String(revision),
  readOnly: 'Sola lettura',
  side: {
    left: 'Sinistra',
    right: 'Destra'
  },
  changeCount: (count) => String(count) + ' modifica',
  changedSlides: 'modifica · file',
  changedBaseTables: 'modifica · Tabelle',
  noRawTableChanges: 'nessuno Tabelle modifica',
  rawTableData: 'Tabelle · Contenuto',
  baseAlignmentHint: 'Righe e colonne sono allineate tramite identificatori stabili',
  checkboxState: {
    checked: 'Selezionato',
    unchecked: 'Non selezionato'
  },
  comparingMaterializedSnapshots: 'anteprima unione · Confronta',
  snapshot: 'anteprima unione · Confronta',
  noStructuralChanges: 'nessuno modifica',
  notPresent: 'nessuno file',
  workbookTitle: 'Cartella di lavoro · Confronta',
  invalidPayloadTitle: 'Confronta · non riuscito',
  invalidPayloadBody: 'anteprima unione: impossibile',
  summaryUnavailable: 'nessuno Confronta',
  scopeLabel: 'Confronta · Scegli',
  displayModeLabel: 'Confronta · Contenuto',
  worksheet: 'Foglio',
  workbook: 'Cartella di lavoro',
  content: 'Contenuto',
  formatting: 'Formattazione',
  showFormulas: 'Mostra formule',
  searchChanges: 'Cerca modifica',
  noItems: 'nessuno modifica',
  selectItemHint: 'Scegli modifica',
  snapshotUnavailable: 'anteprima unione: impossibile',
  formulaDiff: 'Confronta · Formula',
  baseFormula: 'versione corrente · Formula',
  currentFormula: 'modifica · Formula',
  baseValue: 'versione corrente · Contenuto',
  currentValue: 'modifica · Contenuto',
  base: 'versione corrente',
  current: 'modifica',
  summaryLabel: 'Confronta · modifica',
  sheetTree: {
    categories: {
      chart: 'Grafici',
      cell: 'Celle',
      conditionFormat: 'Formattazioni condizionali',
      dataValidation: 'Convalida dati',
      move: 'Spostamenti',
      pivot: 'Tabelle pivot',
      rowColumn: 'Righe e colonne',
      shape: 'Forme',
      sparkline: 'Sparkline',
      table: 'Tabelle',
      workbook: 'Cartella di lavoro',
      worksheet: 'Foglio'
    },
    emptyText: '(Nessun file aperto)',
    noActiveSheet: 'nessuno Foglio',
    noCompareData: 'nessuno Confronta',
    row: (index) => 'Riga ' + String(index),
    styles: 'Stili',
    workbookRoot: 'Cartella di lavoro',
    titles: {
      insertedRows: 'Inserito Riga',
      deletedRows: 'Eliminato Riga',
      insertedColumns: 'Inserito Colonne',
      deletedColumns: 'Eliminato Colonne',
      rowsMoved: 'Riga · Spostato',
      columnsMoved: 'Colonne · Spostato',
      rowChanged: (index) => 'Riga ' + String(index) + ' · Modificato',
      columnChanged: (index) => 'Colonne ' + String(index) + ' · Modificato',
      sheetAdded: (name) => 'Inserito Foglio: ' + name,
      sheetDeleted: (name) => 'Eliminato Foglio: ' + name,
      sheetRenamed: 'Foglio · Rinominato',
      workbookRenamed: 'Cartella di lavoro · Rinominato'
    }
  }
} satisfies IUnitComparisonViewerMessages
