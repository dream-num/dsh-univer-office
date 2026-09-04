import editHistoryLocale from '@univerjs-pro/edit-history-ui/locale/de-DE'
import { LocaleType } from '@univerjs/core'
import { createComparisonSemanticMessages } from '../semantic-labels.js'
import type { IUnitComparisonViewerMessages } from '../types.js'

const semantic = createComparisonSemanticMessages(LocaleType.DE_DE, editHistoryLocale)

export const deDEUnitComparisonViewerMessages = {
  changes: 'Änderung',
  structuralDiff: 'Vergleichen · Inhalt',
  kind: {
    insert: 'Eingefügt',
    delete: 'Gelöscht',
    update: 'Geändert'
  },
  entity: semantic.entity,
  entityAt: (entityType, index) => semantic.entity(entityType) + ' ' + String(index),
  changePath: semantic.changePath,
  changeValue: semantic.changeValue,
  renderFailed: 'Arbeitsmappe konnte nicht dargestellt werden',
  itemCount: (count) => String(count) + ' Element',
  propertyCount: (count) => String(count) + ' Eigenschaft',
  moved: 'Verschoben',
  rightCurrentVersion: 'Rechts · aktuelle Version',
  revision: (revision) => 'Revision ' + String(revision),
  readOnly: 'Schreibgeschützt',
  side: {
    left: 'Links',
    right: 'Rechts'
  },
  changeCount: (count) => String(count) + ' Änderung',
  changedSlides: 'Änderung · Datei',
  changedBaseTables: 'Änderung · Tabellen',
  noRawTableChanges: 'keine Tabellen Änderung',
  rawTableData: 'Tabellen · Inhalt',
  baseAlignmentHint: 'Zeilen und Spalten werden anhand stabiler Kennungen ausgerichtet',
  checkboxState: {
    checked: 'Aktiviert',
    unchecked: 'Nicht aktiviert'
  },
  comparingMaterializedSnapshots: 'Zusammenführungsvorschau · Vergleichen',
  snapshot: 'Zusammenführungsvorschau · Vergleichen',
  noStructuralChanges: 'keine Änderung',
  notPresent: 'keine Datei',
  workbookTitle: 'Arbeitsmappe · Vergleichen',
  invalidPayloadTitle: 'Vergleichen · fehlgeschlagen',
  invalidPayloadBody: 'Zusammenführungsvorschau: nicht möglich',
  summaryUnavailable: 'keine Vergleichen',
  scopeLabel: 'Vergleichen · Wählen Sie',
  displayModeLabel: 'Vergleichen · Inhalt',
  worksheet: 'Arbeitsblatt',
  workbook: 'Arbeitsmappe',
  content: 'Inhalt',
  formatting: 'Formatierung',
  showFormulas: 'Formeln anzeigen',
  searchChanges: 'Suchen Änderung',
  noItems: 'keine Änderung',
  selectItemHint: 'Wählen Sie Änderung',
  snapshotUnavailable: 'Zusammenführungsvorschau: nicht möglich',
  formulaDiff: 'Vergleichen · Formel',
  baseFormula: 'aktuelle Version · Formel',
  currentFormula: 'Änderung · Formel',
  baseValue: 'aktuelle Version · Inhalt',
  currentValue: 'Änderung · Inhalt',
  base: 'aktuelle Version',
  current: 'Änderung',
  summaryLabel: 'Vergleichen · Änderung',
  sheetTree: {
    categories: {
      chart: 'Diagramme',
      cell: 'Zellen',
      conditionFormat: 'Bedingte Formatierungen',
      dataValidation: 'Datenüberprüfung',
      move: 'Verschiebungen',
      pivot: 'Pivot-Tabellen',
      rowColumn: 'Zeilen und Spalten',
      shape: 'Formen',
      sparkline: 'Sparklines',
      table: 'Tabellen',
      workbook: 'Arbeitsmappe',
      worksheet: 'Arbeitsblatt'
    },
    emptyText: '(Keine Datei geöffnet)',
    noActiveSheet: 'keine Arbeitsblatt',
    noCompareData: 'keine Vergleichen',
    row: (index) => 'Zeile ' + String(index),
    styles: 'Stile',
    workbookRoot: 'Arbeitsmappe',
    titles: {
      insertedRows: 'Eingefügt Zeile',
      deletedRows: 'Gelöscht Zeile',
      insertedColumns: 'Eingefügt Spalten',
      deletedColumns: 'Gelöscht Spalten',
      rowsMoved: 'Zeile · Verschoben',
      columnsMoved: 'Spalten · Verschoben',
      rowChanged: (index) => 'Zeile ' + String(index) + ' · Geändert',
      columnChanged: (index) => 'Spalten ' + String(index) + ' · Geändert',
      sheetAdded: (name) => 'Eingefügt Blatt: ' + name,
      sheetDeleted: (name) => 'Gelöscht Blatt: ' + name,
      sheetRenamed: 'Blatt · Umbenannt',
      workbookRenamed: 'Arbeitsmappe · Umbenannt'
    }
  }
} satisfies IUnitComparisonViewerMessages
