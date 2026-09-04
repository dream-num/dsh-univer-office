import editHistoryLocale from '@univerjs-pro/edit-history-ui/locale/ru-RU'
import { LocaleType } from '@univerjs/core'
import { createComparisonSemanticMessages } from '../semantic-labels.js'
import type { IUnitComparisonViewerMessages } from '../types.js'

const semantic = createComparisonSemanticMessages(LocaleType.RU_RU, editHistoryLocale)

export const ruRUUnitComparisonViewerMessages = {
  changes: 'изменение',
  structuralDiff: 'Сравнить · Содержимое',
  kind: {
    insert: 'Добавлено',
    delete: 'Удалено',
    update: 'Изменено'
  },
  entity: semantic.entity,
  entityAt: (entityType, index) => semantic.entity(entityType) + ' ' + String(index),
  changePath: semantic.changePath,
  changeValue: semantic.changeValue,
  renderFailed: 'Не удалось отобразить книгу',
  itemCount: (count) => String(count) + ' Элемент',
  propertyCount: (count) => String(count) + ' Свойство',
  moved: 'Перемещено',
  rightCurrentVersion: 'Справа · текущая версия',
  revision: (revision) => 'Редакция ' + String(revision),
  readOnly: 'Только чтение',
  side: {
    left: 'Слева',
    right: 'Справа'
  },
  changeCount: (count) => String(count) + ' изменение',
  changedSlides: 'изменение · файл',
  changedBaseTables: 'изменение · Таблицы',
  noRawTableChanges: 'нет Таблицы изменение',
  rawTableData: 'Таблицы · Содержимое',
  baseAlignmentHint: 'Строки и столбцы выровнены по стабильным идентификаторам',
  checkboxState: {
    checked: 'Отмечено',
    unchecked: 'Не отмечено'
  },
  comparingMaterializedSnapshots: 'предпросмотр слияния · Сравнить',
  snapshot: 'предпросмотр слияния · Сравнить',
  noStructuralChanges: 'нет изменение',
  notPresent: 'нет файл',
  workbookTitle: 'Книга · Сравнить',
  invalidPayloadTitle: 'Сравнить · не удалось',
  invalidPayloadBody: 'предпросмотр слияния: невозможно',
  summaryUnavailable: 'нет Сравнить',
  scopeLabel: 'Сравнить · Выберите',
  displayModeLabel: 'Сравнить · Содержимое',
  worksheet: 'Лист',
  workbook: 'Книга',
  content: 'Содержимое',
  formatting: 'Форматирование',
  showFormulas: 'Показать формулы',
  searchChanges: 'Поиск изменение',
  noItems: 'нет изменение',
  selectItemHint: 'Выберите изменение',
  snapshotUnavailable: 'предпросмотр слияния: невозможно',
  formulaDiff: 'Сравнить · Формула',
  baseFormula: 'текущая версия · Формула',
  currentFormula: 'изменение · Формула',
  baseValue: 'текущая версия · Содержимое',
  currentValue: 'изменение · Содержимое',
  base: 'текущая версия',
  current: 'изменение',
  summaryLabel: 'Сравнить · изменение',
  sheetTree: {
    categories: {
      chart: 'Диаграммы',
      cell: 'Ячейки',
      conditionFormat: 'Условное форматирование',
      dataValidation: 'Проверка данных',
      move: 'Перемещения',
      pivot: 'Сводные таблицы',
      rowColumn: 'Строки и столбцы',
      shape: 'Фигуры',
      sparkline: 'Спарклайны',
      table: 'Таблицы',
      workbook: 'Книга',
      worksheet: 'Лист'
    },
    emptyText: '(Файл не открыт)',
    noActiveSheet: 'нет Лист',
    noCompareData: 'нет Сравнить',
    row: (index) => 'Строка ' + String(index),
    styles: 'Стили',
    workbookRoot: 'Книга',
    titles: {
      insertedRows: 'Добавлено Строка',
      deletedRows: 'Удалено Строка',
      insertedColumns: 'Добавлено Столбцы',
      deletedColumns: 'Удалено Столбцы',
      rowsMoved: 'Строка · Перемещено',
      columnsMoved: 'Столбцы · Перемещено',
      rowChanged: (index) => 'Строка ' + String(index) + ' · Изменено',
      columnChanged: (index) => 'Столбцы ' + String(index) + ' · Изменено',
      sheetAdded: (name) => 'Добавлено Лист: ' + name,
      sheetDeleted: (name) => 'Удалено Лист: ' + name,
      sheetRenamed: 'Лист · Переименовано',
      workbookRenamed: 'Книга · Переименовано'
    }
  }
} satisfies IUnitComparisonViewerMessages
