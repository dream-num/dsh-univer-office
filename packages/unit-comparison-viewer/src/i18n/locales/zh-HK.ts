import editHistoryLocale from '@univerjs-pro/edit-history-ui/locale/zh-HK'
import { LocaleType } from '@univerjs/core'
import { createComparisonSemanticMessages } from '../semantic-labels.js'
import type { IUnitComparisonViewerMessages } from '../types.js'

const semantic = createComparisonSemanticMessages(LocaleType.ZH_HK, editHistoryLocale)

export const zhHKUnitComparisonViewerMessages = {
  changes: '修改',
  structuralDiff: '比較 · 內容',
  kind: {
    insert: '已新增',
    delete: '已刪除',
    update: '已修改'
  },
  entity: semantic.entity,
  entityAt: (entityType, index) => semantic.entity(entityType) + ' ' + String(index),
  changePath: semantic.changePath,
  changeValue: semantic.changeValue,
  renderFailed: '活頁簿轉譯失敗',
  itemCount: (count) => String(count) + ' 項目',
  propertyCount: (count) => String(count) + ' 屬性',
  moved: '已移動',
  rightCurrentVersion: '右側 · 目前版本',
  revision: (revision) => '修訂 ' + String(revision),
  readOnly: '唯讀',
  side: {
    left: '左側',
    right: '右側'
  },
  changeCount: (count) => String(count) + ' 修改',
  changedSlides: '修改 · 檔案',
  changedBaseTables: '修改 · 表格',
  noRawTableChanges: '沒有 表格 修改',
  rawTableData: '表格 · 內容',
  baseAlignmentHint: '列欄按穩定識別碼對齊',
  checkboxState: {
    checked: '已勾選',
    unchecked: '未勾選'
  },
  comparingMaterializedSnapshots: '合併預覽 · 比較',
  snapshot: '合併預覽 · 比較',
  noStructuralChanges: '沒有 修改',
  notPresent: '沒有 檔案',
  workbookTitle: '活頁簿 · 比較',
  invalidPayloadTitle: '比較 · 失敗',
  invalidPayloadBody: '合併預覽: 無法',
  summaryUnavailable: '沒有 比較',
  scopeLabel: '比較 · 請選擇',
  displayModeLabel: '比較 · 內容',
  worksheet: '工作表',
  workbook: '活頁簿',
  content: '內容',
  formatting: '格式',
  showFormulas: '顯示公式',
  searchChanges: '搜尋 修改',
  noItems: '沒有 修改',
  selectItemHint: '請選擇 修改',
  snapshotUnavailable: '合併預覽: 無法',
  formulaDiff: '比較 · 公式',
  baseFormula: '目前版本 · 公式',
  currentFormula: '修改 · 公式',
  baseValue: '目前版本 · 內容',
  currentValue: '修改 · 內容',
  base: '目前版本',
  current: '修改',
  summaryLabel: '比較 · 修改',
  sheetTree: {
    categories: {
      chart: '圖表',
      cell: '儲存格',
      conditionFormat: '條件式格式',
      dataValidation: '資料驗證',
      move: '移動',
      pivot: '樞紐分析表',
      rowColumn: '列與欄',
      shape: '圖形',
      sparkline: '走勢圖',
      table: '表格',
      workbook: '活頁簿',
      worksheet: '工作表'
    },
    emptyText: '(未有開啟的檔案)',
    noActiveSheet: '沒有 工作表',
    noCompareData: '沒有 比較',
    row: (index) => '列 ' + String(index),
    styles: '樣式',
    workbookRoot: '活頁簿',
    titles: {
      insertedRows: '已新增 列',
      deletedRows: '已刪除 列',
      insertedColumns: '已新增 欄',
      deletedColumns: '已刪除 欄',
      rowsMoved: '列 · 已移動',
      columnsMoved: '欄 · 已移動',
      rowChanged: (index) => '列 ' + String(index) + ' · 已修改',
      columnChanged: (index) => '欄 ' + String(index) + ' · 已修改',
      sheetAdded: (name) => '已新增 工作表: ' + name,
      sheetDeleted: (name) => '已刪除 工作表: ' + name,
      sheetRenamed: '工作表 · 已重新命名',
      workbookRenamed: '活頁簿 · 已重新命名'
    }
  }
} satisfies IUnitComparisonViewerMessages
