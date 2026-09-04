import editHistoryLocale from '@univerjs-pro/edit-history-ui/locale/vi-VN'
import { LocaleType } from '@univerjs/core'
import { createComparisonSemanticMessages } from '../semantic-labels.js'
import type { IUnitComparisonViewerMessages } from '../types.js'

const semantic = createComparisonSemanticMessages(LocaleType.VI_VN, editHistoryLocale)

export const viVNUnitComparisonViewerMessages = {
  changes: 'thay đổi',
  structuralDiff: 'So sánh · Nội dung',
  kind: {
    insert: 'Đã chèn',
    delete: 'Đã xóa',
    update: 'Đã thay đổi'
  },
  entity: semantic.entity,
  entityAt: (entityType, index) => semantic.entity(entityType) + ' ' + String(index),
  changePath: semantic.changePath,
  changeValue: semantic.changeValue,
  renderFailed: 'Không thể hiển thị sổ làm việc',
  itemCount: (count) => String(count) + ' Mục',
  propertyCount: (count) => String(count) + ' Thuộc tính',
  moved: 'Đã di chuyển',
  rightCurrentVersion: 'Phải · phiên bản hiện tại',
  revision: (revision) => 'Bản sửa đổi ' + String(revision),
  readOnly: 'Chỉ đọc',
  side: {
    left: 'Trái',
    right: 'Phải'
  },
  changeCount: (count) => String(count) + ' thay đổi',
  changedSlides: 'thay đổi · tệp',
  changedBaseTables: 'thay đổi · Bảng',
  noRawTableChanges: 'không có Bảng thay đổi',
  rawTableData: 'Bảng · Nội dung',
  baseAlignmentHint: 'Hàng và cột được căn theo định danh ổn định',
  checkboxState: {
    checked: 'Đã chọn',
    unchecked: 'Chưa chọn'
  },
  comparingMaterializedSnapshots: 'xem trước hợp nhất · So sánh',
  snapshot: 'xem trước hợp nhất · So sánh',
  noStructuralChanges: 'không có thay đổi',
  notPresent: 'không có tệp',
  workbookTitle: 'Sổ làm việc · So sánh',
  invalidPayloadTitle: 'So sánh · thất bại',
  invalidPayloadBody: 'xem trước hợp nhất: không thể',
  summaryUnavailable: 'không có So sánh',
  scopeLabel: 'So sánh · Chọn',
  displayModeLabel: 'So sánh · Nội dung',
  worksheet: 'Trang tính',
  workbook: 'Sổ làm việc',
  content: 'Nội dung',
  formatting: 'Định dạng',
  showFormulas: 'Hiển thị công thức',
  searchChanges: 'Tìm kiếm thay đổi',
  noItems: 'không có thay đổi',
  selectItemHint: 'Chọn thay đổi',
  snapshotUnavailable: 'xem trước hợp nhất: không thể',
  formulaDiff: 'So sánh · Công thức',
  baseFormula: 'phiên bản hiện tại · Công thức',
  currentFormula: 'thay đổi · Công thức',
  baseValue: 'phiên bản hiện tại · Nội dung',
  currentValue: 'thay đổi · Nội dung',
  base: 'phiên bản hiện tại',
  current: 'thay đổi',
  summaryLabel: 'So sánh · thay đổi',
  sheetTree: {
    categories: {
      chart: 'Biểu đồ',
      cell: 'Ô',
      conditionFormat: 'Định dạng có điều kiện',
      dataValidation: 'Xác thực dữ liệu',
      move: 'Di chuyển',
      pivot: 'Bảng tổng hợp',
      rowColumn: 'Hàng và cột',
      shape: 'Hình dạng',
      sparkline: 'Đường xu hướng',
      table: 'Bảng',
      workbook: 'Sổ làm việc',
      worksheet: 'Trang tính'
    },
    emptyText: '(Chưa mở tệp)',
    noActiveSheet: 'không có Trang tính',
    noCompareData: 'không có So sánh',
    row: (index) => 'Hàng ' + String(index),
    styles: 'Kiểu',
    workbookRoot: 'Sổ làm việc',
    titles: {
      insertedRows: 'Đã chèn Hàng',
      deletedRows: 'Đã xóa Hàng',
      insertedColumns: 'Đã chèn Cột',
      deletedColumns: 'Đã xóa Cột',
      rowsMoved: 'Hàng · Đã di chuyển',
      columnsMoved: 'Cột · Đã di chuyển',
      rowChanged: (index) => 'Hàng ' + String(index) + ' · Đã thay đổi',
      columnChanged: (index) => 'Cột ' + String(index) + ' · Đã thay đổi',
      sheetAdded: (name) => 'Đã chèn Trang tính: ' + name,
      sheetDeleted: (name) => 'Đã xóa Trang tính: ' + name,
      sheetRenamed: 'Trang tính · Đã đổi tên',
      workbookRenamed: 'Sổ làm việc · Đã đổi tên'
    }
  }
} satisfies IUnitComparisonViewerMessages
