import editHistoryLocale from '@univerjs-pro/edit-history-ui/locale/ja-JP'
import { LocaleType } from '@univerjs/core'
import { createComparisonSemanticMessages } from '../semantic-labels.js'
import type { IUnitComparisonViewerMessages } from '../types.js'

const semantic = createComparisonSemanticMessages(LocaleType.JA_JP, editHistoryLocale)

export const jaJPUnitComparisonViewerMessages = {
  changes: '変更',
  structuralDiff: '比較 · 内容',
  kind: {
    insert: '挿入',
    delete: '削除',
    update: '変更'
  },
  entity: semantic.entity,
  entityAt: (entityType, index) => semantic.entity(entityType) + ' ' + String(index),
  changePath: semantic.changePath,
  changeValue: semantic.changeValue,
  renderFailed: 'ブックの描画に失敗しました',
  itemCount: (count) => String(count) + ' 項目',
  propertyCount: (count) => String(count) + ' プロパティ',
  moved: '移動',
  rightCurrentVersion: '右 · 現在のバージョン',
  revision: (revision) => 'リビジョン ' + String(revision),
  readOnly: '読み取り専用',
  side: {
    left: '左',
    right: '右'
  },
  changeCount: (count) => String(count) + ' 変更',
  changedSlides: '変更 · ファイル',
  changedBaseTables: '変更 · テーブル',
  noRawTableChanges: 'なし テーブル 変更',
  rawTableData: 'テーブル · 内容',
  baseAlignmentHint: '行と列は安定した識別子で整列します',
  checkboxState: {
    checked: 'チェック済み',
    unchecked: '未チェック'
  },
  comparingMaterializedSnapshots: 'マージプレビュー · 比較',
  snapshot: 'マージプレビュー · 比較',
  noStructuralChanges: 'なし 変更',
  notPresent: 'なし ファイル',
  workbookTitle: 'ブック · 比較',
  invalidPayloadTitle: '比較 · 失敗',
  invalidPayloadBody: 'マージプレビュー: できません',
  summaryUnavailable: 'なし 比較',
  scopeLabel: '比較 · 選択',
  displayModeLabel: '比較 · 内容',
  worksheet: 'ワークシート',
  workbook: 'ブック',
  content: '内容',
  formatting: '書式',
  showFormulas: '数式を表示',
  searchChanges: '検索 変更',
  noItems: 'なし 変更',
  selectItemHint: '選択 変更',
  snapshotUnavailable: 'マージプレビュー: できません',
  formulaDiff: '比較 · 数式',
  baseFormula: '現在のバージョン · 数式',
  currentFormula: '変更 · 数式',
  baseValue: '現在のバージョン · 内容',
  currentValue: '変更 · 内容',
  base: '現在のバージョン',
  current: '変更',
  summaryLabel: '比較 · 変更',
  sheetTree: {
    categories: {
      chart: 'グラフ',
      cell: 'セル',
      conditionFormat: '条件付き書式',
      dataValidation: 'データの入力規則',
      move: '移動',
      pivot: 'ピボットテーブル',
      rowColumn: '行と列',
      shape: '図形',
      sparkline: 'スパークライン',
      table: 'テーブル',
      workbook: 'ブック',
      worksheet: 'ワークシート'
    },
    emptyText: '(ファイルが開かれていません)',
    noActiveSheet: 'なし ワークシート',
    noCompareData: 'なし 比較',
    row: (index) => '行 ' + String(index),
    styles: 'スタイル',
    workbookRoot: 'ブック',
    titles: {
      insertedRows: '挿入 行',
      deletedRows: '削除 行',
      insertedColumns: '挿入 列',
      deletedColumns: '削除 列',
      rowsMoved: '行 · 移動',
      columnsMoved: '列 · 移動',
      rowChanged: (index) => '行 ' + String(index) + ' · 変更',
      columnChanged: (index) => '列 ' + String(index) + ' · 変更',
      sheetAdded: (name) => '挿入 シート: ' + name,
      sheetDeleted: (name) => '削除 シート: ' + name,
      sheetRenamed: 'シート · 名前を変更',
      workbookRenamed: 'ブック · 名前を変更'
    }
  }
} satisfies IUnitComparisonViewerMessages
