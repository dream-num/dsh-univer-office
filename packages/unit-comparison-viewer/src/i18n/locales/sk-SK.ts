import editHistoryLocale from '@univerjs-pro/edit-history-ui/locale/sk-SK'
import { LocaleType } from '@univerjs/core'
import { createComparisonSemanticMessages } from '../semantic-labels.js'
import type { IUnitComparisonViewerMessages } from '../types.js'

const semantic = createComparisonSemanticMessages(LocaleType.SK_SK, editHistoryLocale)

export const skSKUnitComparisonViewerMessages = {
  changes: 'úprava',
  structuralDiff: 'Porovnať · Obsah',
  kind: {
    insert: 'Vložené',
    delete: 'Odstránené',
    update: 'Zmenené'
  },
  entity: semantic.entity,
  entityAt: (entityType, index) => semantic.entity(entityType) + ' ' + String(index),
  changePath: semantic.changePath,
  changeValue: semantic.changeValue,
  renderFailed: 'Zošit sa nepodarilo vykresliť',
  itemCount: (count) => String(count) + ' Položka',
  propertyCount: (count) => String(count) + ' Vlastnosť',
  moved: 'Presunuté',
  rightCurrentVersion: 'Vpravo · aktuálna verzia',
  revision: (revision) => 'Revízia ' + String(revision),
  readOnly: 'Iba na čítanie',
  side: {
    left: 'Vľavo',
    right: 'Vpravo'
  },
  changeCount: (count) => String(count) + ' úprava',
  changedSlides: 'úprava · súbor',
  changedBaseTables: 'úprava · Tabuľky',
  noRawTableChanges: 'žiadne Tabuľky úprava',
  rawTableData: 'Tabuľky · Obsah',
  baseAlignmentHint: 'Riadky a stĺpce sú zarovnané podľa stálych identifikátorov',
  checkboxState: {
    checked: 'Začiarknuté',
    unchecked: 'Nezačiarknuté'
  },
  comparingMaterializedSnapshots: 'ukážka zlúčenia · Porovnať',
  snapshot: 'ukážka zlúčenia · Porovnať',
  noStructuralChanges: 'žiadne úprava',
  notPresent: 'žiadne súbor',
  workbookTitle: 'Zošit · Porovnať',
  invalidPayloadTitle: 'Porovnať · zlyhalo',
  invalidPayloadBody: 'ukážka zlúčenia: nemožno',
  summaryUnavailable: 'žiadne Porovnať',
  scopeLabel: 'Porovnať · Vyberte',
  displayModeLabel: 'Porovnať · Obsah',
  worksheet: 'Hárok',
  workbook: 'Zošit',
  content: 'Obsah',
  formatting: 'Formátovanie',
  showFormulas: 'Zobraziť vzorce',
  searchChanges: 'Hľadať úprava',
  noItems: 'žiadne úprava',
  selectItemHint: 'Vyberte úprava',
  snapshotUnavailable: 'ukážka zlúčenia: nemožno',
  formulaDiff: 'Porovnať · Vzorec',
  baseFormula: 'aktuálna verzia · Vzorec',
  currentFormula: 'úprava · Vzorec',
  baseValue: 'aktuálna verzia · Obsah',
  currentValue: 'úprava · Obsah',
  base: 'aktuálna verzia',
  current: 'úprava',
  summaryLabel: 'Porovnať · úprava',
  sheetTree: {
    categories: {
      chart: 'Grafy',
      cell: 'Bunky',
      conditionFormat: 'Podmienené formátovanie',
      dataValidation: 'Overenie údajov',
      move: 'Presuny',
      pivot: 'Kontingenčné tabuľky',
      rowColumn: 'Riadky a stĺpce',
      shape: 'Tvary',
      sparkline: 'Krivky',
      table: 'Tabuľky',
      workbook: 'Zošit',
      worksheet: 'Hárok'
    },
    emptyText: '(Nie je otvorený žiadny súbor)',
    noActiveSheet: 'žiadne Hárok',
    noCompareData: 'žiadne Porovnať',
    row: (index) => 'Riadok ' + String(index),
    styles: 'Štýly',
    workbookRoot: 'Zošit',
    titles: {
      insertedRows: 'Vložené Riadok',
      deletedRows: 'Odstránené Riadok',
      insertedColumns: 'Vložené Stĺpce',
      deletedColumns: 'Odstránené Stĺpce',
      rowsMoved: 'Riadok · Presunuté',
      columnsMoved: 'Stĺpce · Presunuté',
      rowChanged: (index) => 'Riadok ' + String(index) + ' · Zmenené',
      columnChanged: (index) => 'Stĺpce ' + String(index) + ' · Zmenené',
      sheetAdded: (name) => 'Vložené Hárok: ' + name,
      sheetDeleted: (name) => 'Odstránené Hárok: ' + name,
      sheetRenamed: 'Hárok · Premenované',
      workbookRenamed: 'Zošit · Premenované'
    }
  }
} satisfies IUnitComparisonViewerMessages
