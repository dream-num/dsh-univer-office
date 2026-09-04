import editHistoryLocale from '@univerjs-pro/edit-history-ui/locale/es-ES'
import { LocaleType } from '@univerjs/core'
import { createComparisonSemanticMessages } from '../semantic-labels.js'
import type { IUnitComparisonViewerMessages } from '../types.js'

const semantic = createComparisonSemanticMessages(LocaleType.ES_ES, editHistoryLocale)

export const esESUnitComparisonViewerMessages = {
  changes: 'modificación',
  structuralDiff: 'Comparar · Contenido',
  kind: {
    insert: 'Insertado',
    delete: 'Eliminado',
    update: 'Modificado'
  },
  entity: semantic.entity,
  entityAt: (entityType, index) => semantic.entity(entityType) + ' ' + String(index),
  changePath: semantic.changePath,
  changeValue: semantic.changeValue,
  renderFailed: 'No se pudo representar el libro',
  itemCount: (count) => String(count) + ' Elemento',
  propertyCount: (count) => String(count) + ' Propiedad',
  moved: 'Movido',
  rightCurrentVersion: 'Derecha · versión actual',
  revision: (revision) => 'Revisión ' + String(revision),
  readOnly: 'Solo lectura',
  side: {
    left: 'Izquierda',
    right: 'Derecha'
  },
  changeCount: (count) => String(count) + ' modificación',
  changedSlides: 'modificación · archivo',
  changedBaseTables: 'modificación · Tablas',
  noRawTableChanges: 'ninguno Tablas modificación',
  rawTableData: 'Tablas · Contenido',
  baseAlignmentHint: 'Las filas y columnas se alinean por identificador estable',
  checkboxState: {
    checked: 'Marcado',
    unchecked: 'Sin marcar'
  },
  comparingMaterializedSnapshots: 'vista previa de combinación · Comparar',
  snapshot: 'vista previa de combinación · Comparar',
  noStructuralChanges: 'ninguno modificación',
  notPresent: 'ninguno archivo',
  workbookTitle: 'Libro · Comparar',
  invalidPayloadTitle: 'Comparar · falló',
  invalidPayloadBody: 'vista previa de combinación: no se puede',
  summaryUnavailable: 'ninguno Comparar',
  scopeLabel: 'Comparar · Elige',
  displayModeLabel: 'Comparar · Contenido',
  worksheet: 'Hoja',
  workbook: 'Libro',
  content: 'Contenido',
  formatting: 'Formato',
  showFormulas: 'Mostrar fórmulas',
  searchChanges: 'Buscar modificación',
  noItems: 'ninguno modificación',
  selectItemHint: 'Elige modificación',
  snapshotUnavailable: 'vista previa de combinación: no se puede',
  formulaDiff: 'Comparar · Fórmula',
  baseFormula: 'versión actual · Fórmula',
  currentFormula: 'modificación · Fórmula',
  baseValue: 'versión actual · Contenido',
  currentValue: 'modificación · Contenido',
  base: 'versión actual',
  current: 'modificación',
  summaryLabel: 'Comparar · modificación',
  sheetTree: {
    categories: {
      chart: 'Gráficos',
      cell: 'Celdas',
      conditionFormat: 'Formatos condicionales',
      dataValidation: 'Validación de datos',
      move: 'Movimientos',
      pivot: 'Tablas dinámicas',
      rowColumn: 'Filas y columnas',
      shape: 'Formas',
      sparkline: 'Minigráficos',
      table: 'Tablas',
      workbook: 'Libro',
      worksheet: 'Hoja'
    },
    emptyText: '(No hay archivo abierto)',
    noActiveSheet: 'ninguno Hoja',
    noCompareData: 'ninguno Comparar',
    row: (index) => 'Fila ' + String(index),
    styles: 'Estilos',
    workbookRoot: 'Libro',
    titles: {
      insertedRows: 'Insertado Fila',
      deletedRows: 'Eliminado Fila',
      insertedColumns: 'Insertado Columnas',
      deletedColumns: 'Eliminado Columnas',
      rowsMoved: 'Fila · Movido',
      columnsMoved: 'Columnas · Movido',
      rowChanged: (index) => 'Fila ' + String(index) + ' · Modificado',
      columnChanged: (index) => 'Columnas ' + String(index) + ' · Modificado',
      sheetAdded: (name) => 'Insertado Hoja: ' + name,
      sheetDeleted: (name) => 'Eliminado Hoja: ' + name,
      sheetRenamed: 'Hoja · Renombrado',
      workbookRenamed: 'Libro · Renombrado'
    }
  }
} satisfies IUnitComparisonViewerMessages
