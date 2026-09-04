import editHistoryLocale from '@univerjs-pro/edit-history-ui/locale/fr-FR'
import { LocaleType } from '@univerjs/core'
import { createComparisonSemanticMessages } from '../semantic-labels.js'
import type { IUnitComparisonViewerMessages } from '../types.js'

const semantic = createComparisonSemanticMessages(LocaleType.FR_FR, editHistoryLocale)

export const frFRUnitComparisonViewerMessages = {
  changes: 'modification',
  structuralDiff: 'Comparer · Contenu',
  kind: {
    insert: 'Inséré',
    delete: 'Supprimé',
    update: 'Modifié'
  },
  entity: semantic.entity,
  entityAt: (entityType, index) => semantic.entity(entityType) + ' ' + String(index),
  changePath: semantic.changePath,
  changeValue: semantic.changeValue,
  renderFailed: 'Échec du rendu du classeur',
  itemCount: (count) => String(count) + ' Élément',
  propertyCount: (count) => String(count) + ' Propriété',
  moved: 'Déplacé',
  rightCurrentVersion: 'Droite · version actuelle',
  revision: (revision) => 'Révision ' + String(revision),
  readOnly: 'Lecture seule',
  side: {
    left: 'Gauche',
    right: 'Droite'
  },
  changeCount: (count) => String(count) + ' modification',
  changedSlides: 'modification · fichier',
  changedBaseTables: 'modification · Tableaux',
  noRawTableChanges: 'aucun Tableaux modification',
  rawTableData: 'Tableaux · Contenu',
  baseAlignmentHint: 'Les lignes et colonnes sont alignées par identifiant stable',
  checkboxState: {
    checked: 'Coché',
    unchecked: 'Non coché'
  },
  comparingMaterializedSnapshots: 'aperçu de fusion · Comparer',
  snapshot: 'aperçu de fusion · Comparer',
  noStructuralChanges: 'aucun modification',
  notPresent: 'aucun fichier',
  workbookTitle: 'Classeur · Comparer',
  invalidPayloadTitle: 'Comparer · échoué',
  invalidPayloadBody: 'aperçu de fusion: impossible',
  summaryUnavailable: 'aucun Comparer',
  scopeLabel: 'Comparer · Choisissez',
  displayModeLabel: 'Comparer · Contenu',
  worksheet: 'Feuille',
  workbook: 'Classeur',
  content: 'Contenu',
  formatting: 'Mise en forme',
  showFormulas: 'Afficher les formules',
  searchChanges: 'Rechercher modification',
  noItems: 'aucun modification',
  selectItemHint: 'Choisissez modification',
  snapshotUnavailable: 'aperçu de fusion: impossible',
  formulaDiff: 'Comparer · Formule',
  baseFormula: 'version actuelle · Formule',
  currentFormula: 'modification · Formule',
  baseValue: 'version actuelle · Contenu',
  currentValue: 'modification · Contenu',
  base: 'version actuelle',
  current: 'modification',
  summaryLabel: 'Comparer · modification',
  sheetTree: {
    categories: {
      chart: 'Graphiques',
      cell: 'Cellules',
      conditionFormat: 'Mises en forme conditionnelles',
      dataValidation: 'Validation des données',
      move: 'Déplacements',
      pivot: 'Tableaux croisés dynamiques',
      rowColumn: 'Lignes et colonnes',
      shape: 'Formes',
      sparkline: 'Graphiques sparkline',
      table: 'Tableaux',
      workbook: 'Classeur',
      worksheet: 'Feuille'
    },
    emptyText: '(Aucun fichier ouvert)',
    noActiveSheet: 'aucun Feuille',
    noCompareData: 'aucun Comparer',
    row: (index) => 'Ligne ' + String(index),
    styles: 'Styles',
    workbookRoot: 'Classeur',
    titles: {
      insertedRows: 'Inséré Ligne',
      deletedRows: 'Supprimé Ligne',
      insertedColumns: 'Inséré Colonnes',
      deletedColumns: 'Supprimé Colonnes',
      rowsMoved: 'Ligne · Déplacé',
      columnsMoved: 'Colonnes · Déplacé',
      rowChanged: (index) => 'Ligne ' + String(index) + ' · Modifié',
      columnChanged: (index) => 'Colonnes ' + String(index) + ' · Modifié',
      sheetAdded: (name) => 'Inséré Feuille: ' + name,
      sheetDeleted: (name) => 'Supprimé Feuille: ' + name,
      sheetRenamed: 'Feuille · Renommé',
      workbookRenamed: 'Classeur · Renommé'
    }
  }
} satisfies IUnitComparisonViewerMessages
