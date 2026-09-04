import editHistoryLocale from '@univerjs-pro/edit-history-ui/locale/pl-PL'
import { LocaleType } from '@univerjs/core'
import { createComparisonSemanticMessages } from '../semantic-labels.js'
import type { IUnitComparisonViewerMessages } from '../types.js'

const semantic = createComparisonSemanticMessages(LocaleType.PL_PL, editHistoryLocale)

export const plPLUnitComparisonViewerMessages = {
  changes: 'zmiana',
  structuralDiff: 'Porównaj · Zawartość',
  kind: {
    insert: 'Wstawiono',
    delete: 'Usunięto',
    update: 'Zmieniono'
  },
  entity: semantic.entity,
  entityAt: (entityType, index) => semantic.entity(entityType) + ' ' + String(index),
  changePath: semantic.changePath,
  changeValue: semantic.changeValue,
  renderFailed: 'Nie udało się wyświetlić skoroszytu',
  itemCount: (count) => String(count) + ' Element',
  propertyCount: (count) => String(count) + ' Właściwość',
  moved: 'Przeniesiono',
  rightCurrentVersion: 'Prawo · bieżąca wersja',
  revision: (revision) => 'Wersja ' + String(revision),
  readOnly: 'Tylko do odczytu',
  side: {
    left: 'Lewo',
    right: 'Prawo'
  },
  changeCount: (count) => String(count) + ' zmiana',
  changedSlides: 'zmiana · plik',
  changedBaseTables: 'zmiana · Tabele',
  noRawTableChanges: 'brak Tabele zmiana',
  rawTableData: 'Tabele · Zawartość',
  baseAlignmentHint: 'Wiersze i kolumny są wyrównane według stałych identyfikatorów',
  checkboxState: {
    checked: 'Zaznaczone',
    unchecked: 'Niezaznaczone'
  },
  comparingMaterializedSnapshots: 'podgląd scalania · Porównaj',
  snapshot: 'podgląd scalania · Porównaj',
  noStructuralChanges: 'brak zmiana',
  notPresent: 'brak plik',
  workbookTitle: 'Skoroszyt · Porównaj',
  invalidPayloadTitle: 'Porównaj · nie powiodło się',
  invalidPayloadBody: 'podgląd scalania: nie można',
  summaryUnavailable: 'brak Porównaj',
  scopeLabel: 'Porównaj · Wybierz',
  displayModeLabel: 'Porównaj · Zawartość',
  worksheet: 'Arkusz',
  workbook: 'Skoroszyt',
  content: 'Zawartość',
  formatting: 'Formatowanie',
  showFormulas: 'Pokaż formuły',
  searchChanges: 'Szukaj zmiana',
  noItems: 'brak zmiana',
  selectItemHint: 'Wybierz zmiana',
  snapshotUnavailable: 'podgląd scalania: nie można',
  formulaDiff: 'Porównaj · Formuła',
  baseFormula: 'bieżąca wersja · Formuła',
  currentFormula: 'zmiana · Formuła',
  baseValue: 'bieżąca wersja · Zawartość',
  currentValue: 'zmiana · Zawartość',
  base: 'bieżąca wersja',
  current: 'zmiana',
  summaryLabel: 'Porównaj · zmiana',
  sheetTree: {
    categories: {
      chart: 'Wykresy',
      cell: 'Komórki',
      conditionFormat: 'Formatowanie warunkowe',
      dataValidation: 'Sprawdzanie poprawności danych',
      move: 'Przeniesienia',
      pivot: 'Tabele przestawne',
      rowColumn: 'Wiersze i kolumny',
      shape: 'Kształty',
      sparkline: 'Wykresy przebiegu w czasie',
      table: 'Tabele',
      workbook: 'Skoroszyt',
      worksheet: 'Arkusz'
    },
    emptyText: '(Nie otwarto pliku)',
    noActiveSheet: 'brak Arkusz',
    noCompareData: 'brak Porównaj',
    row: (index) => 'Wiersz ' + String(index),
    styles: 'Style',
    workbookRoot: 'Skoroszyt',
    titles: {
      insertedRows: 'Wstawiono Wiersz',
      deletedRows: 'Usunięto Wiersz',
      insertedColumns: 'Wstawiono Kolumny',
      deletedColumns: 'Usunięto Kolumny',
      rowsMoved: 'Wiersz · Przeniesiono',
      columnsMoved: 'Kolumny · Przeniesiono',
      rowChanged: (index) => 'Wiersz ' + String(index) + ' · Zmieniono',
      columnChanged: (index) => 'Kolumny ' + String(index) + ' · Zmieniono',
      sheetAdded: (name) => 'Wstawiono Arkusz: ' + name,
      sheetDeleted: (name) => 'Usunięto Arkusz: ' + name,
      sheetRenamed: 'Arkusz · Zmieniono nazwę',
      workbookRenamed: 'Skoroszyt · Zmieniono nazwę'
    }
  }
} satisfies IUnitComparisonViewerMessages
