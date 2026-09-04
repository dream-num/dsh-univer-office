import editHistoryLocale from '@univerjs-pro/edit-history-ui/locale/zh-CN'
import { LocaleType } from '@univerjs/core'
import { createComparisonSemanticMessages } from '../semantic-labels.js'
import type { IUnitComparisonViewerMessages } from '../types.js'

const semantic = createComparisonSemanticMessages(LocaleType.ZH_CN, editHistoryLocale)

export const zhCNUnitComparisonViewerMessages = {
  changes: '差异',
  structuralDiff: '结构差异',
  kind: {
    insert: '新增',
    delete: '删除',
    update: '修改'
  },
  entity: semantic.entity,
  entityAt: (entityType, index) => '第 ' + String(index) + ' 个' + semantic.entity(entityType),
  changePath: semantic.changePath,
  changeValue: semantic.changeValue,
  renderFailed: '对比渲染失败',
  itemCount: (count) => String(count) + ' 项',
  propertyCount: (count) => String(count) + ' 个属性',
  moved: '已移动',
  rightCurrentVersion: '右侧 · 当前版本',
  revision: (revision) => '修订 ' + String(revision),
  readOnly: '只读',
  side: {
    left: '左侧',
    right: '右侧'
  },
  changeCount: (count) => String(count) + ' 处差异',
  changedSlides: '有差异的幻灯片',
  changedBaseTables: '有差异的多维表格',
  noRawTableChanges: '原始表格数据没有差异。',
  rawTableData: '原始表格数据',
  baseAlignmentHint: '字段和记录按稳定 ID 对齐；网格、看板、日历等视图共用同一份原始表格对比。',
  checkboxState: {
    checked: '已勾选',
    unchecked: '未勾选'
  },
  comparingMaterializedSnapshots: '正在对比已应用最新变更的快照。',
  snapshot: '快照对比',
  noStructuralChanges: '没有结构差异',
  notPresent: '此侧不存在',
  workbookTitle: '工作簿对比',
  invalidPayloadTitle: '对比数据无效',
  invalidPayloadBody: '目标快照缺失或无法渲染。',
  summaryUnavailable: '暂无对比摘要。',
  scopeLabel: '对比范围',
  displayModeLabel: '对比显示方式',
  worksheet: '工作表',
  workbook: '工作簿',
  content: '内容',
  formatting: '格式',
  showFormulas: '显示公式',
  searchChanges: '搜索差异',
  noItems: '此范围内没有差异项。',
  selectItemHint: '选择一个差异项，查看受影响的工作表内容。',
  snapshotUnavailable: '此快照暂时无法渲染。',
  formulaDiff: '公式对比',
  baseFormula: '基准公式',
  currentFormula: '当前公式',
  baseValue: '基准值',
  currentValue: '当前值',
  base: '基准',
  current: '当前',
  summaryLabel: '对比摘要',
  sheetTree: {
    categories: {
      chart: '图表',
      cell: '单元格',
      conditionFormat: '条件格式',
      dataValidation: '数据验证',
      move: '移动',
      pivot: '数据透视表',
      rowColumn: '行与列',
      shape: '形状',
      sparkline: '迷你图',
      table: '表格',
      workbook: '工作簿',
      worksheet: '工作表'
    },
    emptyText: '（空）',
    noActiveSheet: '没有活动工作表',
    noCompareData: '没有对比数据',
    row: (index) => '第 ' + String(index) + ' 行',
    styles: '样式',
    workbookRoot: '工作簿',
    titles: {
      insertedRows: '新增行',
      deletedRows: '删除行',
      insertedColumns: '新增列',
      deletedColumns: '删除列',
      rowsMoved: '移动行',
      columnsMoved: '移动列',
      rowChanged: (index) => '第 ' + String(index) + ' 行已修改',
      columnChanged: (index) => '第 ' + String(index) + ' 列已修改',
      sheetAdded: (name) => '新增工作表：' + name,
      sheetDeleted: (name) => '删除工作表：' + name,
      sheetRenamed: '工作表已重命名',
      workbookRenamed: '工作簿已重命名'
    }
  }
} satisfies IUnitComparisonViewerMessages
